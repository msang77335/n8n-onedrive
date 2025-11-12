import { Router, Request, Response } from 'express';
import screenshotRoutes from './screenshotRoutes';
import proxyRoutes from './proxyRoutes';

const router = Router();

// Mount route handlers
router.use('/screenshot', screenshotRoutes);
router.use('/proxies', proxyRoutes);

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
      proxies: '/api/v1/proxies'
    }
  });
});

export default router;