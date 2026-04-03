import { Page } from 'playwright';
import { PlaywrightBrowserSingleton } from '../PlaywrightBrowserSingleton';
import { CheckShop, ScreenshotResult, ShopSiteEnum } from '.';

export class LazadaCheckShop extends CheckShop {
  readonly site = ShopSiteEnum.Lazada;

  matches(url: string): boolean {
    return url.toUpperCase().includes('LAZADA');
  }

  async screenshot(url: string): Promise<ScreenshotResult> {
    const browserContext = await PlaywrightBrowserSingleton.getContext();
    if (!browserContext) throw new Error('Browser context is not available');
    const page = await browserContext.newPage();
    try {
      console.log(`🌐 [LAZADA CHECK SHOP] Navigating to ${url}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      console.log(`⏱️ [LAZADA CHECK SHOP] Waiting 30000 ms after load...`);
      await page.waitForTimeout(30000);

      const shopTile = await page.title();
      console.log(`🏪 [LAZADA CHECK SHOP] Page title: ${shopTile}`);
      const isValidShop = await this.checkValidShop(page);

      const buffer = await page.screenshot({ fullPage: true });
      const status = isValidShop ? "AVAILABLE" : "UNAVAILABLE";
      
      return { site: this.site, status, shopTile, screenshot: buffer };
    } finally {
      await page.close();
    }
  }

  async checkValidShop(page: Page) {
    const isErrorPage = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      // Case 1: error page title element
      if (doc.querySelector('.error-page-title')) return true;
      // Case 2: body has data-spm="store_error"
      if (doc.body?.dataset.spm === 'store_error') return true;
      // Case 3: common-error iframe (errCode in URL)
      if (doc.querySelector('iframe[src*="common-error"]')) return true;
      // Case 4: specific text content indicating shop not found
      if (doc.querySelector('.shop-enter-fail-page')) return true;
      return false;
    });
    return !isErrorPage;
  }
}
