import { Request, Response, Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// GET /api/v1/failed-proxies - Get failed proxies log
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const logFile = path.join(__dirname, '../../logs/failed-proxies.txt');
    
    // Check if file exists
    if (!fs.existsSync(logFile)) {
      res.json({
        success: true,
        data: [],
        message: 'No failed proxies logged yet'
      });
      return;
    }
    
    // Read file content
    const content = fs.readFileSync(logFile, 'utf8');
    
    // Parse lines into structured data
    const lines = content.trim().split('\n').filter(line => line.trim());
    const failedProxies = lines.map(line => {
      const match = line.match(/^(.+?) - (.+?) \((.+?)\) - Error: (.+)$/);
      if (match) {
        return {
          timestamp: match[1],
          proxyName: match[2],
          proxyServer: match[3],
          error: match[4]
        };
      }
      return { raw: line };
    });
    
    res.json({
      success: true,
      data: failedProxies,
      totalCount: failedProxies.length
    });
    
  } catch (error: any) {
    console.error(`💥 [FAILED-PROXIES] Error reading log file:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to read failed proxies log',
      message: error.message
    });
  }
});

export default router;
