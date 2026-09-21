import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';

import { env } from './config/env';
import routes from './routes';
import seoRoutes from './routes/public/seo.routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { ensureUploadDirs } from './middleware/upload';

export function createApp() {
  const app = express();

  ensureUploadDirs();

  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      // Uploaded images are served from this origin and embedded by the SPA.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  /*
   * CORS.
   *
   * In production the site, the admin panel and the API are served from one
   * origin, so CORS_ORIGINS is normally empty. That must not lock the site out
   * of itself: browsers send an `Origin` header on same-origin fetches and on
   * some same-origin subresources, so "no Origin header means same origin" is
   * not true. Same-origin is therefore allowed explicitly, by comparing against
   * the host the request actually arrived on — which needs no configuration and
   * keeps working on a custom domain.
   *
   * A disallowed origin is refused by withholding the CORS headers rather than
   * by throwing. The browser blocks it either way; throwing would turn every
   * such request into a 500 and bury real errors in the log.
   */
  const corsDefaults = {
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-cart-session'],
  };

  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;

      // No Origin header: curl, server-to-server, and plain navigations.
      if (!origin) return callback(null, { ...corsDefaults, origin: true });

      const self = `${req.protocol}://${req.get('host')}`;
      if (origin === self) return callback(null, { ...corsDefaults, origin: true });

      if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
        return callback(null, { ...corsDefaults, origin: true });
      }

      console.warn(`[cors] refused ${origin} (allowed: ${self}${env.corsOrigins.length ? `, ${env.corsOrigins.join(', ')}` : ''})`);
      return callback(null, { ...corsDefaults, origin: false });
    }),
  );

  app.use(compression());
  app.use(cookieParser());
  if (!env.isProduction) app.use(morgan('dev'));

  /**
   * The Razorpay webhook needs its raw body for HMAC verification, so it is
   * mounted before the JSON parser and reads the body itself.
   */
  app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhooks/razorpay') return next();
    return express.json({ limit: '2mb' })(req, res, next);
  });
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use(
    rateLimit({
      windowMs: env.rateLimitWindowMinutes * 60 * 1000,
      max: env.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      /*
       * Webhooks and static uploads must never be throttled. Neither must the
       * health check: a load balancer polling it would eventually be rate
       * limited and take a perfectly healthy server out of rotation.
       */
      skip: (req) =>
        req.path.startsWith('/uploads')
        || req.path.startsWith('/api/webhooks')
        || req.path === '/api/health',
      message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } },
    }),
  );

  // Tighter limit on credential endpoints.
  app.use(
    ['/api/auth/login', '/api/auth/register'],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: env.authRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again in a few minutes.' },
      },
    }),
  );

  /*
   * Static uploads.
   *
   * These are customer-supplied bytes served from our own origin, so they are
   * locked down even though validation already rejects anything executable:
   *  - nosniff stops the browser second-guessing the Content-Type
   *  - a restrictive CSP with a sandbox neutralises any markup that slips through
   *  - unknown extensions are forced to download rather than render
   */
  app.use(
    '/uploads',
    (req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      const ext = path.extname(req.path).toLowerCase();
      const inlineSafe = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.pdf'];
      if (!inlineSafe.includes(ext)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
      next();
    },
    express.static(env.uploadDir, {
      maxAge: env.isProduction ? '30d' : 0,
      fallthrough: true,
      index: false,
      dotfiles: 'deny',
      setHeaders(res, filePath) {
        // Never let a stored file be served as something executable.
        if (/\.(html?|js|mjs|svg|xml|php)$/i.test(filePath)) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment');
        }
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      data: { status: 'ok', env: env.nodeEnv, time: new Date().toISOString() },
    });
  });

  // SEO files at the site root
  app.use('/', seoRoutes);
  app.use('/api', routes);

  // Serve the built SPA in production, so one process hosts site + admin + API.
  // Same origin for the site, the admin panel and the API means the HttpOnly
  // refresh cookie works with SameSite=Strict, and there is no CORS to get wrong.
  if (env.isProduction) {
    const clientDist = env.clientDist;
    if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
      // Better to say so at boot than to serve 404s and look like a routing bug.
      console.warn(
        `[web] no client build at ${clientDist} — the API will run but the site will not be served.
` +
        '      Run "npm run build" in the client workspace, or set CLIENT_DIST.',
      );
    }
    app.use(express.static(clientDist, { index: false, maxAge: '7d' }));
    app.get(/^\/(?!api|uploads).*/, (_req, res, next) => {
      res.sendFile(path.join(clientDist, 'index.html'), (err) => {
        if (err) next();
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
