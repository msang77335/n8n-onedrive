import { Router, Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { PlaywrightBrowserSingleton } from '../helpers/PlaywrightBrowserSingleton';

const router = Router();

// POST /api/v1/viettel-tracking - Return HTML page with dynamic data
router.post('/', (req: Request, res: Response): void => {
  try {
    const data = req.body;

    // Read HTML template
    const htmlPath = path.join(__dirname, '../../templates/viettel-tracking.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

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
          // Only show first tracking item, with "Xem chi tiết" link if there are more
          const firstTracking = order.TRACKINGS[0];
          const hasMoreItems = order.TRACKINGS.length > 1;

          if (firstTracking) {
            const isActive = index === 0 ? ' active' : '';
            const thoiGian = firstTracking.THOI_GIAN || 'N/A';
            const ghiChu = firstTracking.GHI_CHU || '';
            const noiDung = firstTracking.NOI_DUNG || '';

            // Build timeline content
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

            // Show location link if there's post office info (but not for receiver delivery)
            const tenBuuCuc = firstTracking.TEN_BUUCUC_DI || firstTracking.TEN_BUUCUC_DEN || '';
            const hasLocationInfo = !firstTracking?.RECEIVER_FULLNAME && tenBuuCuc?.includes('Bưu cục');

            timelineHtml += `
      <div class="timeline-item${isActive}">
        <div class="timeline-status">${statusName}</div>
        <div class="timeline-time">${timelineContent}</div>
        ${hasMoreItems ? `<a class="timeline-link">Xem chi tiết đơn hàng</a>` : ''}
        ${hasLocationInfo ? `<a class="timeline-link-red">Thông tin bưu cục
          <img src="/location-v2.png" class="icon-location" alt="" />
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

    res.send(html);
  } catch (error) {
    console.error('Error generating HTML:', error);
    res.status(500).json({ success: false, error: 'Failed to generate HTML' });
  }
});

// POST /api/v1/viettel-tracking/screenshot - Return screenshot as image
router.post('/screenshot', async (req: Request, res: Response): Promise<void> => {
  let page;
  try {
    const data = req.body;

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
    res.set('Content-Type', 'image/png');
    res.send(screenshot);
  } catch (error) {
    console.error('Error generating screenshot:', error);
  } finally {
    if (page) await page.close();
  }
});

export default router;
