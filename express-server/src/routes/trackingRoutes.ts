import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

/**
 * POST /tracking
 * Returns the tracking HTML page
 */
router.post('/', (req: Request, res: Response): void => {
  try {
    const htmlPath = path.join(__dirname, '../../index.html');
    
    // Check if file exists
    if (!fs.existsSync(htmlPath)) {
      res.status(404).json({
        success: false,
        error: 'Tracking page not found'
      });
      return;
    }

    // Read the HTML file
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    // Set proper content type and send HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error serving tracking page:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load tracking page'
    });
  }
});

/**
 * GET /tracking (optional - for browser access)
 * Returns the tracking HTML page
 */
router.get('/', (req: Request, res: Response): void => {
  try {
    const htmlPath = path.join(__dirname, '../../index.html');
    
    if (!fs.existsSync(htmlPath)) {
      res.status(404).json({
        success: false,
        error: 'Tracking page not found'
      });
      return;
    }

    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error serving tracking page:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load tracking page'
    });
  }
});

export default router;
