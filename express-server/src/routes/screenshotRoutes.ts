import { Request, Response, Router } from 'express';
import puppeteer from 'puppeteer-extra';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BrowserSingleton } from '../helpers/BrowserSingleton';

function isViettelPost(providerStr: string) {
  const upperStr = providerStr.toUpperCase();
  return upperStr.includes('VIETTEL POST') || upperStr.includes('VTP - HÀNG CỒNG KỀNH');
}

function isVietnamePost(providerStr: string) {
  const upperStr = providerStr.toUpperCase();
  return upperStr.includes('VN-POST') || upperStr.includes('VIETNAME POST');
}

function isSPX(providerStr: string) {
  return providerStr.toUpperCase().includes('SPX');
}

function isGiaoHangNhanh(providerStr: string) {
  return providerStr.toUpperCase().includes('GIAO HÀNG NHANH') || providerStr.toUpperCase().includes('GHN');
}

function isJTExpress(providerStr: string) {
  return providerStr.toUpperCase().includes('J&T') || providerStr.toUpperCase().includes('JT EXPRESS');
}

function isBestExpress(providerStr: string) {
  return providerStr.toUpperCase().includes('BEST EXPRESS');
}

const router = Router();

interface ScreenshotQuery {
  provider?: string;
  codes?: string;
}

// POST /api/v1/screenshot - Take screenshot and return image
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  console.log(`🚀 [SCREENSHOT] Starting screenshot request at ${new Date().toISOString()}`);
  try {
    const {
      provider,
      codes,
    }: ScreenshotQuery = req.body;

    if (!provider || !codes) {
      console.log(`❌ [SCREENSHOT] Missing provider or codes parameter`);
      res.status(400).json({
        success: false,
        error: 'Provider and codes are required'
      });
      return;
    }

    let screenshotBuffer = null;

    if (isGiaoHangNhanh(provider)) {
      screenshotBuffer = await fetch("http://headless-chrome:3000/screenshot?token=JLIyO58cbu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://donhang.ghn.vn/?order_code=GYUB9HNC",
          options: {
            fullPage: false
          },
          viewport: {
            width: 1280,
            height: 920
          },
          waitForTimeout: 10000
        })
      })
    }

    if (isSPX(provider)) {
      screenshotBuffer = await fetch("http://headless-chrome:3000/screenshot?token=JLIyO58cbu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://spx.vn/track?${codes}`,
          options: {
            fullPage: false
          },
          viewport: {
            width: 1280,
            height: 920
          },
          waitForTimeout: 10000
        })
      })
    }

    if (isJTExpress(provider)) {
      const screenshotBuffer = await jtexpressScreenshouter({ provider, codes });
      res.set({
        'Content-Type': 'image/png',
        'Content-Length': screenshotBuffer.length.toString(),
        'Content-Disposition': `inline; filename="screenshot.png"`
      });
      res.send(screenshotBuffer);
      return;
    }

    if (!screenshotBuffer?.ok) {
      throw new Error(`Got non-ok response from GHN API:\n` + (await screenshotBuffer?.text()));
    }

    const imageBuffer = Buffer.from(await screenshotBuffer.arrayBuffer());
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': imageBuffer.length.toString(),
      'Content-Disposition': `inline; filename="screenshot.png"`
    });
    res.send(imageBuffer);
  } catch (error: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.error(`💥 [SCREENSHOT] Error occurred after ${duration}ms:`, error);
    console.error(`💥 [SCREENSHOT] Error stack:`, error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to take screenshot',
      message: error.message,
      duration: `${duration}ms`
    });
  }
});

async function jtexpressScreenshouter({ codes }: ScreenshotQuery): Promise<Buffer> {
  // Apply stealth plugin to bypass Cloudflare detection
  puppeteer.use(StealthPlugin());
  
  puppeteer.use(
    RecaptchaPlugin({
      provider: {
        id: '2captcha',
        token: `${process.env.CAPTCHA_API_TOKEN}` // REPLACE THIS WITH YOUR OWN 2CAPTCHA API KEY ⚡
      },
      visualFeedback: true // colorize reCAPTCHAs (violet = detected, green = solved)
    })
  );

  const browser = await BrowserSingleton.getInstance();
  const page = await browser.newPage();
  
  // Set a realistic viewport
  await page.setViewport({ width: 1280, height: 1024 });

  // Set extra headers to appear more human-like
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  });
  
  console.log(`📍 [JT EXPRESS] Navigating to aftership.com for tracking: ${codes}`);
  
  // Navigate with networkidle2 to ensure page is loaded
  await page.goto(`https://www.aftership.com/track?c=jtexpress-vn&t=${codes}`, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for either content to load or Cloudflare challenge
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Check if Cloudflare challenge is present
  const hasCloudflare = await page.evaluate(() => {
    return (globalThis as any)?.document.body.innerText.includes('Verify you are human') || 
           (globalThis as any)?.document.body.innerText.includes('Checking your browser') ||
           (globalThis as any)?.document.title.includes('Just a moment');
  });

  if (hasCloudflare) {
    console.log(`🔐 [JT EXPRESS] Cloudflare challenge detected, waiting for bypass...`);
    // Wait longer for Cloudflare to resolve
    await new Promise(resolve => setTimeout(resolve, 15000));
  }

  // Try to solve any reCAPTCHAs present
  try {
    await page.solveRecaptchas();
    console.log(`✅ [JT EXPRESS] ReCAPTCHA solved`);
  } catch (e) {
    console.log(`⚠️ [JT EXPRESS] No reCAPTCHA found or failed to solve`);
    console.error(e);
  }

  // Wait for tracking content to appear
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log(`📸 [JT EXPRESS] Taking screenshot...`);
  const screenshotBuffer = await page.screenshot({ 
    type: "jpeg", 
    fullPage: false, 
    quality: 100,
    clip: {
      x: 0,
      y: 0,
      width: 1280,
      height: 1024
    }
  }) as Buffer;
  
  await page.close();
  console.log(`✅ [JT EXPRESS] Screenshot completed successfully`);

  return screenshotBuffer;
}

export default router;