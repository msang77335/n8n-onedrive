import { Page } from 'playwright';
import { isJTExpress, isUSPS, ScreenshotQuery } from ".";
import { PlaywrightBrowserSingleton } from "./PlaywrightBrowserSingleton";

const getTrackingURL = (codes: string, provider: string) => {
  if (isJTExpress(provider)) {
    return `https://www.aftership.com/track?c=jtexpress-vn&t=${codes}`;
  } else if (isUSPS(provider)) {
    return `https://www.aftership.com/track?c=usps-vn&t=${codes}`;
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

async function navigateAndSolveRecaptcha(page: Page, trackingURL: string, attempt: number, maxRetries: number) {
  console.log(`🌐 [AFTERSHIP] Navigating to aftership.com (attempt ${attempt}/${maxRetries})...`);
  await page.goto(trackingURL, {
    waitUntil: 'networkidle'
  });
  console.log(`✅ [AFTERSHIP] Page loaded successfully`);

  console.log(`🔍 [AFTERSHIP] Attempting to solve reCAPTCHAs...`);
  const result = await page.solveRecaptchas();
  console.log(`✅ [AFTERSHIP] reCAPTCHA result:`, {
    captchasFound: result.captchas?.length || 0,
    solutionsCount: result.solutions?.length || 0,
    solvedCount: result.solved?.length || 0,
    hasError: !!result.error
  });

  if (result.error) {
    console.log(`⚠️ [AFTERSHIP] reCAPTCHA solving error:`, result.error);
  }

  console.log(`⏳ [AFTERSHIP] Waiting 15 seconds for content to load...`);
  await new Promise(resolve => setTimeout(resolve, 15000));
}

async function checkTrackingData(page: Page): Promise<boolean> {
  console.log(`🔍 [AFTERSHIP] Checking for tracking data...`);
  return await page.evaluate(() => {
    const trackingElement = (globalThis as any).document.querySelector('#tracking');
    if (!trackingElement?.shadowRoot) {
      return false;
    }

    // Get all shipment items from inside the shadow DOM
    const shipmentElements = trackingElement.shadowRoot.querySelectorAll('.multiShipmentResultItem');

    const trackingNumbers = []
    shipmentElements.forEach((element: any) => {
      // Extract tracking number from the span with class 'whitespace-nowrap overflow-hidden'
      const trackingSpan = element.querySelector('.whitespace-nowrap.overflow-hidden');
      const trackingNumber = trackingSpan ? trackingSpan.textContent.trim() : null;

      if (trackingNumber) {
        trackingNumbers.push(trackingNumber);
      }
    });

    if (trackingNumbers.length === 0) {
      return false;
    }

    let isSomeLoading = false;
    shipmentElements.forEach((element: any) => {
      // Get the HTML content of the entire item
      const html = element.innerHTML;

      const isLoading = /Checking for updates/i.test(html);

      if (isLoading) {
        isSomeLoading = true;
      }
    });

    if (isSomeLoading) {
      return false;
    }

    return true
  });
}

async function getAllShipments(page: Page): Promise<{ status: string }> {
  const shipments = await page.evaluate(() => {
    try {
      // Access the shadow DOM
      const trackingElement = (globalThis as any).document.querySelector('#tracking');
      if (!trackingElement?.shadowRoot) {
        return { shipments: [], totalCount: 0 };
      }

      // Get all shipment items from inside the shadow DOM
      const shipmentElements = trackingElement.shadowRoot.querySelectorAll('.multiShipmentResultItem');

      interface ShipmentResult {
        trackingNumber: string;
        status: 'delivered' | 'unknown';
      }

      const results: ShipmentResult[] = [];

      shipmentElements.forEach((element: any) => {
        // Extract tracking number from the span with class 'whitespace-nowrap overflow-hidden'
        const trackingSpan = element.querySelector('.whitespace-nowrap.overflow-hidden');
        const trackingNumber = trackingSpan ? trackingSpan.textContent.trim() : null;

        // Get the HTML content of the entire item
        const html = element.innerHTML;

        // Check if "Delivered on" exists in this shipment
        const isDelivered = /Delivered\s+on/i.test(html);

        if (trackingNumber) {
          results.push({
            trackingNumber,
            status: isDelivered ? 'delivered' : 'unknown'
          });
        }
      });

      return {
        shipments: results,
        totalCount: results.length
      };
    } catch (error) {
      console.log('📍 [GET ALL SHIPMENTS] Error:', error);
      return { shipments: [], totalCount: 0 };
    }
  });

  // Remove duplicates based on tracking number
  const seen = new Set<string>();
  const uniqueShipments = shipments.shipments.filter((s: any) => {
    if (seen.has(s.trackingNumber)) return false;
    seen.add(s.trackingNumber);
    return true;
  });

  // Convert to uppercase and join with commas
  const status = uniqueShipments
    .map((s: any) => s.status.toUpperCase())
    .join(',');

  const count = uniqueShipments.length;

  console.log(`📦 [SHIPMENTS] Total: ${shipments.totalCount}, Unique: ${count}, Status List: ${status}`);

  return { status };
}

async function captureScreenshot(page: Page): Promise<Buffer> {
  console.log(`✅ [AFTERSHIP] Tracking data found, taking screenshot...`);
  const screenshot = await page.screenshot({ fullPage: false });
  console.log(`✅ [AFTERSHIP] Screenshot captured, size: ${screenshot.length} bytes`);
  console.log(`✨ [AFTERSHIP] All done!`);
  return Buffer.from(screenshot);
}

async function attemptScreenshot({ page, codes, provider, attempt, maxRetries }: { page: Page; codes: string; provider: string; attempt: number; maxRetries: number; }): Promise<{ buffer: Buffer; status: string } | null> {
  const trackingURL = getTrackingURL(codes, provider);
  await navigateAndSolveRecaptcha(page, trackingURL, attempt, maxRetries);

  const hasTrackingData = await checkTrackingData(page);

  if (hasTrackingData) {
    const { status } = await getAllShipments(page);

    console.log(`✅ [AFTERSHIP] Tracking data found: ${status}`);

    const buffer = await captureScreenshot(page);
    return { buffer, status };
  }

  return null;
}

async function retryScreenshotCapture({ page, codes, provider, maxRetries }: { page: Page; codes: string; provider: string; maxRetries: number; }): Promise<{ buffer: Buffer; status: string }> {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await attemptScreenshot({ page, codes, provider, attempt, maxRetries });

      if (result) {
        return result;
      }

      if (attempt < maxRetries) {
        const delay = attempt * 3000;
        console.log(`⏳ [AFTERSHIP] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error('No tracking data found after all retries');
      }
    } catch (error: any) {
      lastError = error;
      console.error(`💥 [AFTERSHIP] Attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (attempt < maxRetries) {
        const delay = attempt * 3000;
        console.log(`⏳ [AFTERSHIP] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`💥 [AFTERSHIP] All ${maxRetries} attempts failed`);
  throw lastError || new Error('Failed to capture screenshot after all retries');
}

export async function aftershipScreenshouter({ codes, provider }: ScreenshotQuery): Promise<{ status: string; buffer: Buffer }> {
  console.log(`📍 [AFTERSHIP] Starting screenshot for tracking: ${codes}`);

  let page;
  const browserContext = await PlaywrightBrowserSingleton.getContext();
  if (!browserContext) {
    throw new Error('Failed to get browser context');
  }

  const maxRetries = 3;

  try {
    console.log(`🆕 [AFTERSHIP] Creating new page...`);
    page = await browserContext.newPage();
    page.setDefaultTimeout(120000); // 120 seconds
    console.log(`⏱️ [AFTERSHIP] Default timeout set to 120 seconds`);

    const { buffer, status } = await retryScreenshotCapture({ page, codes, provider, maxRetries });

    const statusArray = status.split(',');
    const allDelivered = statusArray.every(s => s === 'DELIVERED');

    console.log(`🔒 [AFTERSHIP] Closing page after success...`);
    return {
      buffer,
      status: allDelivered ? 'DELIVERED' : 'UNKNOWN'
    };
  } catch (error) {
    console.error(`💥 [AFTERSHIP] Error in aftershipScreenshouter:`, error);
    throw error;
  } finally {
    if (page && !page.isClosed()) {
      console.log(`🔒 [AFTERSHIP] Closing page in finally block...`);
      await page.close();
    }
  }
}