import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

/**
 * Normalises a public URL: adds https:// when the scheme is missing and strips
 * any trailing slash.
 *
 * These values are concatenated into password reset links, order emails and
 * canonical tags. Several hosting platforms hand out a bare hostname — Render's
 * `fromService property: host` is one — and a link built from that is not a
 * valid absolute URL, so the reset email silently stops working. Fixing it here
 * costs nothing and removes a whole class of "the link does not work" reports.
 */
function siteUrl(key: string, fallback: string): string {
  const raw = optional(key, fallback).trim().replace(/\/+$/, '');
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) return raw;
  console.warn(`[config] ${key}="${raw}" has no scheme — reading it as https://${raw}`);
  return `https://${raw}`;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isProduction: optional('NODE_ENV', 'development') === 'production',
  port: num('PORT', 4000),

  databaseUrl: required('DATABASE_URL', 'postgresql://beyondwalls:beyondwalls@localhost:5432/beyondwalls?schema=public'),

  jwtSecret: required('JWT_SECRET', 'change-me-in-production-access-secret'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'change-me-in-production-refresh-secret'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '15m'),
  jwtRefreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '30d'),

  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  publicSiteUrl: siteUrl('PUBLIC_SITE_URL', 'http://localhost:5173'),
  apiBaseUrl: siteUrl('API_BASE_URL', 'http://localhost:4000'),

  uploadDir: optional('UPLOAD_DIR', path.resolve(process.cwd(), 'uploads')),
  /*
   * Where the built SPA lives. Defaults to ../client/dist relative to the
   * working directory, which is right when the server is started from its own
   * folder. Hosts that start processes from the repository root need it set.
   */
  clientDist: optional('CLIENT_DIST', path.resolve(process.cwd(), '..', 'client', 'dist')),
  maxUploadMb: num('MAX_UPLOAD_MB', 10),
  /*
   * Re-encode uploaded images as WebP and cap their dimensions. On by default;
   * turn it off only to store exactly what was sent, byte for byte.
   */
  optimizeUploads: bool('OPTIMIZE_UPLOADS', true),

  // Razorpay — the secret NEVER leaves the server.
  razorpayKeyId: optional('RAZORPAY_KEY_ID'),
  razorpayKeySecret: optional('RAZORPAY_KEY_SECRET'),
  razorpayWebhookSecret: optional('RAZORPAY_WEBHOOK_SECRET'),
  razorpayCurrency: optional('RAZORPAY_CURRENCY', 'INR'),

  /* No defaults: a default administrator password is a published one. The
     seed refuses to run without both -- see server/prisma/seed.ts. */
  seedAdminEmail: optional('SEED_ADMIN_EMAIL'),
  seedAdminPassword: optional('SEED_ADMIN_PASSWORD'),
  seedAdminName: optional('SEED_ADMIN_NAME', 'Beyond Walls Admin'),

  rateLimitWindowMinutes: num('RATE_LIMIT_WINDOW_MINUTES', 15),
  rateLimitMax: num('RATE_LIMIT_MAX', 600),
  /*
   * Sign-in and registration attempts per IP per window. Deliberately separate
   * and much tighter than the general limit, but configurable: a shop, an
   * office or a whole mobile carrier can sit behind one address, and the
   * default would lock all of them out together.
   */
  authRateLimitMax: num('AUTH_RATE_LIMIT_MAX', 30),
  trustProxy: bool('TRUST_PROXY', false),

  // --- Transactional email (optional; logs instead of sending when unset) ---
  smtpHost: optional('SMTP_HOST'),
  smtpPort: num('SMTP_PORT', 587),
  smtpUser: optional('SMTP_USER'),
  smtpPassword: optional('SMTP_PASSWORD'),
  smtpFrom: optional('SMTP_FROM'),
  /** Where enquiry notifications go. Falls back to the contact email setting. */
  adminNotificationEmail: optional('ADMIN_NOTIFICATION_EMAIL'),

  // --- Courier (Shiprocket; optional, booking is disabled when unset) -------
  /**
   * Point this at the sandbox while testing. The sandbox has its own
   * credentials, so the host and the login have to change together — which is
   * why the base URL is a setting rather than a flag.
   */
  shiprocketBaseUrl: optional('SHIPROCKET_BASE_URL', 'https://apiv2.shiprocket.in'),
  shiprocketEmail: optional('SHIPROCKET_EMAIL'),
  shiprocketPassword: optional('SHIPROCKET_PASSWORD'),
  /** The pickup location's nickname, exactly as Shiprocket spells it. */
  shiprocketPickupLocation: optional('SHIPROCKET_PICKUP_LOCATION', 'work'),
  /** Where parcels leave from. Used for rate and serviceability checks. */
  shiprocketPickupPincode: optional('SHIPROCKET_PICKUP_PINCODE', '380001'),
  /**
   * The shared secret on tracking callbacks, sent as x-api-key. Without it the
   * webhook is refused outright rather than trusted: anyone who learns the URL
   * could otherwise mark an order delivered.
   */
  shiprocketWebhookToken: optional('SHIPROCKET_WEBHOOK_TOKEN'),
  /** Fallbacks for a product with no weight or size recorded yet. */
  shipmentDefaultWeightKg: num('SHIPMENT_DEFAULT_WEIGHT_KG', 0.5),
  shipmentDefaultLengthCm: num('SHIPMENT_DEFAULT_LENGTH_CM', 25),
  shipmentDefaultBreadthCm: num('SHIPMENT_DEFAULT_BREADTH_CM', 20),
  shipmentDefaultHeightCm: num('SHIPMENT_DEFAULT_HEIGHT_CM', 5),

  // --- File storage --------------------------------------------------------
  /** local | s3 | r2 | cloudinary */
  storageDriver: optional('STORAGE_DRIVER', 'local'),
  s3Bucket: optional('S3_BUCKET'),
  s3Region: optional('S3_REGION', 'auto'),
  s3AccessKeyId: optional('S3_ACCESS_KEY_ID'),
  s3SecretAccessKey: optional('S3_SECRET_ACCESS_KEY'),
  /** Set for Cloudflare R2 or any S3-compatible endpoint. */
  s3Endpoint: optional('S3_ENDPOINT'),
  /** Public base URL that fronts the bucket (CDN or r2.dev). */
  s3PublicUrl: optional('S3_PUBLIC_URL'),
  cloudinaryCloudName: optional('CLOUDINARY_CLOUD_NAME'),
  cloudinaryApiKey: optional('CLOUDINARY_API_KEY'),
  cloudinaryApiSecret: optional('CLOUDINARY_API_SECRET'),

  /** Minutes a password reset link stays valid. */
  passwordResetTtlMinutes: num('PASSWORD_RESET_TTL_MINUTES', 30),
};

export const razorpayConfigured = Boolean(env.razorpayKeyId && env.razorpayKeySecret);
