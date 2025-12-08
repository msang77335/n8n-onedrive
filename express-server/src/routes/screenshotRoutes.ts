import { Request, Response, Router } from 'express';
import puppeteer from 'puppeteer-extra';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BrowserSingleton } from '../helpers/BrowserSingleton';

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
      screenshotBuffer = await jtexpressScreenshouter({ provider, codes });
      res.set({
        'Content-Type': 'image/png',
        'Content-Length': screenshotBuffer.length.toString(),
        'Content-Disposition': `inline; filename="screenshot.png"`
      });
      res.send(screenshotBuffer);
      return;
    }

    if (isBestExpress(provider)) {
      screenshotBuffer = await isBestExpressScreenshouter({ provider, codes });
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': screenshotBuffer.length.toString(),
        'Content-Disposition': `inline; filename="screenshot.jpg"`
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
  console.log(`📍 [J&T EXPRESS] Starting screenshot for tracking: ${codes}`);
  const browser = await BrowserSingleton.getInstance();
  puppeteer.use(StealthPlugin());
  puppeteer.use(
    RecaptchaPlugin({
      provider: {
        id: '2captcha',
        token: `${process.env.CAPTCHA_API_TOKEN}`
      },
      visualFeedback: true
    })
  );

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1024 });
  await page.goto(`https://www.aftership.com/track?c=jtexpress-vn&t=${codes}`);

  await new Promise(resolve => setTimeout(resolve, 5000));

  // // That's it, a single line of code to solve reCAPTCHAs 🎉
  await page.solveRecaptchas();

  await new Promise(resolve => setTimeout(resolve, 10000));

  await new Promise(resolve => setTimeout(resolve, 10000));

  const screenshotBuffer = await page.screenshot({ type: "jpeg", fullPage: false, quality: 100 }) as Buffer;
  await browser.close();

  return screenshotBuffer;
}

async function isBestExpressScreenshouter({ codes }: ScreenshotQuery): Promise<Buffer> {
  console.log(`📍 [BEST EXPRESS] Starting screenshot for tracking: ${codes}`);

  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  const graphql = JSON.stringify({
    query: "mutation Screenshot($url: String!) { \n    goto(url: $url, waitUntil: load) {status } \n    solve { found solved time} \n    waitForTimeout(time: 15000) { time }\n    screenshot(type: jpeg) {base64 }\n}",
    variables: { "url": `https://www.trackingmore.com/track?number=${codes}&express=best-vn` }
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: graphql
  };

  try {
    console.log(`🌐 [BEST EXPRESS] Calling browserless.io API...`);
    const response = await fetch(
      `https://production-sfo.browserless.io/chromium/bql?token=${process.env.BROWSERLESS_API_TOKEN}`,
      requestOptions
    );

    if (!response.ok) {
      throw new Error(`Browserless API returned status ${response.status}: ${await response.text()}`);
    }

    const result = await response.json() as {
      data?: {
        screenshot?: {
          base64?: string;
        };
      };
    };
    console.log(`📦 [BEST EXPRESS] Received response from browserless.io`);

    if (!result.data?.screenshot?.base64) {
      throw new Error('No screenshot data in response');
    }

    const screenshotBuffer = Buffer.from(result.data.screenshot.base64, 'base64');
    console.log(`✅ [BEST EXPRESS] Screenshot completed successfully, size: ${screenshotBuffer.length} bytes`);

    return screenshotBuffer;
  } catch (error) {
    console.error(`💥 [BEST EXPRESS] Error in isBestExpressScreenshouter:`, error);
    throw error;
  }
}

export default router;