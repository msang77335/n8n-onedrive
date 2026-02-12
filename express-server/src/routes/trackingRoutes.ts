import { Request, Response, Router } from 'express';
import { isBestExpress, isGiaoHangNhanh, isJTExpress, isSPX, isUSPS, isViettelPost, isVnPost, isYunExpress } from '../helpers';
import { aftershipScreenshouter } from '../helpers/aftershipSreenshouter';
import { screenshoter } from '../helpers/screenshoter';
import { viettelPostScreenshoter } from '../helpers/viettelPostScreenshoter';
import { vnPostScreenshoter } from '../helpers/vnPostScreenshoter';
import { bestExpressScreenshouter } from '../helpers/bestExpressScreenshouter';

const router = Router();

interface TrackingQuery {
  provider?: string;
  codes?: string;
}

// POST /api/v1/tracking - Get tracking image as binary with metadata in headers
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  console.log(`🚀 [TRACKING IMAGE] Starting request at ${new Date().toISOString()}`);

  try {
    const { provider, codes }: TrackingQuery = req.body;

    if (!provider || !codes) {
      console.log(`❌ [TRACKING IMAGE] Missing provider or codes parameter`);
      res.status(400).json({
        success: false,
        error: 'Provider and codes parameters are required'
      });
      return;
    }

    console.log(`📦 [TRACKING IMAGE] Processing ${provider} tracking code: ${codes}`);

    let result: { status: string; buffer: Buffer; };

    // Handle different providers
    if (isViettelPost(provider)) {
      result = await viettelPostScreenshoter(codes);
    } else if (isSPX(provider)) {
      result = await screenshoter(`https://spx.vn/track?${codes}`, provider);
    } else if (isGiaoHangNhanh(provider)) {
      result = await screenshoter(`https://donhang.ghn.vn/?order_code=${codes}`, provider);
    } else if (isYunExpress(provider)) {
      result = await screenshoter(`https://www.yuntrack.com/parcelTracking?id=${codes}`, provider);
    } else if (isJTExpress(provider) || isUSPS(provider)) {
      result = await aftershipScreenshouter({ codes, provider });
    } else if (isVnPost(provider)) {
      result = await vnPostScreenshoter(codes);
    } else if(isBestExpress(provider)) {
      result = await bestExpressScreenshouter(codes);
    } else {
      console.log(`❌ [TRACKING IMAGE] Unsupported provider: ${provider}`);
      res.status(400).json({
        success: false,
        error: `Provider '${provider}' is not supported yet`
      });
      return;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`✅ [TRACKING IMAGE] Completed successfully in ${duration}ms`);
    console.log(`📊 [TRACKING IMAGE] Provider: ${provider}, Status: ${result.status}`);
    console.log(`🖼️ [TRACKING IMAGE] Image size: ${result.buffer.length} bytes`);

    // Set response headers with metadata
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', result.buffer.length.toString());
    res.setHeader('X-Tracking-Status', result.status);
    res.setHeader('X-Processing-Time', `${duration}ms`);

    // Send binary image
    res.send(result.buffer);
  } catch (error: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.error(`💥 [TRACKING IMAGE] Error occurred after ${duration}ms:`, error);
    console.error(`💥 [TRACKING IMAGE] Error stack:`, error.stack);

    res.status(500).json({
      success: false,
      error: 'Failed to get tracking image',
      message: error.message,
      duration: `${duration}ms`
    });
  }
});

export default router;
