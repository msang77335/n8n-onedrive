import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';

export class BrowserSingleton {
  private static browserInstance: Browser | null = null;

  static async getInstance(): Promise<Browser> {
    if (this.browserInstance) {
      console.log('♻️ [BROWSER] Reusing existing browser instance');
      return this.browserInstance;
    }
    console.log('🆕 [BROWSER] Creating new browser instance');
    // Build launch args
    const launchArgs = [
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--single-process',
      `--proxy-server=http://104.252.71.137:6065`
    ];
    this.browserInstance = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: launchArgs
    });
    this.browserInstance.on('disconnected', () => {
      console.log('🔌 [BROWSER] Browser disconnected');
      this.browserInstance = null;
    });
    return this.browserInstance;
  }
}
