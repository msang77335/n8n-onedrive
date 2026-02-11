import { Solver } from '@2captcha/captcha-solver';
import fs from 'node:fs';
import path from 'node:path';
import { PlaywrightBrowserSingleton } from './PlaywrightBrowserSingleton';

export async function viettelPostScreenshoter(code?: string): Promise<{ status: string; buffer: Buffer }> {
  const resp = await getTrackingData(code);
  console.log(`📦 [VIETTEL POST] Full API response:`, JSON.stringify(resp, null, 2));

  if (String(resp?.data?.error) === 'true') {
    console.log(`❌ [SCREENSHOT] Viettel Post API returned error for codes: ${code}`);
    throw new Error('Viettel Post API returned an error');
  }

  // Extract the first order data from nested structure
  const orderData = resp?.data?.[0] || resp?.data || {};
  console.log(`📦 [VIETTEL POST] Extracted order data:`, JSON.stringify(orderData, null, 2));

  // Extract and map status
  const rawStatus = orderData.TRANGTHAI || 'UNKNOWN';
  const status = rawStatus === 'Giao thành công' ? 'DELIVERED' : rawStatus;

  // Call direct function instead of HTTP request
  const screenshotBuffer = await renderScreenshot(orderData);
  console.log(`✅ [VIETTEL POST] Screenshot rendered, size: ${screenshotBuffer.length} bytes`);
    
  return { status, buffer: screenshotBuffer };
}

async function getTrackingData(code?: string): Promise<any> {
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

async function renderScreenshot(data: any): Promise<Buffer> {
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
            const hasLocationInfo = !firstTracking.RECEIVER_FULLNAME && tenBuuCuc?.includes('Bưu cục');

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