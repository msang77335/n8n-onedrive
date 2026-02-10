import { Request, Response, Router } from 'express';
import screenshotRoutes from './screenshotRoutes';

const router = Router();

// Mount route handlers
router.use('/screenshot', screenshotRoutes);

// Default API route
router.get('/', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Express API Server is running!',
    endpoints: {
      health: '/health',
      screenshot: '/api/v1/screenshot',
    }
  });
});

export default router;