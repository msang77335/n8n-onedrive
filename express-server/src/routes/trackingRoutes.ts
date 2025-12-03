import { Router, Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';

const router = Router();

// Define types
interface Checkpoint {
  slug: string;
  created_at: string;
  message: string;
  address: {
    city: string | null;
    country: string | null;
    raw_location: string;
  };
  status: string;
  date_time: string;
}

interface TrackingData {
  tracking: {
    delivery_date: string;
    checkpoints: Checkpoint[];
    courier: {
      name: string;
      slug: string;
      phone: string;
      web_url: string;
    };
    delivery_days: number;
    courier_origin_address: {
      city: string | null;
      raw_location: string;
    };
    courier_destination_address: {
      city: string | null;
      raw_location: string;
    };
    latest_status: string;
    tracking_number: string;
  };
  tracking_number: string;
}

// Helper function to format date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = date.getHours() >= 12 ? 'pm' : 'am';
  const displayHours = date.getHours() % 12 || 12;
  
  return `${month} ${day} ${year} ${displayHours}:${minutes} ${ampm}`;
};

// Helper function to format delivery date
const formatDeliveryDate = (dateString: string): string => {
  const date = new Date(dateString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} (${days[date.getDay()]})`;
};

// Helper function to format short date
const formatShortDate = (dateString: string): string => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * POST /tracking
 * Returns the tracking HTML page with dynamic data
 */
router.post('/', (req: Request, res: Response): void => {
  try {
    const htmlPath = path.join(__dirname, '../../index.html');
    
    // Check if file exists
    if (!fs.existsSync(htmlPath)) {
      res.status(404).json({
        success: false,
        error: 'Tracking page not found'
      });
      return;
    }

    // Read the HTML file
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    // Get tracking data from request body
    const trackingData = req.body as TrackingData;
    
    if (trackingData?.tracking) {
      const { tracking, tracking_number } = trackingData;
      const { checkpoints, courier, delivery_date, delivery_days, courier_origin_address, courier_destination_address, latest_status } = tracking;
      
      // Replace tracking number
      htmlContent = htmlContent.split('859858474695').join(tracking_number || '859858474695');
      
      // Replace courier name
      if (courier?.name) {
        htmlContent = htmlContent.split('J&T Express Vietnam').join(courier.name);
      }
      
      // Replace delivery status
      const statusText = latest_status === 'Delivered' ? 'Delivered' : latest_status;
      const deliveryDateFormatted = delivery_date ? formatDeliveryDate(delivery_date) : 'Nov 23, 2025 (Sun)';
      htmlContent = htmlContent.split('Delivered • Delivery date: Nov 23, 2025 (Sun)').join(
        `${statusText} • Delivery date: ${deliveryDateFormatted}`
      );
      
      // Replace origin and destination
      const origin = courier_origin_address?.city || 'Unknown';
      const destination = courier_destination_address?.city || 'Unknown';
      htmlContent = htmlContent.split('Unknown to Unknown').join(
        `${origin} to ${destination}`
      );
      
      // Replace transit days
      if (delivery_days !== undefined) {
        const daysText = delivery_days === 1 ? 'day' : 'days';
        htmlContent = htmlContent.split('Transit in 2 day').join(`Transit in ${delivery_days} ${daysText}`);
      }
      
      // Replace header delivery info
      if (checkpoints && checkpoints.length > 0) {
        const latestCheckpoint = checkpoints.at(-1)!;
        const shortDate = formatShortDate(latestCheckpoint.date_time);
        const messagePreview = latestCheckpoint.message.substring(0, 50);
        htmlContent = htmlContent.split('23/11/2025 11:05 Đơn đã ký nhận, Người ký nhận là: [Mai...]').join(
          `${shortDate} ${messagePreview}...`
        );
      }
      
      // Build timeline HTML
      if (checkpoints && checkpoints.length > 0) {
        const reversedCheckpoints = [...checkpoints].reverse();
        const timelineItems = reversedCheckpoints.map((checkpoint: Checkpoint, index: number) => {
          const formattedDate = formatDate(checkpoint.date_time);
          const location = checkpoint.address?.city || checkpoint.address?.raw_location || 'Unknown location';
          
          return `
                <div class="timeline-item">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content">
                        <div class="timeline-title">${checkpoint.message}</div>
                        <div class="timeline-time">${formattedDate} • ${location}</div>
                    </div>
                </div>`;
        }).join('\n');
        
        // Replace timeline section
        const timelineRegex = /<div class="timeline">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div class="actions">/;
        htmlContent = htmlContent.replace(
          timelineRegex,
          `<div class="timeline">\n${timelineItems}\n            </div>\n        </div>\n\n        <div class="actions">`
        );
      }
    }
    
    // Set proper content type and send HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error serving tracking page:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load tracking page',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /tracking (optional - for browser access)
 * Returns the tracking HTML page
 */
router.get('/', (req: Request, res: Response): void => {
  try {
    const htmlPath = path.join(__dirname, '../../index.html');
    
    if (!fs.existsSync(htmlPath)) {
      res.status(404).json({
        success: false,
        error: 'Tracking page not found'
      });
      return;
    }

    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error serving tracking page:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load tracking page'
    });
  }
});

export default router;
