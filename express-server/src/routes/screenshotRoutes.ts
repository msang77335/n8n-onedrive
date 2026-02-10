import { Solver } from '@2captcha/captcha-solver';
import { Request, Response, Router } from 'express';
import { PlaywrightBrowserSingleton } from '../helpers/PlaywrightBrowserSingleton';
import path from 'node:path';
import fs from 'node:fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

function USPS(providerStr: string) {
  return providerStr.toUpperCase().includes('USPS');
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

function isViettelPost(providerStr: string) {
  const upperStr = providerStr.toUpperCase();
  return upperStr.includes('VIETTEL POST') || upperStr.includes('VTP');
}

function isVnPost(providerStr: string) {
  const upperStr = providerStr.toUpperCase();
  return upperStr.includes('VN POST') || upperStr.includes('VIETNAM POST');
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

    if (USPS(provider)) {
      screenshotBuffer = await uspsScreenshouter({ codes });
    }

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
      console.log(`📦 [VIETTEL POST] Full API response:`, JSON.stringify(resp, null, 2));

      if (String(resp?.data?.error) === 'true') {
        console.log(`❌ [SCREENSHOT] Viettel Post API returned error for codes: ${codes}`);
        res.status(500).json({
          success: false,
          error: 'Viettel Post API returned an error'
        });
        return;
      }

      // Extract the first order data from nested structure
      const orderData = resp?.data?.[0] || resp?.data || {};
      console.log(`📦 [VIETTEL POST] Extracted order data:`, JSON.stringify(orderData, null, 2));

      // Call direct function instead of HTTP request
      screenshotBuffer = await viettelPostRenderScreenshot(orderData);
      console.log(`✅ [VIETTEL POST] Screenshot rendered, size: ${screenshotBuffer.length} bytes`);
    }

    if (isVnPost(provider)) {
      screenshotBuffer = await vnPostScreenshoter(codes);
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

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🆕 [SCREENSHOT] Creating new page (attempt ${attempt}/${maxRetries})...`);
      page = await browserContext.newPage();

      page.setDefaultTimeout(90000); // 90 seconds
      console.log(`⏱️ [SCREENSHOT] Default timeout set to 90 seconds`);

      console.log(`🌐 [SCREENSHOT] Navigating to ${url}...`);

      // Try with 'domcontentloaded' first (faster, more reliable than 'networkidle')
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
      } catch (gotoError: any) {
        console.log(`⚠️ [SCREENSHOT] Navigation issue: ${gotoError.message}, retrying with 'load'...`);

        // Retry with 'load' if domcontentloaded fails
        await page.goto(url, {
          waitUntil: 'load',
          timeout: 60000
        });
      }

      console.log(`✅ [SCREENSHOT] Page loaded successfully`);

      console.log(`⏳ [SCREENSHOT] Waiting 15 seconds for content to load...`);
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Check if tracking data is present
      console.log(`🔍 [SCREENSHOT] Checking for tracking data...`);
      const hasTrackingData = await page.evaluate(() => {
        const spxHasData = (globalThis as any).document.querySelector('.quick-tracking-search-result');

        const ghnHasData = (globalThis as any).document.querySelector('.order-history-container')?.textContent?.trim().length > 0;

        return spxHasData || ghnHasData;
      });

      if (hasTrackingData) {
        console.log(`✅ [SCREENSHOT] Tracking data found, taking screenshot...`);
        const screenshot = await page.screenshot({ fullPage: false });
        console.log(`✅ [SCREENSHOT] Screenshot captured, size: ${screenshot.length} bytes`);
        console.log(`✨ [SCREENSHOT] All done!`);

        if (page && !page.isClosed()) {
          await page.close().catch(e => console.log('Error closing page:', e));
        }

        return Buffer.from(screenshot);
      } else {
        console.log(`⚠️ [SCREENSHOT] No tracking data found (attempt ${attempt}/${maxRetries})`);

        if (attempt < maxRetries) {
          throw new Error('No tracking data found, will retry');
        } else {
          throw new Error('No tracking data found after all retries');
        }
      }

    } catch (error: any) {
      lastError = error;
      console.error(`💥 [SCREENSHOT] Attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (page && !page.isClosed()) {
        await page.close().catch(e => console.log('Error closing page:', e));
        page = undefined;
      }

      if (attempt < maxRetries) {
        const delay = attempt * 2000; // Exponential backoff
        console.log(`⏳ [SCREENSHOT] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`💥 [SCREENSHOT] All ${maxRetries} attempts failed`);
  throw lastError;
}

async function viettelPostScreenshoter(code?: string): Promise<any> {
  const solver = new Solver(process.env.CAPTCHA_SOLVER_API_KEY || '');
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📍 [VIETTEL POST] Solve captcha for code: ${code} (attempt ${attempt}/${maxRetries})`);
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
      console.log(`🌐 [VIETTEL POST] Calling API...`);
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
    } catch (error: any) {
      lastError = error;
      console.error(`💥 [VIETTEL POST] Attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (attempt < maxRetries) {
        const delay = attempt * 3000; // 3s, 6s, 9s
        console.log(`⏳ [VIETTEL POST] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`💥 [VIETTEL POST] All ${maxRetries} attempts failed`);
  throw lastError || new Error('Failed to fetch ViettelPost tracking data after all retries');
}

async function jtexpressScreenshouter({ codes }: ScreenshotQuery): Promise<Buffer> {
  console.log(`📍 [J&T EXPRESS] Starting screenshot for tracking: ${codes}`);

  let page;
  const browserContext = await PlaywrightBrowserSingleton.getContext();
  if (!browserContext) {
    throw new Error('Failed to get browser context');
  }

  const maxRetries = 3;
  let lastError;

  try {
    console.log(`🆕 [J&T EXPRESS] Creating new page...`);
    page = await browserContext.newPage();
    page.setDefaultTimeout(120000); // 120 seconds
    console.log(`⏱️ [J&T EXPRESS] Default timeout set to 120 seconds`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🌐 [J&T EXPRESS] Navigating to aftership.com (attempt ${attempt}/${maxRetries})...`);
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

        // Check if tracking data is present
        console.log(`🔍 [J&T EXPRESS] Checking for tracking data...`);
        const hasTrackingData = await page.evaluate(() => {
          // Check for tracking information elements
          const trackingInfo = (globalThis as any).document
            .querySelector('#tracking')
            .shadowRoot
            .querySelector('#shipment-result-card');

          // Check for content indicators
          const hasContent = trackingInfo !== null;

          return hasContent;
        });

        if (hasTrackingData) {
          console.log(`✅ [J&T EXPRESS] Tracking data found, taking screenshot...`);
          const screenshot = await page.screenshot({ fullPage: false });
          console.log(`✅ [J&T EXPRESS] Screenshot captured, size: ${screenshot.length} bytes`);
          console.log(`✨ [J&T EXPRESS] All done!`);

          if (page && !page.isClosed()) {
            console.log(`🔒 [J&T EXPRESS] Closing page after success...`);
            await page.close();
          }

          return Buffer.from(screenshot);
        } else {
          console.log(`⚠️ [J&T EXPRESS] No tracking data found (attempt ${attempt}/${maxRetries})`);

          if (attempt < maxRetries) {
            const delay = attempt * 3000; // 3s, 6s, 9s
            console.log(`⏳ [J&T EXPRESS] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw new Error('No tracking data found after all retries');
          }
        }
      } catch (error: any) {
        lastError = error;
        console.error(`💥 [J&T EXPRESS] Attempt ${attempt}/${maxRetries} failed:`, error.message);

        if (attempt < maxRetries) {
          const delay = attempt * 3000;
          console.log(`⏳ [J&T EXPRESS] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`💥 [J&T EXPRESS] All ${maxRetries} attempts failed`);
    throw lastError || new Error('Failed to capture screenshot after all retries');
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

async function viettelPostRenderScreenshot(data: any): Promise<Buffer> {
  let page;
  try {
    // Read HTML template
    const htmlPath = path.join(__dirname, '../../templates/viettel-tracking.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    // Read location icon and convert to base64
    const iconPath = path.join(__dirname, '../../public/location-v2.png');
    const iconBuffer = fs.readFileSync(iconPath);
    const iconBase64 = `data:image/png;base64,${iconBuffer.toString('base64')}`;

    // Extract and format data
    const maVanDon = data.MAVANDON || 'N/A';
    const trongLuong = data.TRONG_LUONG || 0;
    const dichVu = data.DICH_VU || 'N/A';
    const senderInfo = `${data.SENDER_FULLNAME || 'N/A'} - ${data.SENDER_PROVINCE || ''} - ${data.SENDER_DISTRICT || ''}`.trim();
    const receiverInfo = `${data.RECEIVER_FULLNAME || 'N/A'} - ${data.RECEIVER_PROVINCE || ''} - ${data.RECEIVER_DISTRICT || ''}`.trim();
    const trangThai = data.TRANGTHAI || 'N/A';
    const ngayTao = data.NGAY_GUI ? data.NGAY_GUI.split(' ')[0] : 'N/A';
    const ngayNhanHang = data.NGAY_GUI ? data.NGAY_GUI.split(' ')[0] : 'N/A';
    const ngayGiaoDuKien = data.EXPECTED_TIME || 'N/A';

    // Build timeline from TRACKING_ORDERS
    let timelineHtml = '';
    if (data.TRACKING_ORDERS && Array.isArray(data.TRACKING_ORDERS)) {
      data.TRACKING_ORDERS.forEach((order: any, index: number) => {
        const statusName = order.STATUS_NAME || 'N/A';

        if (order.TRACKINGS && Array.isArray(order.TRACKINGS)) {
          const firstTracking = order.TRACKINGS[0];
          const hasMoreItems = order.TRACKINGS.length > 1;

          if (firstTracking) {
            const isActive = index === 0 ? ' active' : '';
            const thoiGian = firstTracking.THOI_GIAN || 'N/A';
            const ghiChu = firstTracking.GHI_CHU || '';
            const noiDung = firstTracking.NOI_DUNG || '';

            let timelineContent = `${thoiGian}: `;

            if (firstTracking.RECEIVER_FULLNAME) {
              timelineContent += `Người nhận: ${firstTracking.RECEIVER_FULLNAME}`;
            } else if (firstTracking.NHAN_VIEN_PHAT_DETAIL) {
              const nvName = firstTracking.NHAN_VIEN_PHAT_DETAIL.NAME || '';
              const nvPhone = firstTracking.NHAN_VIEN_PHAT_DETAIL.PHONE || '';
              timelineContent += `Nhân viên ${ghiChu.toLowerCase()} ${nvName} - ${nvPhone}`;

              const tenBuuCuc = firstTracking.TEN_BUUCUC_DI || firstTracking.TEN_BUUCUC_DEN || '';
              const sdtBuuCuc = firstTracking.SDT_BUU_CUC_DI || firstTracking.SDT_BUU_CUC_DEN || '';
              if (tenBuuCuc) timelineContent += ` - ${tenBuuCuc}`;
              if (sdtBuuCuc) timelineContent += ` - ${sdtBuuCuc}`;
            } else if (noiDung) {
              timelineContent += noiDung;
              const tenBuuCuc = firstTracking.TEN_BUUCUC_DI || firstTracking.TEN_BUUCUC_DEN || '';
              if (tenBuuCuc && !noiDung.includes(tenBuuCuc)) {
                timelineContent += ` - ${tenBuuCuc}`;
              }
            } else {
              timelineContent += ghiChu;
            }

            const tenBuuCuc = firstTracking.TEN_BUUCUC_DI || firstTracking.TEN_BUUCUC_DEN || '';
            const hasLocationInfo = !firstTracking.RECEIVER_FULLNAME && tenBuuCuc && tenBuuCuc.includes('Bưu cục');

            timelineHtml += `
        <div class="timeline-item${isActive}">
          <div class="timeline-status">${statusName}</div>
          <div class="timeline-time">${timelineContent}</div>
          ${hasMoreItems ? `<a class="timeline-link">Xem chi tiết đơn hàng</a>` : ''}
          ${hasLocationInfo ? `<a class="timeline-link-red">Thông tin bưu cục
            <img src="${iconBase64}" class="icon-location" alt="" />
          </a>` : ''}
        </div>`;
          }
        }
      });
    }

    // Replace all placeholders
    html = html.replace('{{MAVANDON}}', maVanDon);
    html = html.replace('{{TRONG_LUONG}}', trongLuong.toString());
    html = html.replace('{{DICH_VU}}', dichVu);
    html = html.replace('{{SENDER_INFO}}', senderInfo);
    html = html.replace('{{RECEIVER_INFO}}', receiverInfo);
    html = html.replace('{{TRANGTHAI}}', trangThai);
    html = html.replace('{{NGAY_TAO}}', ngayTao);
    html = html.replace('{{NGAY_NHAN_HANG}}', ngayNhanHang);
    html = html.replace('{{NGAY_GIAO_DU_KIEN}}', ngayGiaoDuKien);
    html = html.replace('{{TIMELINE_ITEMS}}', timelineHtml);

    const browserContext = await PlaywrightBrowserSingleton.getContext();
    if (!browserContext) {
      throw new Error('Failed to get browser context');
    }

    page = await browserContext.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    await new Promise(resolve => setTimeout(resolve, 10000));

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true
    });

    // Return image
    return Buffer.from(screenshot);
  } catch (error) {
    console.error('Error generating screenshot:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
}

async function vnPostScreenshoter(code?: string): Promise<any> {
  const url = `https://vietnampost.vn/vi`;
  console.log(`📍 [VN POST] Starting screenshot for URL: ${url}`);
  let page;
  const browserContext = await PlaywrightBrowserSingleton.getContext();
  if (!browserContext) {
    throw new Error('Failed to get browser context');
  }

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🆕 [VN POST SCREENSHOT] Creating new page (attempt ${attempt}/${maxRetries})...`);
      page = await browserContext.newPage();

      page.setViewportSize({ width: 1280, height: 1800 });

      page.setDefaultTimeout(90000); // 90 seconds
      console.log(`⏱️ [VN POST SCREENSHOT] Default timeout set to 90 seconds`);
      console.log(`🌐 [VN POST SCREENSHOT] Navigating to ${url}...`);

      // Try with 'domcontentloaded' first (faster, more reliable than 'networkidle')
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
      } catch (gotoError: any) {
        console.log(`⚠️ [VN POST SCREENSHOT] Navigation issue: ${gotoError.message}, retrying with 'load'...`);

        // Retry with 'load' if domcontentloaded fails
        await page.goto(url, {
          waitUntil: 'load',
          timeout: 60000
        });
      }

      console.log(`✅ [VN POST SCREENSHOT] Page loaded successfully`);

      console.log(`⏳ [VN POST SCREENSHOT] Waiting 5 seconds for captcha to load...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Locate and screenshot the captcha
      console.log(`📸 [VN POST SCREENSHOT] Looking for captcha image...`);
      const captchaElement = page.locator('#tra-cuu-captcha');

      let captchaText = '';
      if (await captchaElement.count() > 0) {
        console.log(`✅ [VN POST SCREENSHOT] Captcha found, taking screenshot...`);
        const captchaScreenshot = await captchaElement.screenshot();
        console.log(`✅ [VN POST SCREENSHOT] Captcha screenshot captured, size: ${captchaScreenshot.length} bytes`);

        // Save captcha to logs for debugging
        const logsDir = path.join(__dirname, '../../logs');
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
          console.log(`📁 [VN POST SCREENSHOT] Created logs directory: ${logsDir}`);
        }
        const captchaPath = path.join(logsDir, 'vnpost-captcha.png');
        fs.writeFileSync(captchaPath, captchaScreenshot);
        console.log(`💾 [VN POST SCREENSHOT] Captcha saved to: ${captchaPath}`);

        // Use Gemini to read captcha text
        console.log(`🤖 [VN POST SCREENSHOT] Using Gemini AI to read captcha...`);
        captchaText = await readCaptchaWithGemini(captchaScreenshot);
        console.log(`✅ [VN POST SCREENSHOT] Captcha text extracted: ${captchaText}`);

        // Fill in the captcha input
        console.log(`⌨️ [VN POST SCREENSHOT] Filling captcha input...`);
        const captchaInput = page.locator('input[ng-model="data.dataSearch.captcha"]');
        await captchaInput.waitFor({ state: 'visible', timeout: 10000 });
        await captchaInput.fill(captchaText);

        // Fill in the tracking code
        console.log(`⌨️ [VN POST SCREENSHOT] Filling tracking code: ${code}...`);
        const trackingInput = page.locator('input.input-tracking[ng-model="data.dataSearch.post_code"]');
        await trackingInput.waitFor({ state: 'visible', timeout: 10000 });
        await trackingInput.fill(code || '');

        // Click search button
        console.log(`🔍 [VN POST SCREENSHOT] Clicking search button...`);
        const searchButton = page.locator('button.button-tracking[ng-click="actions.search()"]');
        await searchButton.waitFor({ state: 'visible', timeout: 10000 });
        await searchButton.click();

        console.log(`⏳ [VN POST SCREENSHOT] Waiting 10 seconds for results...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        console.log(`⚠️ [VN POST SCREENSHOT] Captcha element not found`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      // Check if tracking data is present
      console.log(`🔍 [VN POST SCREENSHOT] Checking for tracking data...`);
      const hasTrackingData = await page.evaluate(() => {
        // Check for captcha error message
        const captchaError = (globalThis as any).document.querySelector('span.text-danger');
        if (captchaError?.textContent?.includes('Vui lòng nhập captcha') ||
          captchaError?.textContent?.includes('Captcha không đúng hoặc đã hết hạn')
        ) {
          return false; // Captcha error, need to retry
        }

        // Check for other error messages
        const errorElements = (globalThis as any).document.querySelectorAll('.text-danger, .error-message');
        for (const el of errorElements) {
          if (el.textContent && el.textContent.trim().length > 0) {
            console.log('Error found:', el.textContent);
            return false;
          }
        }

        return true;
      });

      if (hasTrackingData) {
        console.log(`✅ [VN POST SCREENSHOT] Tracking data found, taking screenshot...`);

        // Get viewport size and calculate clip area (skip header ~600px)
        const viewportSize = page.viewportSize();
        const clipOptions = viewportSize ? {
          x: 0,
          y: 600, // Skip header
          width: viewportSize.width,
          height: viewportSize.height - 600 // Don't exceed viewport bounds
        } : undefined;

        console.log(`📐 [VN POST SCREENSHOT] Clip options:`, clipOptions);

        const screenshot = await page.screenshot({
          fullPage: false,
          clip: clipOptions
        });
        console.log(`✅ [VN POST SCREENSHOT] Screenshot captured, size: ${screenshot.length} bytes`);
        console.log(`✨ [VN POST SCREENSHOT] All done!`);

        if (page && !page.isClosed()) {
          await page.close().catch(e => console.log('Error closing page:', e));
        }

        return Buffer.from(screenshot);
      } else {
        console.log(`⚠️ [VN POST SCREENSHOT] No tracking data found (attempt ${attempt}/${maxRetries})`);

        if (attempt < maxRetries) {
          throw new Error('No tracking data found, will retry');
        } else {
          throw new Error('No tracking data found after all retries');
        }
      }

    } catch (error: any) {
      lastError = error;
      console.error(`💥 [VN POST SCREENSHOT] Attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (page && !page.isClosed()) {
        await page.close().catch(e => console.log('Error closing page:', e));
        page = undefined;
      }

      if (attempt < maxRetries) {
        const delay = attempt * 2000; // Exponential backoff
        console.log(`⏳ [VN POST SCREENSHOT] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`💥 [SCREENSHOT] All ${maxRetries} attempts failed`);
  throw lastError;
}

async function readCaptchaWithGemini(imageBuffer: Buffer): Promise<string> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `This is a captcha image. Please extract and return ONLY the text/numbers shown in the captcha. Return just the captcha text without any explanation or additional text.`;

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: 'image/png',
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response;
    const text = response.text().trim();

    console.log(`🤖 [GEMINI] Raw response: ${text}`);

    // Extract only alphanumeric characters (letters and numbers)
    const cleanText = text.replace(/[^a-zA-Z0-9]/g, '');
    console.log(`🧹 [GEMINI] Cleaned text: ${cleanText}`);

    return cleanText;
  } catch (error) {
    console.error(`💥 [GEMINI] Error reading captcha:`, error);
    throw error;
  }
}

async function uspsScreenshouter({ codes }: ScreenshotQuery): Promise<Buffer> {
  console.log(`📍 [USPS] Starting screenshot for tracking: ${codes}`);

  let page;
  const browserContext = await PlaywrightBrowserSingleton.getContext();
  if (!browserContext) {
    throw new Error('Failed to get browser context');
  }

  const maxRetries = 3;
  let lastError;

  try {
    console.log(`🆕 [USPS] Creating new page...`);
    page = await browserContext.newPage();
    page.setViewportSize({ width: 1280, height: 1280 });
    page.setDefaultTimeout(120000); // 120 seconds
    console.log(`⏱️ [USPS] Default timeout set to 120 seconds`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🌐 [USPS] Navigating to aftership.com (attempt ${attempt}/${maxRetries})...`);
        await page.goto(`https://www.aftership.com/track?c=usps-vn&t=${codes}`, {
          waitUntil: 'networkidle'
        });
        console.log(`✅ [USPS] Page loaded successfully`);

        console.log(`🔍 [USPS] Attempting to solve reCAPTCHAs...`);
        const result = await page.solveRecaptchas();
        console.log(`✅ [USPS] reCAPTCHA result:`, {
          captchasFound: result.captchas?.length || 0,
          solutionsCount: result.solutions?.length || 0,
          solvedCount: result.solved?.length || 0,
          hasError: !!result.error
        });

        if (result.error) {
          console.log(`⚠️ [USPS] reCAPTCHA solving error:`, result.error);
        }

        console.log(`⏳ [USPS] Waiting 15 seconds for content to load...`);
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Check if tracking data is present
        console.log(`🔍 [USPS] Checking for tracking data...`);
        const hasTrackingData = await page.evaluate(() => {
          // Check for tracking information elements
          const trackingInfo = (globalThis as any).document
            .querySelector('#tracking')
            .shadowRoot
            .querySelector('#shipment-result-card');

          // Check for content indicators
          const hasContent = trackingInfo !== null;

          return hasContent;
        });

        if (hasTrackingData) {
          console.log(`✅ [USPS] Tracking data found, taking screenshot...`);
          const screenshot = await page.screenshot({ fullPage: false });
          console.log(`✅ [USPS] Screenshot captured, size: ${screenshot.length} bytes`);
          console.log(`✨ [USPS] All done!`);

          if (page && !page.isClosed()) {
            console.log(`🔒 [USPS] Closing page after success...`);
            await page.close();
          }

          return Buffer.from(screenshot);
        } else {
          console.log(`⚠️ [USPS] No tracking data found (attempt ${attempt}/${maxRetries})`);

          if (attempt < maxRetries) {
            const delay = attempt * 3000; // 3s, 6s, 9s
            console.log(`⏳ [USPS] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw new Error('No tracking data found after all retries');
          }
        }
      } catch (error: any) {
        lastError = error;
        console.error(`💥 [USPS] Attempt ${attempt}/${maxRetries} failed:`, error.message);

        if (attempt < maxRetries) {
          const delay = attempt * 3000;
          console.log(`⏳ [USPS] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`💥 [USPS] All ${maxRetries} attempts failed`);
    throw lastError || new Error('Failed to capture screenshot after all retries');
  } catch (error) {
    console.error(`💥 [USPS] Error in uspsScreenshouter:`, error);
    throw error;
  } finally {
    if (page && !page.isClosed()) {
      console.log(`🔒 [USPS] Closing page in finally block...`);
      await page.close();
    }
  }
}

export default router;