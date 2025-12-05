import { Request, Response, Router } from 'express';

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

    if(isSPX(provider)) {
      screenshotBuffer = await fetch("http://headless-chrome:3000/screenshot?token=JLIyO58cbu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://spx.com.vn/tra-cuu-don-hang?order_code=${codes}`,
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

export default router;