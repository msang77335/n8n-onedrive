import puppeteer from 'puppeteer-extra';
import type { Browser } from 'puppeteer';

export class BrowserSingleton {
  private static browserInstance: Browser | null = null;

  static async getInstance(): Promise<Browser> {
    if (this.browserInstance?.wsEndpoint()) {
      console.log('♻️ [BROWSER] Reusing existing browser instance');
      return this.browserInstance;
    }
    console.log('🆕 [BROWSER] Creating new browser instance');
    const pwEndpoint = `ws://headless-chrome:${process.env.BROWSERLESS_PORT}?token=${process.env.BROWSERLESS_API_TOKEN}`;
    this.browserInstance = await puppeteer.connect({ browserWSEndpoint: pwEndpoint });
    this.browserInstance = await puppeteer.launch(({ headless: false}))
    this.browserInstance.on('disconnected', () => {
      console.log('🔌 [BROWSER] Browser disconnected');
      this.browserInstance = null;
    });
    return this.browserInstance;
  }
}
