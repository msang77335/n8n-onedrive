import { Request, Response, Router } from 'express';
import screenshotRoutes from './screenshotRoutes';
import viettelTrackingRoutes from './viettelTrackingRoutes';
import checkShopRoutes from './checkShop';

const router = Router();

// Mount route handlers
router.use('/screenshot', screenshotRoutes);
router.use('/viettel-tracking', viettelTrackingRoutes);
router.use('/check-shop', checkShopRoutes);

// Default API route
router.get('/', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Express API Server is running!',
    endpoints: {
      health: '/health',
      screenshot: '/api/v1/screenshot',
      viettelTracking: '/api/v1/viettel-tracking',
      checkShop: '/api/v1/check-shop',
    }
  });
});

export default router;