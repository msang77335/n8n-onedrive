import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
export class PuppeteerBrowserSingleton {
  private static browserInstance: Browser | null = null;

  static async getInstance(): Promise<Browser> {
    if (this.browserInstance?.wsEndpoint()) {
      console.log('♻️ [BROWSER] Reusing existing browser instance');
      return this.browserInstance;
    }
    // Configure plugins
    puppeteer.use(StealthPlugin());
    puppeteer.use(
      RecaptchaPlugin({
        provider: {
          id: '2captcha',
          token: process.env.CAPTCHA_SOLVER_API_KEY || '',
        },
        visualFeedback: true,
      })
    );
    console.log('🆕 [BROWSER] Creating new browser instance');
    this.browserInstance = await puppeteer.launch({
      headless: true,
      // executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: [
        '--no-sandbox',
      ]
    });
    this.browserInstance.on('disconnected', () => {
      console.log('🔌 [BROWSER] Browser disconnected');
      this.browserInstance = null;
    });
    return this.browserInstance;
  }
}
