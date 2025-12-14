import { Solver } from '@2captcha/captcha-solver';
import { Request, Response, Router } from 'express';
import { PlaywrightBrowserSingleton } from '../helpers/PlaywrightBrowserSingleton';

const solver = new Solver('43881b2e08166a992dd875d1516716d7');

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

function isViettelPost(providerStr: string) {
  const upperStr = providerStr.toUpperCase();
  return upperStr.includes('VIETTEL POST') || upperStr.includes('VTP');
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
      screenshotBuffer = await screenshoter(`https://donhang.ghn.vn/?order_code=${codes}`);
    }

    if (isSPX(provider)) {
      screenshotBuffer = await screenshoter(`https://spx.vn/track?${codes}`);
    }

    if (isJTExpress(provider)) {
      screenshotBuffer = await jtexpressScreenshouter({ provider, codes });
    }

    if (isBestExpress(provider)) {
      screenshotBuffer = await bestExpressScreenshouter({ codes });
    }

    if (isViettelPost(provider)) {
      const resp = await viettelPostScreenshoter(codes);
      res.status(200).json({
        success: true,
        data: resp
      });
      return;
    }

    if (!screenshotBuffer) {
      console.log(`❌ [SCREENSHOT] Unsupported provider: ${provider}`);
      res.status(400).json({
        success: false,
        error: 'Unsupported provider'
      });
      return;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`✅ [SCREENSHOT] Screenshot completed successfully in ${duration}ms`);

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': screenshotBuffer?.length.toString(),
      'Content-Disposition': `inline; filename="screenshot.jpg"`
    });
    res.send(screenshotBuffer);
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

async function screenshoter(url: string, provider?: string, code?: string): Promise<Buffer> {
  console.log(`📍 [SCREENSHOT] Starting screenshot for URL: ${url}`);
  let page;
  const browserContext = await PlaywrightBrowserSingleton.getContext();
  if (!browserContext) {
    throw new Error('Failed to get browser context');
  }
  try {
    console.log(`🆕 [SCREENSHOT] Creating new page...`);
    page = await browserContext.newPage();

    page.setDefaultTimeout(60000); // 60 seconds
    console.log(`⏱️ [SCREENSHOT] Default timeout set to 60 seconds`);

    console.log(`🌐 [SCREENSHOT] Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle'
    });
    console.log(`✅ [SCREENSHOT] Page loaded successfully`);

    console.log(`⏳ [SCREENSHOT] Waiting 15 seconds for content to load...`);
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log(`📸 [SCREENSHOT] Taking screenshot...`);
    const screenshot = await page.screenshot({ fullPage: false });
    console.log(`✅ [SCREENSHOT] Screenshot captured, size: ${screenshot.length} bytes`);

    console.log(`✨ [SCREENSHOT] All done!`);
    return Buffer.from(screenshot);
  } catch (error) {
    console.error(`💥 [SCREENSHOT] Error in screenshoter:`, error);
    throw error;
  } finally {
    if (page && !page.isClosed()) {
      console.log(`🔒 [SCREENSHOT] Closing page in finally block...`);
      await page.close();
    }
  }
}

async function viettelPostScreenshoter(code?: string): Promise<any> {
  try {
    console.log(`📍 [VIETTEL POST] Solve captcha for code: ${code}`);
    // 1. Solve captcha
    const solverResult = await solver.recaptcha({
      pageurl: 'https://viettelpost.vn/viettelpost-iframe/tra-cuu-hanh-trinh-don-hang-v3-recaptcha',
      googlekey: '6LciQq8eAAAAAIFSqZTSd6P8wrBYoilzdvudW3Nc'
    });
    const captchaToken = solverResult.data;
    console.log(`✅ [VIETTEL POST] CAPTCHA Solved:`, captchaToken?.substring(0, 50) + '...');

    // 2. Prepare headers
    const myHeaders: Record<string, string> = {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,vi;q=0.6",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Content-Type": "application/json",
      "Origin": "https://viettelpost.vn",
      "Pragma": "no-cache",
      "Referer": "https://viettelpost.vn/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      // Cookie có thể không cần nếu không login, nếu cần thì lấy từ browser
    };

    // 3. Prepare body
    const raw = JSON.stringify({
      captcha: captchaToken,
      orders: code
    });

    // 4. Call API
    const response = await fetch("https://api.viettelpost.vn/api/orders/viewTrackingOrders3", {
      method: "POST",
      headers: myHeaders,
      body: raw,
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`ViettelPost API returned status ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log(`✅ [VIETTEL POST] API result:`, result);
    return result;
  } catch (error) {
    console.error(`💥 [VIETTEL POST] Error in viettelPostScreenshoter:`, error);
    throw error;
  }
}

async function jtexpressScreenshouter({ codes }: ScreenshotQuery): Promise<Buffer> {
  console.log(`📍 [J&T EXPRESS] Starting screenshot for tracking: ${codes}`);

  let page;
  const browserContext = await PlaywrightBrowserSingleton.getContext();
  if (!browserContext) {
    throw new Error('Failed to get browser context');
  }
  try {
    console.log(`🆕 [J&T EXPRESS] Creating new page...`);

    page = await browserContext.newPage();

    page.setDefaultTimeout(120000); // 120 seconds
    console.log(`⏱️ [J&T EXPRESS] Default timeout set to 120 seconds`);

    console.log(`🌐 [J&T EXPRESS] Navigating to aftership.com...`);
    await page.goto(`https://www.aftership.com/track?c=jtexpress-vn&t=${codes}`, {
      waitUntil: 'networkidle'
    });
    console.log(`✅ [J&T EXPRESS] Page loaded successfully`);

    console.log(`🔍 [J&T EXPRESS] Attempting to solve reCAPTCHAs...`);
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

    console.log(`⏳ [J&T EXPRESS] Waiting 15 seconds for content to load...`);
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log(`📸 [J&T EXPRESS] Taking screenshot...`);
    const screenshot = await page.screenshot({ fullPage: false });
    console.log(`✅ [J&T EXPRESS] Screenshot captured, size: ${screenshot.length} bytes`);

    console.log(`✨ [J&T EXPRESS] All done!`);
    return Buffer.from(screenshot);
  } catch (error) {
    console.error(`💥 [J&T EXPRESS] Error in jtexpressScreenshouter:`, error);
    throw error;
  } finally {
    if (page && !page.isClosed()) {
      console.log(`🔒 [J&T EXPRESS] Closing page in finally block...`);
      await page.close();
    }
  }
}

async function bestExpressScreenshouter({ codes }: ScreenshotQuery): Promise<Buffer> {
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