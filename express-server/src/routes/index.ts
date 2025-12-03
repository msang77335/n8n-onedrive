import { Router, Request, Response } from 'express';
import screenshotRoutes from './screenshotRoutes';
import batchScreenshotRoutes from './batchScreenshotRoutes';
import proxyRoutes from './proxyRoutes';
import trackingRoutes from './trackingRoutes';
import jtTrackingRoutes from './jtTrackingRoutes';
import mockScreenshotRoutes from './mockScreenshotRoutes';
import failedProxiesRoutes from './failedProxiesRoutes';

const router = Router();

// Mount route handlers
router.use('/screenshot', screenshotRoutes);
router.use('/batch-screenshot', batchScreenshotRoutes);
router.use('/proxies', proxyRoutes);
router.use('/tracking', trackingRoutes);
router.use('/jt-tracking', jtTrackingRoutes);
router.use('/mock-screenshot', mockScreenshotRoutes);
router.use('/failed-proxies', failedProxiesRoutes);

// Default API route
router.get('/', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Express API Server is running!',
    endpoints: {
      health: '/health',
      screenshot: '/api/v1/screenshot',
      batchScreenshot: '/api/v1/batch-screenshot',
      proxies: '/api/v1/proxies',
      tracking: '/api/v1/tracking',
      jtTracking: '/api/v1/jt-tracking',
      mockScreenshot: '/api/v1/mock-screenshot',
      failedProxies: '/api/v1/failed-proxies'
    }
  });
});

export default router;