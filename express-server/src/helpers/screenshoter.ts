import { isGiaoHangNhanh, isSPX, isYunExpress } from ".";
import { PlaywrightBrowserSingleton } from "./PlaywrightBrowserSingleton";

async function navigateToPage(page: any, url: string): Promise<void> {
  console.log(`🌐 [SCREENSHOT] Navigating to ${url}...`);

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  } catch (gotoError: any) {
    console.log(`⚠️ [SCREENSHOT] Navigation issue: ${gotoError.message}, retrying with 'load'...`);
    await page.goto(url, {
      waitUntil: 'load',
      timeout: 60000
    });
  }
}

async function checkTrackingData(page: any): Promise<boolean> {
  console.log(`🔍 [SCREENSHOT] Checking for tracking data...`);
  return await page.evaluate(() => {
    const spxHasData = (globalThis as any).document.querySelector('.comp-tracking-milestone-progress-bar');
    const ghnHasData = (globalThis as any).document.querySelector('.order-history-container')?.textContent?.trim().length > 0;
    
    // Check YunExpress has table and not "No data"
    const yunTableHeader = (globalThis as any).document.querySelector('.el-table__header-wrapper');
    const yunNoData = (globalThis as any).document.body?.textContent?.includes('No data');
    const yunHasData = yunTableHeader && !yunNoData;
    
    return spxHasData || ghnHasData || yunHasData;
  });
}

async function getTrackingStatus(page: any, provider: string): Promise<string> {
  if (isSPX(provider)) {
    console.log(`📊 [SCREENSHOT] Getting tracking status for SPX...`);
    return await page.evaluate(() => {
      // Check various delivery status indicators
      const messageElement = (globalThis as any).document.querySelector('.message');
      const statusText = messageElement?.textContent?.trim() || '';

      // Check for successful delivery only
      if (statusText.includes('Giao hàng thành công') ||
        statusText.includes('Đã giao hàng') ||
        statusText.includes('Delivered')) {
        return 'DELIVERED';
      }

      // All other cases
      return 'UNKNOWN';
    });
  } else if(isGiaoHangNhanh(provider)) {
    console.log(`📊 [SCREENSHOT] Getting tracking status for GiaoHangNhanh...`);
    return await page.evaluate(() => {
      // Check for delivery status in table or log items
      const statusElements = (globalThis as any).document.querySelectorAll('.table-col.text-bold, .table-log-item .table-col');
      
      for (const element of statusElements) {
        const statusText = element?.textContent?.trim() || '';
        
        // Check for successful delivery
        if (statusText.includes('Giao hàng thành công') ||
            statusText.includes('Đã giao hàng') ||
            statusText.includes('Delivered')) {
          return 'DELIVERED';
        }
      }
      
      // All other cases
      return 'UNKNOWN';
    });
  } else if (isYunExpress(provider)) {
    console.log(`📊 [SCREENSHOT] Getting tracking status for YunExpress...`);
    return await page.evaluate(() => {
      // Check for status element
      const statusElement = (globalThis as any).document.querySelector('.status');
      const statusText = statusElement?.textContent?.trim() || '';
      
      // Check for successful delivery
      if (statusText.includes('Delivered successfully') ||
          statusText.includes('Giao hàng thành công') ||
          statusText.includes('Đã giao hàng') ||
          statusText.includes('Delivered')) {
        return 'DELIVERED';
      }
      
      // All other cases
      return 'UNKNOWN';
    });
  }
  return 'UNKNOWN';
}

async function takePage(page: any): Promise<Buffer> {
  console.log(`✅ [SCREENSHOT] Tracking data found, taking screenshot...`);
  const screenshot = await page.screenshot({ fullPage: false });
  console.log(`✅ [SCREENSHOT] Screenshot captured, size: ${screenshot.length} bytes`);
  console.log(`✨ [SCREENSHOT] All done!`);
  return Buffer.from(screenshot);
}

async function closePage(page: any): Promise<void> {
  if (page && !page.isClosed()) {
    await page.close().catch((e: any) => console.log('Error closing page:', e));
  }
}

export async function screenshoter(url: string, provider: string): Promise<{ status: string; buffer: Buffer }> {
  console.log(`📍 [SCREENSHOT] Starting screenshot for URL: ${url}`);
  const browserContext = await PlaywrightBrowserSingleton.getContext();
  if (!browserContext) {
    throw new Error('Failed to get browser context');
  }

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let page;
    try {
      console.log(`🆕 [SCREENSHOT] Creating new page (attempt ${attempt}/${maxRetries})...`);
      page = await browserContext.newPage();

      page.setDefaultTimeout(90000); // 90 seconds
      console.log(`⏱️ [SCREENSHOT] Default timeout set to 90 seconds`);

      await navigateToPage(page, url);
      console.log(`✅ [SCREENSHOT] Page loaded successfully`);

      console.log(`⏳ [SCREENSHOT] Waiting 15 seconds for content to load...`);
      await new Promise(resolve => setTimeout(resolve, 15000));

      const hasTrackingData = await checkTrackingData(page);

      if (hasTrackingData) {
        const status = await getTrackingStatus(page, provider);
        console.log(`📊 [SCREENSHOT] Status detected: ${status}`);

        const buffer = await takePage(page);

        const metadata = {
          url: url,
          timestamp: new Date().toISOString()
        };

        await closePage(page);
        return { status, buffer };
      }

      console.log(`⚠️ [SCREENSHOT] No tracking data found (attempt ${attempt}/${maxRetries})`);
      throw new Error(attempt < maxRetries ? 'No tracking data found, will retry' : 'No tracking data found after all retries');

    } catch (error: any) {
      lastError = error;
      console.error(`💥 [SCREENSHOT] Attempt ${attempt}/${maxRetries} failed:`, error.message);
      await closePage(page);

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