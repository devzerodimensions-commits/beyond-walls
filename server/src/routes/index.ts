import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { invalidatePublicCache } from '../lib/publicCache';

import authRoutes from './public/auth.routes';
import catalogRoutes from './public/catalog.routes';
import cartRoutes, { wishlistRouter } from './public/cart.routes';
import contentRoutes from './public/content.routes';
import orderRoutes, { addressRouter } from './public/order.routes';
import webhookRoutes from './public/webhook.routes';

import adminProductRoutes from './admin/products.routes';
import adminContentRoutes from './admin/content.routes';
import adminOperationsRoutes from './admin/operations.routes';
import adminBuilderRoutes from './admin/builder.routes';

const router = Router();

// --- Public API ------------------------------------------------------------
router.use('/auth', authRoutes);
router.use('/catalog', catalogRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRouter);
router.use('/addresses', addressRouter);
router.use('/webhooks', webhookRoutes);
router.use('/', contentRoutes); // /settings, /home, /pages, /faqs, /gallery, /testimonials, /banners, /enquiries
router.use('/', orderRoutes); // /orders, /checkout/*, /payments/*

// --- Admin API (every route below requires an ADMIN token) -----------------
const admin = Router();
admin.use(requireAdmin);
admin.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.once('finish', () => {
      if (res.statusCode < 400) invalidatePublicCache();
    });
  }
  next();
});
admin.use('/products', adminProductRoutes);
admin.use('/builder', adminBuilderRoutes);
admin.use('/', adminContentRoutes);
admin.use('/', adminOperationsRoutes);

router.use('/admin', admin);

export default router;
