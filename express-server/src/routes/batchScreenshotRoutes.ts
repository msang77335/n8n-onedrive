import { Request, Response, Router } from 'express';
import { chromium } from 'playwright';
import { ProxyManager } from '../helpers/proxyManager';

const router = Router();

interface BatchScreenshotQuery {
  urls: string[];
  width?: string;
  height?: string;
  fullPage?: string;
  format?: string;
  quality?: string;
  waitForTimeout?: string;
  useProxy?: boolean;
  proxyId?: string;
  parallel?: boolean; // Process URLs in parallel or sequential
  maxConcurrency?: number; // Max concurrent pages when parallel=true
}

interface ScreenshotResult {
  url: string;
  success: boolean;
  screenshot?: Buffer;
  error?: string;
  duration: number;
}

// POST /api/v1/batch-screenshot - Take screenshots for multiple URLs
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const requestId = `batch-${Date.now()}`;
  console.log(`🚀 [BATCH-SCREENSHOT] Starting batch screenshot request at ${new Date().toISOString()} (ID: ${requestId})`);
  
  try {
    const {
      urls,
      width = '1920',
      height = '1080',
      fullPage = 'false',
      format = 'png',
      quality = '80',
      waitForTimeout = '10000',
      useProxy = false,
      proxyId,
      parallel = false,
      maxConcurrency = 3
    }: BatchScreenshotQuery = req.body;

    console.log(`📋 [BATCH-SCREENSHOT] Parameters:`, { 
      urlCount: urls?.length || 0, 
      width, height, fullPage, format, quality, useProxy, proxyId, parallel, maxConcurrency 
    });

    // Validate input
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      console.log(`❌ [BATCH-SCREENSHOT] Missing or invalid URLs array`);
      res.status(400).json({
        success: false,
        error: 'URLs array is required and must not be empty'
      });
      return;
    }

    if (urls.length > 50) {
      console.log(`❌ [BATCH-SCREENSHOT] Too many URLs: ${urls.length}`);
      res.status(400).json({
        success: false,
        error: 'Maximum 50 URLs allowed per batch'
      });
      return;
    }

    // Validate URL formats
    const invalidUrls: string[] = [];
    urls.forEach((url, index) => {
      try {
        new URL(url);
      } catch {
        invalidUrls.push(`Index ${index}: ${url}`);
      }
    });

    if (invalidUrls.length > 0) {
      console.log(`❌ [BATCH-SCREENSHOT] Invalid URLs found:`, invalidUrls);
      res.status(400).json({
        success: false,
        error: 'Invalid URL formats detected',
        invalidUrls
      });
      return;
    }

    // Launch browser once
    console.log(`🌐 [BATCH-SCREENSHOT] Connecting to Browserless...`);
    // const pwEndpoint = `ws://browserless-chrome:${process.env.BROWSERLESS_PORT}?token=${process.env.BROWSERLESS_API_TOKEN}`;
    const browser = await chromium.launch({ headless: false, devtools: true});
    console.log(`✅ [BATCH-SCREENSHOT] Browser connected successfully`);

    // Dynamic proxy rotation will be handled per URL to avoid detection
    const useProxyRotation = useProxy && !proxyId;
    console.log(`🔄 [BATCH-SCREENSHOT] Proxy strategy: ${useProxyRotation ? 'dynamic rotation per URL' : (proxyId ? `fixed proxy: ${proxyId}` : 'no proxy')}`);

    // Function to take screenshot for a single URL
    const takeScreenshot = async (url: string, index: number): Promise<ScreenshotResult> => {
      const urlStartTime = Date.now();
      console.log(`📸 [BATCH-SCREENSHOT] Processing URL ${index + 1}/${urls.length}: ${url}`);

      try {
        // Dynamic proxy selection per URL for better rotation
        let currentProxyConfig: any = undefined;
        if (useProxy) {
          if (proxyId) {
            const proxy = ProxyManager.getProxyById(proxyId);
            if (proxy) {
              currentProxyConfig = ProxyManager.formatProxyForPlaywright(proxy);
              console.log(`🔗 [BATCH-SCREENSHOT] URL ${index + 1} using fixed proxy: ${proxy.name}`);
            }
          } else {
            const nextProxy = ProxyManager.getNextProxy();
            if (nextProxy) {
              currentProxyConfig = ProxyManager.formatProxyForPlaywright(nextProxy);
              console.log(`🔄 [BATCH-SCREENSHOT] URL ${index + 1} using proxy: ${nextProxy.name}`);
            }
          }
        }

        // Create new context for each URL with enhanced stealth
        const contextOptions: any = {
          ignoreHTTPSErrors: true,
          bypassCSP: true,
          javaScriptEnabled: true,
          acceptDownloads: false,
          userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 + Math.floor(Math.random() * 5)}.0.0.0 Safari/537.36`
        };
        
        if (currentProxyConfig) {
          contextOptions.proxy = currentProxyConfig;
        }
        
        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();

        // Enhanced anti-detection headers with randomization
        const randomHeaders = {
          'User-Agent': contextOptions.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
          'Accept-Language': `en-US,en;q=0.9${Math.random() > 0.5 ? ',vi;q=0.8' : ',fr;q=0.7'}`,
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Upgrade-Insecure-Requests': '1'
        };
        
        await page.setExtraHTTPHeaders(randomHeaders);

        // Enhanced anti-bot detection evasion
        await page.addInitScript(() => {
          // Override webdriver detection
          Object.defineProperty((globalThis as any).navigator, 'webdriver', {
            get: () => false,
          });
          
          // Mock chrome runtime
          Object.defineProperty(globalThis, 'chrome', {
            get: () => ({
              runtime: {
                onConnect: null,
                onMessage: null
              },
              csi: () => {},
              loadTimes: () => ({
                commitLoadTime: Date.now() - Math.random() * 1000,
                connectionInfo: 'http/1.1',
                finishDocumentLoadTime: Date.now(),
                finishLoadTime: Date.now(),
                firstPaintAfterLoadTime: Date.now(),
                firstPaintTime: Date.now(),
                navigationType: 'Other',
                npnNegotiatedProtocol: 'unknown',
                requestTime: Date.now() - Math.random() * 2000,
                startLoadTime: Date.now() - Math.random() * 1500,
                wasAlternateProtocolAvailable: false,
                wasFetchedViaSpdy: false,
                wasNpnNegotiated: false
              })
            })
          });
          
          // Override plugins
          Object.defineProperty((globalThis as any).navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
          });
          
          // Override languages
          Object.defineProperty((globalThis as any).navigator, 'languages', {
            get: () => ['en-US', 'en']
          });
          
          // Override permissions
          const originalQuery = (globalThis as any).navigator.permissions?.query;
          if (originalQuery) {
            (globalThis as any).navigator.permissions.query = (parameters: any) => (
              parameters.name === 'notifications' ?
                Promise.resolve({ state: 'default' }) :
                originalQuery(parameters)
            );
          }
          
          // Random mouse movements simulation
          const originalAddEventListener = EventTarget.prototype.addEventListener;
          EventTarget.prototype.addEventListener = function(type: string, listener: any, options?: any) {
            if (type === 'mouseenter' || type === 'mousemove') {
              setTimeout(() => {
                if (typeof listener === 'function') {
                  //@ts-ignore
                  const event = new MouseEvent(type, {
                    //@ts-ignore
                    clientX: Math.random() * window.innerWidth,
                    //@ts-ignore
                    clientY: Math.random() * window.innerHeight,
                    bubbles: true
                  });
                  listener(event);
                }
              }, Math.random() * 1000);
            }
            return originalAddEventListener.call(this, type, listener, options);
          };
        });

        // Set viewport
        await page.setViewportSize({
          width: Number.parseInt(width, 10),
          height: Number.parseInt(height, 10)
        });

        // Random delay before navigation to avoid pattern detection
        await page.waitForTimeout(1000 + Math.random() * 2000);
        
        // Navigate with retry logic
        let navigationSuccess = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!navigationSuccess && retryCount < maxRetries) {
          try {
            console.log(`🌍 [BATCH-SCREENSHOT] Navigating to ${url} (attempt ${retryCount + 1})`);
            
            await page.goto(url, {
              waitUntil: 'domcontentloaded',
              timeout: 45000
            });
            
            // Check if we got blocked or redirected to captcha
            const currentUrl = page.url();
            const title = await page.title().catch(() => '');
            
            if (currentUrl.includes('captcha') || 
                currentUrl.includes('blocked') ||
                title.toLowerCase().includes('captcha') ||
                title.toLowerCase().includes('blocked')) {
              throw new Error(`Blocked/Captcha detected: ${currentUrl}`);
            }
            
            navigationSuccess = true;
            console.log(`✅ [BATCH-SCREENSHOT] Navigation successful for ${url}`);
            
          } catch (navError: any) {
            retryCount++;
            console.log(`⚠️ [BATCH-SCREENSHOT] Navigation attempt ${retryCount} failed: ${navError.message}`);
            
            if (retryCount < maxRetries) {
              // Wait longer before retry and potentially switch proxy
              await page.waitForTimeout(3000 + Math.random() * 5000);
              
              if (useProxyRotation && retryCount > 1) {
                // Force proxy rotation on retry
                const retryProxy = ProxyManager.getNextProxy();
                if (retryProxy) {
                  console.log(`🔄 [BATCH-SCREENSHOT] Switching to proxy: ${retryProxy.name}`);
                }
              }
            } else {
              throw navError;
            }
          }
        }
        
        // Random wait time to mimic human behavior
        const waitTime = Number.parseInt(waitForTimeout, 10) + Math.random() * 3000;
        await page.waitForTimeout(waitTime);
        
        // Simulate human-like scrolling
        await page.evaluate(() => {
          return new Promise(resolve => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
              //@ts-ignore
              const scrollHeight = document.body.scrollHeight;
              //@ts-ignore
              window.scrollBy(0, distance);
              totalHeight += distance;

              if(totalHeight >= scrollHeight / 2){
                clearInterval(timer);
                //@ts-ignore
                window.scrollTo(0, 0); // Scroll back to top
                resolve(undefined);
              }
            }, 100);
          });
        });

        // Remove sticky elements if present
        await page.evaluate(() => {
          const selectors = [
            '.sticky-position.shadow.py-3',
            '.sticky-position',
            '[class*="sticky"]',
            '[style*="position: sticky"]',
            '[style*="position:sticky"]'
          ];
          
          selectors.forEach(selector => {
            const elements = (globalThis as any).document.querySelectorAll(selector);
            elements.forEach((el: any) => el.remove());
          });
        });

        // Take screenshot
        const screenshotOptions: any = {
          fullPage: fullPage === 'true'
        };

        if (format === 'jpeg' || format === 'jpg') {
          screenshotOptions.type = 'jpeg';
          screenshotOptions.quality = Number.parseInt(quality, 10);
        } else {
          screenshotOptions.type = 'png';
        }

        const screenshot = await page.screenshot(screenshotOptions);
        
        // Close context
        await context.close();

        const duration = Date.now() - urlStartTime;
        console.log(`✅ [BATCH-SCREENSHOT] URL ${index + 1} completed in ${duration}ms: ${url}`);

        return {
          url,
          success: true,
          screenshot,
          duration
        };

      } catch (error: any) {
        const duration = Date.now() - urlStartTime;
        console.error(`💥 [BATCH-SCREENSHOT] Error processing URL ${index + 1}: ${url}`, error.message);
        
        return {
          url,
          success: false,
          error: error.message,
          duration
        };
      }
    };

    let results: ScreenshotResult[];

    if (parallel) {
      // Process URLs in parallel with concurrency limit
      console.log(`🔄 [BATCH-SCREENSHOT] Processing ${urls.length} URLs in parallel (max concurrency: ${maxConcurrency})`);
      
      const semaphore = new Array(Math.min(maxConcurrency, urls.length)).fill(null);
      let urlIndex = 0;
      results = new Array(urls.length);

      const workers = semaphore.map(async () => {
        while (urlIndex < urls.length) {
          const currentIndex = urlIndex++;
          const result = await takeScreenshot(urls[currentIndex], currentIndex);
          results[currentIndex] = result;
        }
      });

      await Promise.all(workers);
    } else {
      // Process URLs sequentially
      console.log(`🔄 [BATCH-SCREENSHOT] Processing ${urls.length} URLs sequentially`);
      results = [];
      
      for (let i = 0; i < urls.length; i++) {
        const result = await takeScreenshot(urls[i], i);
        results.push(result);
      }
    }

    // Close browser
    console.log(`🔒 [BATCH-SCREENSHOT] Closing browser...`);
    try {
      await browser.close();
      console.log(`✅ [BATCH-SCREENSHOT] Browser closed`);
    } catch (closeError: any) {
      console.log(`⚠️ [BATCH-SCREENSHOT] Browser already closed: ${closeError.message}`);
    }

    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    console.log(`🎉 [BATCH-SCREENSHOT] Batch completed in ${totalDuration}ms (ID: ${requestId})`);
    console.log(`📊 [BATCH-SCREENSHOT] Results: ${successCount} success, ${failureCount} failures`);

    // Prepare response
    const responseData = {
      success: true,
      requestId,
      summary: {
        total: urls.length,
        successful: successCount,
        failed: failureCount,
        totalDuration: `${totalDuration}ms`,
        processingMode: parallel ? 'parallel' : 'sequential'
      },
      results: results.map(result => ({
        url: result.url,
        success: result.success,
        error: result.error,
        duration: `${result.duration}ms`,
        hasScreenshot: !!result.screenshot,
        screenshotSize: result.screenshot ? result.screenshot.length : 0
      }))
    };

    // If only one URL and it succeeded, return the image directly
    if (urls.length === 1 && results[0].success && results[0].screenshot) {
      const contentType = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : 'image/png';
      res.set({
        'Content-Type': contentType,
        'Content-Length': results[0].screenshot.length.toString(),
        'Content-Disposition': `inline; filename="screenshot.${format}"`,
        'X-Request-Id': requestId,
        'X-Duration': `${totalDuration}ms`
      });
      res.send(results[0].screenshot);
      return;
    }

    // For multiple URLs or when requesting metadata, return JSON
    res.json(responseData);

  } catch (error: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.error(`💥 [BATCH-SCREENSHOT] Error occurred after ${duration}ms:`, error);
    console.error(`💥 [BATCH-SCREENSHOT] Error stack:`, error.stack);

    res.status(500).json({
      success: false,
      requestId,
      error: 'Failed to process batch screenshots',
      message: error.message,
      duration: `${duration}ms`
    });
  }
});

export default router;