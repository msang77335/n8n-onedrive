import { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';

export class PuppeteerBrowserSingleton {
  private static browserInstance: Browser | null = null;

  static async getInstance(): Promise<Browser | null> {
    if (this.browserInstance) {
      console.log('♻️ [BROWSER] Reusing existing browser instance');
      return this.browserInstance;
    }
    console.log('🆕 [BROWSER] Creating new browser instance');
    this.browserInstance = await puppeteer.launch({
      headless: false,
      executablePath: '/app/chrome/chrome-linux64/chrome',
      userDataDir: '/app/chrome-profile',
      args: [
        '--no-sandbox',
        '--profile-directory=Default',
        '--disable-blink-features=AutomationControlled',
      ]
    });
    if (this.browserInstance) {
      this.browserInstance.on('disconnected', () => {
        console.log('🔌 [BROWSER] Browser disconnected');
        this.browserInstance = null;
      });
    }
    return this.browserInstance;
  }
}
