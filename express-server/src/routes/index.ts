import { Request, Response, Router } from 'express';
import screenshotRoutes from './screenshotRoutes';
import trackingRoutes from './trackingRoutes';
import scanPhoneRoutes from './scanPhoneRoutes';
import checkShopRoutes from './checkShopRoutes';

const router = Router();

// Mount route handlers
router.use('/screenshot', screenshotRoutes);
router.use('/tracking', trackingRoutes);
router.use('/scanPhone', scanPhoneRoutes);
router.use('/checkShop', checkShopRoutes);

// Default API route
router.get('/', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Express API Server is running!',
    endpoints: {
      health: '/health',
      screenshot: '/api/v1/screenshot',
      tracking: '/api/v1/tracking',
      scanPhone: '/api/v1/scanPhone',
      checkShop: '/api/v1/checkShop',
    }
  });
});

export default router;