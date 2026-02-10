import { Request, Response, Router } from 'express';
import screenshotRoutes from './screenshotRoutes';
import viettelTrackingRoutes from './viettelTrackingRoutes';

const router = Router();

// Mount route handlers
router.use('/screenshot', screenshotRoutes);
router.use('/viettel-tracking', viettelTrackingRoutes);

// Default API route
router.get('/', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Express API Server is running!',
    endpoints: {
      health: '/health',
      screenshot: '/api/v1/screenshot',
      viettelTracking: '/api/v1/viettel-tracking',
    }
  });
});

export default router;