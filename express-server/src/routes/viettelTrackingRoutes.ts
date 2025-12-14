import { Router, Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';

const router = Router();

// POST /api/v1/viettel-tracking - Return HTML page with dynamic data
router.post('/', (req: Request, res: Response): void => {
  try {
    const data = req.body;
    
    // Read HTML template
    const htmlPath = path.join(__dirname, '../../templates/viettel-tracking.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    
    // Extract data
    const maVanDon = data.MAVANDON || 'N/A';
    const trongLuong = data.TRONG_LUONG || 0;
    const dichVu = data.DICH_VU || 'N/A';
    const nguoiGui = `${data.SENDER_FULLNAME || 'N/A'} - ${data.SENDER_PROVINCE || ''} - ${data.SENDER_DISTRICT || ''}`;
    const nguoiNhan = `${data.RECEIVER_FULLNAME || 'N/A'} - ${data.RECEIVER_PROVINCE || ''} - ${data.RECEIVER_DISTRICT || ''}`;
    const trangThai = data.TRANGTHAI || 'N/A';
    const ngayTao = data.NGAY_GUI ? data.NGAY_GUI.split(' ')[0] : 'N/A';
    const ngayNhanHang = data.NGAY_GUI ? data.NGAY_GUI.split(' ')[0] : 'N/A';
    const ngayGiaoDuKien = data.EXPECTED_TIME || 'N/A';
    
    // Replace placeholders in HTML
    html = html.replace('SHOPEEVTP105591977', maVanDon);
    html = html.replace('>500<', `>${trongLuong}<`);
    html = html.replace('SAN TMDT BAY', dichVu);
    html = html.replace('Giấy Hàn Quốc - T.Thái Bình - H.Đông Hưng', nguoiGui);
    html = html.replace('Nguyễn Ngân&lt; - Ninh Bình - HUYỆN GIA VIỄN', nguoiNhan);
    html = html.replace('>Giao thành công<', `>${trangThai}<`);
    
    // Replace dates
    const dates = html.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    if (dates.length >= 3) {
      html = html.replace(dates[0], ngayTao);
      html = html.replace(dates[1], ngayNhanHang);
      html = html.replace(dates[2], ngayGiaoDuKien);
    }
    
    // Build timeline from TRACKING_ORDERS
    let timelineHtml = '';
    if (data.TRACKING_ORDERS && Array.isArray(data.TRACKING_ORDERS)) {
      data.TRACKING_ORDERS.forEach((order: any, index: number) => {
        const statusName = order.STATUS_NAME || 'N/A';
        
        if (order.TRACKINGS && Array.isArray(order.TRACKINGS)) {
          order.TRACKINGS.forEach((tracking: any) => {
            const isActive = index === 0 ? ' active' : '';
            const thoiGian = tracking.THOI_GIAN || 'N/A';
            const noiDung = tracking.NOI_DUNG || '';
            const nguoiNhan = tracking.RECEIVER_FULLNAME ? `Người nhận: ${tracking.RECEIVER_FULLNAME}` : '';
            const nhanVienPhat = tracking.NHAN_VIEN_PHAT_DETAIL ? 
              `Nhân viên giao ${tracking.NHAN_VIEN_PHAT_DETAIL.NAME} - ${tracking.NHAN_VIEN_PHAT_DETAIL.PHONE}` : '';
            const tenBuuCuc = tracking.TEN_BUUCUC_DI || tracking.TEN_BUUCUC_DEN || '';
            const sdtBuuCuc = tracking.SDT_BUU_CUC_DI || tracking.SDT_BUU_CUC_DEN || '';
            
            let timelineContent = `${thoiGian}: ${noiDung}`;
            if (nguoiNhan) timelineContent = `${thoiGian}: ${nguoiNhan}`;
            if (nhanVienPhat) timelineContent = `${thoiGian}: ${nhanVienPhat}`;
            if (tenBuuCuc) timelineContent += ` - ${tenBuuCuc}`;
            if (sdtBuuCuc) timelineContent += ` - ${sdtBuuCuc}`;
            
            const showLocationLink = tracking.LATITUDE_BUUCUC && tracking.LONGITUDE_BUUCUC;
            
            timelineHtml += `
      <div class="timeline-item${isActive}">
        <div class="timeline-status">${statusName}</div>
        <div class="timeline-time">${timelineContent}</div>
        ${showLocationLink ? `<a class="timeline-link-red">Thông tin bưu cục
          <img src="/location-v2.png" class="icon-location" alt="" />
        </a>` : ''}
      </div>`;
          });
        }
      });
    }
    
    // Replace timeline section
    const timelineStart = html.indexOf('<div class="timeline-section">');
    const timelineEnd = html.indexOf('</div>\n  </div>\n</body>', timelineStart);
    if (timelineStart !== -1 && timelineEnd !== -1) {
      html = html.substring(0, timelineStart) + 
        `<div class="timeline-section">${timelineHtml}\n    </div>` +
        html.substring(timelineEnd);
    }
    
    res.send(html);
  } catch (error) {
    console.error('Error generating HTML:', error);
    res.status(500).json({ success: false, error: 'Failed to generate HTML' });
  }
});

export default router;
