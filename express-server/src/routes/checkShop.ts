import { Request, Response, Router } from 'express';
import { PlaywrightBrowserSingleton } from "../helpers/PlaywrightBrowserSingleton";

interface CheckShopRequest {
  url: string;
}

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body as CheckShopRequest;
    console.log(`📍 [SCREENSHOT] Starting screenshot for URL: ${url}`);
    
    const browserContext = await PlaywrightBrowserSingleton.getContext();
    if (!browserContext) {
      throw new Error('Failed to get browser context');
    }

    const page = await browserContext.newPage();

    try {
      page.setDefaultTimeout(90000); // 90 seconds
      console.log(`⏱️ [SCREENSHOT] Default timeout set to 90 seconds`);

      console.log(`🌐 [SCREENSHOT] Navigating to ${url}...`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      console.log(`✅ [SCREENSHOT] Page loaded successfully`);

      console.log(`⏳ [SCREENSHOT] Waiting 15 seconds for content to load...`);
      await new Promise(resolve => setTimeout(resolve, 15000));

    } catch (error: any) {
      console.error(`💥 [SCREENSHOT] Error: ${error.message}`);
      if (page && !page.isClosed()) {
        await page.close().catch(e => console.log('Error closing page:', e));
      }
      throw error;
    }
  } catch (error) {
    console.error('Error in checkShop route:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;