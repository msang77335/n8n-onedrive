import { Router, Request, Response } from 'express';
import screenshotRoutes from './screenshotRoutes';
import batchScreenshotRoutes from './batchScreenshotRoutes';
import proxyRoutes from './proxyRoutes';
import trackingRoutes from './trackingRoutes';

const router = Router();

// Mount route handlers
router.use('/screenshot', screenshotRoutes);
router.use('/batch-screenshot', batchScreenshotRoutes);
router.use('/proxies', proxyRoutes);
router.use('/tracking', trackingRoutes);

// Default API route
router.get('/', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Express API Server is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      screenshot: '/api/v1/screenshot',
      batchScreenshot: '/api/v1/batch-screenshot',
      proxies: '/api/v1/proxies',
      tracking: '/api/v1/tracking'
    }
  });
});

export default router;