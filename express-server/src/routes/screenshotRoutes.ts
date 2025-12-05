import { Request, Response, Router } from 'express';
import puppeteer from 'puppeteer-extra'
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha'

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

    if (isBestExpress(provider)) {
      const screenshotBuffer = await bestExpressScreenshouter({ provider, codes });
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

async function bestExpressScreenshouter({ provider, codes }: ScreenshotQuery): Promise<Buffer> {
  puppeteer.use(
    RecaptchaPlugin({
      provider: {
        id: '2captcha',
        token: `${process.env.CAPTCHA_API_TOKEN}` // REPLACE THIS WITH YOUR OWN 2CAPTCHA API KEY ⚡
      },
      visualFeedback: true // colorize reCAPTCHAs (violet = detected, green = solved)
    })
  );

  const pwEndpoint = `ws://headless-chrome:${process.env.BROWSERLESS_PORT}?token=${process.env.BROWSERLESS_API_TOKEN}`;
  const browser = await puppeteer.connect({ browserWSEndpoint: pwEndpoint });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 680 });
  await page.goto('https://www.aftership.com/track?c=jtexpress-vn&t=859882419163,859886765769,859887559163,859884882564,859881603267');

  await new Promise(resolve => setTimeout(resolve, 5000));

  // That's it, a single line of code to solve reCAPTCHAs 🎉
  await page.solveRecaptchas();

  await new Promise(resolve => setTimeout(resolve, 10000));

  await page.evaluate(() => {
    (globalThis as any).scrollTo(0, 250);
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  const screenshotBuffer = await page.screenshot({ type: "jpeg", fullPage: false, quality: 100 }) as Buffer;
  await browser.close();

  return screenshotBuffer;
}

export default router;