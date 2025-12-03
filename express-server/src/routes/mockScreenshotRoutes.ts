import { Request, Response, Router } from 'express';
import { chromium } from 'playwright';
import { ProxyManager } from '../helpers/proxyManager';

const router = Router();

interface ScreenshotQuery {
  url?: string;
  width?: string;
  height?: string;
  fullPage?: string;
  format?: string;
  quality?: string;
  waitForTimeout?: string;
  useProxy?: boolean;
  proxyId?: string;
  method?: string;
  postBody?: any;
  headers?: Record<string, string>;
}

// POST /api/v1/screenshot - Take screenshot and return image
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  console.log(`🚀 [SCREENSHOT] Starting screenshot request at ${new Date().toISOString()}`);
  try {
    const {
      url,
      width = '1920',
      height = '1080',
      fullPage = 'false',
      format = 'png',
      quality = '80',
      waitForTimeout = '10000',
      useProxy = false,
      proxyId,
      method = 'GET',
      postBody,
      headers
    }: ScreenshotQuery = req.body;

    console.log(`📋 [SCREENSHOT] Parameters:`, { url, width, height, fullPage, format, quality, useProxy, proxyId, method, hasPostBody: !!postBody, hasHeaders: !!headers });

    if (!url) {
      console.log(`❌ [SCREENSHOT] Missing URL parameter`);
      res.status(400).json({
        success: false,
        error: 'URL is required'
      });
      return;
    }

    // Validate URL format
    try {
      new URL(url);
      console.log(`✅ [SCREENSHOT] URL validation passed: ${url}`);
    } catch {
      console.log(`❌ [SCREENSHOT] Invalid URL format: ${url}`);
      res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
      return;
    }

    // Launch browser
    // const pwEndpoint = `ws://browserless:3000?token=JLIyO58cbu`;
    // console.log(`🌐 [SCREENSHOT] Connecting to Browserless...`);
    const pwEndpoint = `ws://headless-chrome:${process.env.BROWSERLESS_PORT}?token=${process.env.BROWSERLESS_API_TOKEN}`;
    const browser = await chromium.connectOverCDP(pwEndpoint);
    // const browser = await chromium.launch({ headless: true });
    console.log(`✅ [SCREENSHOT] Browser connected successfully`);

    // Proxy configuration using ProxyManager
    let proxyConfig: any = undefined;

    if (useProxy) {
      if (proxyId) {
        // Use specific proxy by ID
        const proxy = ProxyManager.getProxyById(proxyId);
        if (proxy) {
          proxyConfig = ProxyManager.formatProxyForPlaywright(proxy);
          console.log(`🔗 [SCREENSHOT] Using specific proxy: ${proxy.name}`);
        } else {
          console.log(`⚠️ [SCREENSHOT] Proxy ID '${proxyId}' not found, using next available proxy`);
          const nextProxy = ProxyManager.getNextProxy();
          if (nextProxy) {
            proxyConfig = ProxyManager.formatProxyForPlaywright(nextProxy);
            console.log(`🔄 [SCREENSHOT] Using next proxy: ${nextProxy.name}`);
          }
        }
      } else {
        // Use round-robin proxy selection
        const nextProxy = ProxyManager.getNextProxy();
        if (nextProxy) {
          proxyConfig = ProxyManager.formatProxyForPlaywright(nextProxy);
          console.log(`🔄 [SCREENSHOT] Using next proxy (round-robin): ${nextProxy.name}`);
        } else {
          console.log(`⚠️ [SCREENSHOT] No active proxies available, proceeding without proxy`);
        }
      }
    }

    const page = proxyConfig ?
      await (await browser.newContext({ proxy: proxyConfig })).newPage() :
      await browser.newPage();

    console.log(`📄 [SCREENSHOT] Page created with proxy config:`, proxyConfig || 'none');

    // Set extra headers (bao gồm User-Agent)
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });

    // Ẩn automation indicators
    await page.addInitScript(() => {
      // Override webdriver property
      Object.defineProperty((globalThis as any).navigator, 'webdriver', {
        get: () => false,
      });

      // Mock chrome runtime
      Object.defineProperty(globalThis, 'chrome', {
        get: () => ({
          runtime: {},
        }),
      });

      // Override permissions
      const originalQuery = (globalThis as any).navigator.permissions.query;
      (globalThis as any).navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: (globalThis as any).Notification.permission }) :
          originalQuery(parameters)
      );
    });

    console.log(`✅ [SCREENSHOT] New page created with anti-bot settings`);

    // Set viewport
    console.log(`🖥️ [SCREENSHOT] Setting viewport to ${width}x${height}...`);
    await page.setViewportSize({
      width: Number.parseInt(width, 10),
      height: Number.parseInt(height, 10)
    });
    console.log(`✅ [SCREENSHOT] Viewport set successfully`);

    // Navigate to URL
    console.log(`🌍 [SCREENSHOT] Navigating to URL: ${url}...`);
    try {
      // Prepare navigation options
      const gotoOptions: any = {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      };

      // If POST method with body, use page.route to intercept and modify request
      if (method === 'POST' && postBody) {
        console.log(`📤 [SCREENSHOT] Using POST method with body`);
        
        // Intercept the request and modify it to POST with body
        await page.route(url, async route => {
          await route.continue({
            method: 'POST',
            postData: postBody,
            headers: {
              'Content-Type': 'application/json',
              ...(headers || {})
            }
          });
        });

        // Navigate with the intercepted POST request
        await page.goto(url, gotoOptions);
        console.log(`✅ [SCREENSHOT] POST request completed and page loaded`);
      } else {
        // Regular GET navigation
        await page.goto(url, gotoOptions);
        console.log(`✅ [SCREENSHOT] Page loaded successfully`);
      }

      // Kiểm tra và xử lý Cloudflare verification
      const isCloudflareChallenge = await page.$('input[name="cf-turnstile-response"]') ||
        await page.$('.cf-browser-verification') ||
        await page.$('#cf-challenge-running') ||
        await page.locator('text=Verify you are human').first().isVisible().catch(() => false);

      if (isCloudflareChallenge) {
        console.log(`🛡️ [SCREENSHOT] Cloudflare challenge detected, waiting...`);

        // Đợi challenge hoàn thành (tối đa 30 giây)
        try {
          await page.waitForURL(url => !url.toString().includes('challenge'), { timeout: 30000 });
          console.log(`✅ [SCREENSHOT] Cloudflare challenge passed`);
        } catch {
          console.log(`⚠️ [SCREENSHOT] Cloudflare challenge timeout, continuing anyway...`);
        }

        // Đợi thêm để trang load
        await page.waitForTimeout(10000);
      }

      // Đợi thêm một chút để page render hoàn toàn
      await page.waitForTimeout(Number.parseInt(waitForTimeout || '30000', 10));
      console.log(`✅ [SCREENSHOT] Additional wait completed`);

    } catch (navigationError: any) {
      console.log(`⚠️ [SCREENSHOT] Navigation error, trying with load event: ${navigationError.message}`);
      // Fallback: thử với 'load' event
      await page.goto(url, {
        waitUntil: 'load',
        timeout: 45000
      });
      console.log(`✅ [SCREENSHOT] Page loaded with fallback method`);
    }

    // Scroll để trigger lazy loading và đảm bảo content load đầy đủ
    console.log(`📜 [SCREENSHOT] Performing scroll to trigger lazy loading...`);
    try {
      await page.waitForTimeout(1000);

      // Scroll xuống một chút để trigger lazy loading
      const isAfterShip = url.includes('aftership.com');
      if (isAfterShip) {
        console.log(`📜 [SCREENSHOT] Special scroll for aftership.com`);
        await page.evaluate(() => {
          (globalThis as any).scrollTo(0, 700);
        });
      }

      await page.waitForTimeout(2000);
      console.log(`✅ [SCREENSHOT] Scroll completed`);
    } catch (scrollError: any) {
      console.log(`⚠️ [SCREENSHOT] Scroll error: ${scrollError.message}`);
    }

    console.log(`📸 [SCREENSHOT] Preparing screenshot options...`);
    const screenshotOptions: any = {
      fullPage: fullPage === 'true'
    };

    if (format === 'jpeg' || format === 'jpg') {
      screenshotOptions.type = 'jpeg';
      screenshotOptions.quality = Number.parseInt(quality, 10);
    } else {
      screenshotOptions.type = 'png';
    }
    console.log(`📸 [SCREENSHOT] Screenshot options:`, screenshotOptions);

    console.log(`📸 [SCREENSHOT] Taking screenshot...`);
    const screenshotBuffer = await page.screenshot(screenshotOptions);
    console.log(`✅ [SCREENSHOT] Screenshot taken! Size: ${screenshotBuffer.length} bytes`);
    console.log(`🔒 [SCREENSHOT] Closing browser...`);
    try {
      await browser.close();
      console.log(`✅ [SCREENSHOT] Browser closed`);
    } catch (closeError: any) {
      console.log(`⚠️ [SCREENSHOT] Browser already closed: ${closeError.message}`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`🎉 [SCREENSHOT] Screenshot completed in ${duration}ms for URL: ${url}`);

    // Set appropriate content type and return image
    const contentType = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : 'image/png';
    res.set({
      'Content-Type': contentType,
      'Content-Length': screenshotBuffer.length.toString(),
      'Content-Disposition': `inline; filename="screenshot.${format}"`
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

export default router;