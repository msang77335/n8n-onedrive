import { Request, Response, Router } from 'express';
import { chromium, Route, Response as PlaywrightResponse } from 'playwright';
import { ProxyManager } from '../helpers/proxyManager';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

interface ScreenshotQuery {
  url?: string;
  useProxy?: boolean;
}

// POST /api/v1/screenshot - Take screenshot and return image
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  console.log(`🚀 [SCREENSHOT] Starting screenshot request at ${new Date().toISOString()}`);
  
  let browser: any = null;
  
  try {
    const {
      url,
      useProxy = true,
    }: ScreenshotQuery = req.body;

    console.log(`📋 [SCREENSHOT] Parameters:`, { url, useProxy });

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
    console.log(`🌐 [SCREENSHOT] Connecting to Browserless...`);
    const pwEndpoint = `ws://headless-chrome:${process.env.BROWSERLESS_PORT}?token=${process.env.BROWSERLESS_API_TOKEN}`;
    browser = await chromium.connectOverCDP(pwEndpoint);
    // const browser = await chromium.launch({ headless: true });
    console.log(`✅ [SCREENSHOT] Browser connected successfully`);

    // Proxy configuration using ProxyManager
    let proxyConfig: any = undefined;
    let currentProxyInfo: any = null;

    if (useProxy) {
      // Use round-robin proxy selection
      const nextProxy = ProxyManager.getNextProxy();
      if (nextProxy) {
        proxyConfig = ProxyManager.formatProxyForPlaywright(nextProxy);
        currentProxyInfo = nextProxy;
        console.log(`🔄 [SCREENSHOT] Using next proxy (round-robin): ${nextProxy.name}`);
      } else {
        console.log(`⚠️ [SCREENSHOT] No active proxies available, proceeding without proxy`);
      }
    }

    const page = proxyConfig ?
      await (await browser.newContext({ proxy: proxyConfig })).newPage() :
      await browser.newPage();

    let responseSent = false;
    let browserClosed = false;

    const closeBrowser = async () => {
      if (!browserClosed) {
        browserClosed = true;
        try {
          await browser.close();
          console.log(`✅ [SCREENSHOT] Browser closed`);
        } catch (closeError: any) {
          console.log(`⚠️ [SCREENSHOT] Browser already closed: ${closeError.message}`);
        }
      }
    };

    // Set up route interception for AfterShip API requests
    await page.route('**/*', (route: Route) => {
      const BLOCKED = [
        'googletagmanager.com',
        'google-analytics.com',
        'doubleclick.net',
      ];
      const request = route.request();
      const requestUrl = request.url();

      if (BLOCKED.some(domain => requestUrl.includes(domain))) {
        return route.abort();
      }

      return route.continue();
    });

    // Handle AfterShip API tracking requests
    if (url.includes('aftership.com')) {
      try {
        console.log(`🚢 [SCREENSHOT] Handling AfterShip tracking API...`);

        // Listen for network responses to catch AfterShip API calls
        page.on('response', async (response: PlaywrightResponse) => {
          if (responseSent) return;
          
          console.log(`🔍 [SCREENSHOT] Network response:`, response.url());
          if (response.url().includes('track.aftership.com/api/v2/direct-trackings/batch')) {
            try {
              console.log(`📡 [SCREENSHOT] Caught AfterShip API response:`, {
                url: response.url(),
                status: response.status(),
                method: response.request().method()
              });

              const responseData = await response.json().catch(() => null);
              if (responseData && !responseSent) {
                responseSent = true;
                
                console.log(`📦 [SCREENSHOT] AfterShip API response data:`, JSON.stringify(responseData, null, 2));
                
                const endTime = Date.now();
                const duration = endTime - startTime;
                
                // Check if response indicates error
                const isError = 
                  responseData.statusCode === 402 || 
                  responseData.statusCode === 429 ||
                  responseData.statusCode >= 400 ||
                  (responseData.error) ||
                  (responseData.meta && responseData.meta.type === 'error');

                if (isError) {
                  console.log(`❌ [SCREENSHOT] AfterShip API returned error in ${duration}ms`);
                  
                  await closeBrowser();
                  
                  // Write failed proxy IP to file
                  if (currentProxyInfo) {
                    const logDir = path.join(__dirname, '../../logs');
                    const logFile = path.join(logDir, 'failed-proxies.txt');
                    
                    try {
                      // Create logs directory if it doesn't exist
                      if (!fs.existsSync(logDir)) {
                        fs.mkdirSync(logDir, { recursive: true });
                      }
                      
                      const logEntry = `${new Date().toISOString()} - ${currentProxyInfo.name} (${currentProxyInfo.server}) - Error: ${responseData.error}\n`;
                      fs.appendFileSync(logFile, logEntry, 'utf8');
                      console.log(`📝 [SCREENSHOT] Failed proxy logged to ${logFile}`);
                    } catch (logError: any) {
                      console.log(`⚠️ [SCREENSHOT] Failed to write log file:`, logError.message);
                    }
                  }
                  
                  res.status(responseData.statusCode || 500).json({
                    success: false,
                    error: responseData.error || 'API request failed',
                    message: responseData.meta?.message || responseData.error,
                    data: responseData,
                    duration: `${duration}ms`
                  });
                } else {
                  console.log(`🎉 [SCREENSHOT] AfterShip API data retrieved in ${duration}ms`);
                  
                  await closeBrowser();

                  res.json({
                    success: true,
                    data: responseData.data?.direct_trackings ?? [],
                    duration: `${duration}ms`
                  });
                }
                return;
              }
            } catch (apiError: any) {
              console.log(`⚠️ [SCREENSHOT] Error handling AfterShip API response:`, apiError.message);
            }
          }
        });

        // Wait for potential API calls to complete
        await page.waitForTimeout(3000);
        console.log(`✅ [SCREENSHOT] AfterShip API handling completed`);
      } catch (aftershipError: any) {
        console.log(`⚠️ [SCREENSHOT] AfterShip API handling error:`, aftershipError.message);
      }
    }
    
    if (responseSent) {
      await closeBrowser();
      return;
    }

    console.log(`📄 [SCREENSHOT] Page created with proxy config:`, proxyConfig || 'none');

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });

    // Hide automation indicators
    await page.addInitScript(() => {
      Object.defineProperty((globalThis as any).navigator, 'webdriver', {
        get: () => false,
      });

      Object.defineProperty(globalThis, 'chrome', {
        get: () => ({
          runtime: {},
        }),
      });

      const originalQuery = (globalThis as any).navigator.permissions.query;
      (globalThis as any).navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: (globalThis as any).Notification.permission }) :
          originalQuery(parameters)
      );
    });

    console.log(`✅ [SCREENSHOT] New page created with anti-bot settings`);

    // Set viewport
    console.log(`🖥️ [SCREENSHOT] Setting viewport...`);
    await page.setViewportSize({
      width: 1920,
      height: 1080
    });
    console.log(`✅ [SCREENSHOT] Viewport set successfully`);

    // Navigate to URL
    console.log(`🌍 [SCREENSHOT] Navigating to URL: ${url}...`);
    try {
      if (responseSent) {
        await closeBrowser();
        return;
      }
      
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      console.log(`✅ [SCREENSHOT] Page loaded successfully`);

      if (responseSent) {
        await closeBrowser();
        return;
      }

      // Check and handle Cloudflare verification
      const isCloudflareChallenge = await page.$('input[name="cf-turnstile-response"]') ||
        await page.$('.cf-browser-verification') ||
        await page.$('#cf-challenge-running') ||
        await page.locator('text=Verify you are human').first().isVisible().catch(() => false);

      if (isCloudflareChallenge) {
        console.log(`🛡️ [SCREENSHOT] Cloudflare challenge detected, waiting...`);

        try {
          await page.waitForURL((url: string) => !url.toString().includes('challenge'), { timeout: 30000 });
          console.log(`✅ [SCREENSHOT] Cloudflare challenge passed`);
        } catch {
          console.log(`⚠️ [SCREENSHOT] Cloudflare challenge timeout, continuing anyway...`);
        }

        if (responseSent) {
          await closeBrowser();
          return;
        }
        
        await page.waitForTimeout(10000);
      }

      if (responseSent) {
        await closeBrowser();
        return;
      }

      await page.waitForTimeout(30000);
      console.log(`✅ [SCREENSHOT] Additional wait completed`);

    } catch (navigationError: any) {
      if (responseSent) {
        console.log(`ℹ️ [SCREENSHOT] Navigation skipped, response already sent`);
        await closeBrowser();
        return;
      }
      
      console.log(`⚠️ [SCREENSHOT] Navigation error, trying with load event: ${navigationError.message}`);
      
      try {
        await page.goto(url, {
          waitUntil: 'load',
          timeout: 45000
        });
        console.log(`✅ [SCREENSHOT] Page loaded with fallback method`);
      } catch (fallbackError: any) {
        if (responseSent) {
          console.log(`ℹ️ [SCREENSHOT] Fallback navigation skipped, response already sent`);
          await closeBrowser();
          return;
        }
        throw fallbackError;
      }
    }

    if (responseSent) {
      await closeBrowser();
      return;
    }

    // Close browser
    console.log(`🔒 [SCREENSHOT] Closing browser...`);
    await closeBrowser();

    if (responseSent) {
      return;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`🎉 [SCREENSHOT] Request completed in ${duration}ms for URL: ${url}`);

    res.status(404).json({
      success: false,
      error: 'No AfterShip API data captured',
      message: 'The page did not make the expected API call to track.aftership.com',
      duration: `${duration}ms`
    });

  } catch (error: any) {
    // Try to close browser if still open
    try {
      if (browser) {
        await browser.close().catch(() => {});
      }
    } catch {}
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.error(`💥 [SCREENSHOT] Error occurred after ${duration}ms:`, error);
    console.error(`💥 [SCREENSHOT] Error stack:`, error.stack);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process request',
      message: error.message,
      duration: `${duration}ms`
    });
  }
});

export default router;