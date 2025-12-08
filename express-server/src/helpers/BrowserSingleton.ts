import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';

export class BrowserSingleton {
  private static browserInstance: Browser | null = null;

  static async getInstance(): Promise<Browser> {
    if (this.browserInstance?.wsEndpoint()) {
      console.log('♻️ [BROWSER] Reusing existing browser instance');
      return this.browserInstance;
    }
    console.log('🆕 [BROWSER] Creating new browser instance');
    this.browserInstance = await puppeteer.launch({
      headless: false,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: [
        '--no-sandbox'
      ]
    });
    this.browserInstance.on('disconnected', () => {
      console.log('🔌 [BROWSER] Browser disconnected');
      this.browserInstance = null;
    });
    return this.browserInstance;
  }
}
