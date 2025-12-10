import { Request, Response, Router } from 'express';
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
      screenshotBuffer = await fetch(`http://headless-chrome:${process.env.BROWSERLESS_PORT}/screenshot?token=${process.env.BROWSERLESS_API_TOKEN_LOCAL}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://donhang.ghn.vn/?order_code=${codes}`,
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
      screenshotBuffer = await fetch(`http://headless-chrome:3000/screenshot?token=${process.env.BROWSERLESS_API_TOKEN_LOCAL}`, {
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
      screenshotBuffer = await fetch(`https://hwzp3g4p-3000.asse.devtunnels.ms/api/v1/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          codes
        })
      })
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

  let page;
  const browser = await BrowserSingleton.getInstance();
  try {
    page = await browser.newPage();

    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    await page.setViewport({ width: 1280, height: 1080 });

    console.log(`🌐 [J&T EXPRESS] Navigating to aftership.com...`);
    await page.goto(`https://www.aftership.com/track?c=jtexpress-vn&t=${codes}`, {
      waitUntil: 'networkidle2'
    });

    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log(`🔍 [J&T EXPRESS] Attempting to solve reCAPTCHA...`);
    try {
      const result = await page.solveRecaptchas();
      console.log(`✅ [J&T EXPRESS] reCAPTCHA result:`, {
        captchasFound: result.captchas?.length || 0,
        solutionsCount: result.solutions?.length || 0,
        solvedCount: result.solved?.length || 0,
        hasError: !!result.error
      });

      if (result.error) {
        console.log(`⚠️ [J&T EXPRESS] reCAPTCHA solving error:`, result.error);
      }

      // If we have solutions, the CAPTCHA was sent to solver
      if (result.solutions && result.solutions.length > 0) {
        console.log(`⏳ [J&T EXPRESS] CAPTCHA solution received, waiting for page response...`);

        // Wait a bit for the solution to be submitted
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Create a new page reference after potential reload
        // The old page might be stale/detached
        console.log(`🔄 [J&T EXPRESS] Refreshing page reference...`);
        const pages = await browser.pages();

        // Find the active page (last one or the one that's not closed)
        const activePage = pages.find(p => !p.isClosed() && p.url().includes('aftership.com')) || pages.at(-1);

        if (activePage && activePage !== page) {
          console.log(`✓ [J&T EXPRESS] Switched to active page`);
          page = activePage;
        }

        // Wait for the new page to be ready
        await page.waitForFunction('document.readyState === "complete"', { timeout: 10000 })
          .catch(() => console.log(`⚠️ [J&T EXPRESS] Page readyState check timeout`));
      }
    } catch (captchaError: any) {
      console.log(`⚠️ [J&T EXPRESS] reCAPTCHA solving error:`, captchaError?.message);
    }

    // Extra wait for content to fully load after CAPTCHA
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check if page is still open before screenshot
    if (page.isClosed()) {
      throw new Error('Page was closed before screenshot could be taken');
    }

    // Verify we can still interact with the page
    try {
      await page.evaluate(() => {
        return (globalThis as any).document.readyState;
      });
      console.log(`✓ [J&T EXPRESS] Page is responsive and ready for screenshot`);
    } catch (evalError) {
      console.error(`✗ [J&T EXPRESS] Page became unresponsive:`, evalError);
      throw new Error('Page is not responsive for screenshot');
    }

    console.log(`📸 [J&T EXPRESS] Taking screenshot...`);
    const screenshotBuffer = await page.screenshot({
      type: "jpeg",
      fullPage: false,
      quality: 100
    }) as Buffer;

    console.log(`✅ [J&T EXPRESS] Screenshot completed, size: ${screenshotBuffer.length} bytes`);

    return screenshotBuffer;
  } catch (error) {
    console.error(`💥 [J&T EXPRESS] Error in jtexpressScreenshouter:`, error);
    throw error;
  } finally {
    if (page && !page.isClosed()) {
      await page.close().catch(e => console.error(`⚠️ [J&T EXPRESS] Error closing page:`, e));
    }
  }
}

async function isBestExpressScreenshouter({ codes }: ScreenshotQuery): Promise<Buffer> {
  console.log(`📍 [BEST EXPRESS] Starting screenshot for tracking: ${codes}`);

  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  const graphql = JSON.stringify({
    query: "mutation Screenshot($url: String!) { viewport(width: 1280, height: 720, deviceScaleFactor: 1) { width height deviceScaleFactor } goto(url: $url, waitUntil: load) { status } solve { found solved time } waitForTimeout(time: 15000) { time } screenshot(type: jpeg) { base64 } }",
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