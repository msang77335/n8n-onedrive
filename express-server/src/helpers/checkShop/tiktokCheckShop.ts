import { PuppeteerBrowserSingleton } from '../PuppeteerBrowserSingleton';
import { ProxyManager } from '../ProxyManager';
import { CheckShop, ScreenshotResult, ShopSiteEnum } from '.';
import { solveDragCaptcha } from './captchaDragSolver';
import { Page } from 'puppeteer';

export class TiktokCheckShop extends CheckShop {
  readonly site = ShopSiteEnum.Tiktok;
  private static readonly MAX_RETRIES = 3;

  matches(url: string): boolean {
    return url.toUpperCase().includes('TIKTOK');
  }


  detectProductId(url: string): string | null {
    try {
      // Pattern 1: /view/product/{productId}
      let result = /\/view\/product\/(\d+)/.exec(url);
      if (result) return result[1];

      // Pattern 2: /pdp/{productName}/{productId}
      result = /\/pdp\/[^/]+\/(\d+)/.exec(url);
      if (result) return result[1];

      // Pattern 3: Last segment if it's all digits
      const segments = url.split('/').filter(Boolean);
      const lastSegment = segments.at(-1);
      if (lastSegment && /^\d+$/.test(lastSegment)) {
        return lastSegment;
      }

      return null;
    } catch {
      return null;
    }
  }

  async screenshot(url: string): Promise<ScreenshotResult> {
    const proxyManager = ProxyManager.getInstance();

    for (let attempt = 1; attempt <= TiktokCheckShop.MAX_RETRIES; attempt++) {
      const proxy = proxyManager.getNextProxy();
      if (proxy) {
        console.log(`🌐 [TIKTOK CHECK SHOP] Attempt ${attempt}/${TiktokCheckShop.MAX_RETRIES} using proxy: ${proxy.split(':')[0]}:${proxy.split(':')[1]}`);
        PuppeteerBrowserSingleton.setProxy(proxy);
      } else {
        console.warn(`⚠️ [TIKTOK CHECK SHOP] Attempt ${attempt}/${TiktokCheckShop.MAX_RETRIES} - no proxy available`);
      }

      const page = await PuppeteerBrowserSingleton.newPage();
      if (!page) throw new Error('Page instance is not available');

      let productId = this.detectProductId(url);
      try {
        if (productId) {
          await page.goto(`https://shop.tiktok.com/vn/pdp/${productId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } else {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

          await new Promise<void>(r => setTimeout(r, 5000));

          const currentUrl = page.url();
          productId = this.detectProductId(currentUrl);
          if (productId) {
            console.log(`🔍 [TIKTOK CHECK SHOP] Detected product ID ${productId} after navigation, going to normalized URL...`);
            await page.goto(`https://shop.tiktok.com/vn/pdp/${productId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
          }
        }

        if (productId) {
          console.log(`⏱️ [TIKTOK CHECK SHOP] Waiting 10000 ms after load...`);
          await new Promise<void>(r => setTimeout(r, 10000));

          await this.solveCaptchaIfNeeded(page);
        }

        const shopTile = await this.getShopTitle(page);
        console.log(`🏪 [TIKTOK CHECK SHOP] Shop title: ${shopTile}`);

        const is404 = await this.is404OrNotFound(page);
        if (is404 && attempt < TiktokCheckShop.MAX_RETRIES) {
          console.warn(`🔁 [TIKTOK CHECK SHOP] 404/Not found on attempt ${attempt}, retrying with new proxy...`);
          await PuppeteerBrowserSingleton.close();
          continue;
        }

        const isValidShop = await this.checkValidShop(page);
        const buffer = await page.screenshot({ fullPage: true }) as Buffer;
        const status = isValidShop ? 'AVAILABLE' : 'UNAVAILABLE';

        return { site: this.site, status, shopTile, screenshot: buffer };
      } finally {
        await page.close();
      }
    }

    throw new Error('Failed after max retries');
  }

  private async solveCaptchaIfNeeded(page: Page): Promise<void> {
    while (true) {
      const result = await solveDragCaptcha(page);
      if (!result.attempted) break; // Không có captcha
      if (result.success) {
        console.log(`✅ [TIKTOK CHECK SHOP] Captcha solved`);
        break;
      }
      console.log(`🔄 [TIKTOK CHECK SHOP] Captcha attempt failed, retrying...`);
      await new Promise<void>(r => setTimeout(r, 1000));
    }

    // Đợi thêm 10 giây sau khi giải captcha để trang có thể cập nhật trạng thái
    await new Promise<void>(r => setTimeout(r, 10000));

    // Đóng popup "Get the full app experience" sau khi giải captcha
    try {
      // Try pressing Escape first (most modals respond to this)
      await page.keyboard.press('Escape');
      await new Promise<void>(r => setTimeout(r, 300));

      // Check if modal is still visible
      const isModalStillVisible = await page.evaluate(() => {
        const modal = document.querySelector('[class*="p-24"], [class*="modal"], [role="dialog"]');
        return modal ? (globalThis as any).getComputedStyle(modal).display !== 'none' : false;
      });

      if (isModalStillVisible) {
        // Click outside the modal content to close it
        // Get center point of the page and click on the overlay area
        const { width, height } = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight
        }));
        // Click on a corner area that's likely to be outside the modal
        await page.mouse.click(20, 20);
        console.log(`🚫 [TIKTOK CHECK SHOP] Dismissed popup by clicking outside`);
        await new Promise<void>(r => setTimeout(r, 500));
      } else {
        console.log(`🚫 [TIKTOK CHECK SHOP] Dismissed popup by pressing Escape`);
      }
    } catch (popupErr: any) {
      console.log(`⚠️ [TIKTOK CHECK SHOP] Could not dismiss popup: ${popupErr.message}`);
    }

    await new Promise<void>(r => setTimeout(r, 1000));
  }

  private async getShopTitle(page: Page): Promise<string> {
    try {
      const h1El = await page.$('h1[class*="title-"]');
      if (h1El) {
        const text = await h1El.evaluate((el) => (el as { textContent: string | null }).textContent?.trim());
        if (text) return text;
      }
    } catch { /* ignore */ }
    return await page.title();
  }

  private async is404OrNotFound(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const doc = document;
      if (doc.querySelector('[class*="not-found"]')) return true;
      const bodyText = doc.body?.innerText || '';
      if (bodyText.includes('404')) return true;
      if (bodyText.includes('Not Found')) return true;
      if (bodyText.includes('Không tìm thấy')) return true;
      return false;
    });
  }

  private async checkValidShop(page: Page): Promise<boolean> {
    const isErrorPage = await page.evaluate(() => {
      const doc = document;
      // Check for error indicators
      if (doc.querySelector('[class*="error"]')) return true;
      if (doc.querySelector('[class*="not-found"]')) return true;

      // Check for specific error messages
      const bodyText = doc.body?.innerText || '';
      if (bodyText.includes('Product not available in this country or region')) return true;
      if (bodyText.includes('Please try again')) return true;

      return false;
    });

    if (isErrorPage) return false;

    // Check for breadcrumb navigation (indicator of valid product page)
    const hasBreadcrumb = await page.evaluate(() => {
      const breadcrumbList = document.querySelector('ol[class*="list-none"]');
      return breadcrumbList !== null;
    });

    return hasBreadcrumb;
  }
}
