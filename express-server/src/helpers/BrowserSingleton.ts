import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';

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

export class BrowserSingleton {
  private static browserInstance: Browser | null = null;

  static async getInstance(): Promise<Browser> {
    if (this.browserInstance) {
      console.log('♻️ [BROWSER] Reusing existing browser instance');
      return this.browserInstance;
    }
    console.log('🆕 [BROWSER] Creating new browser instance');
    this.browserInstance = await puppeteer.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ]
    });
    this.browserInstance.on('disconnected', () => {
      console.log('🔌 [BROWSER] Browser disconnected');
      this.browserInstance = null;
    });
    return this.browserInstance;
  }
}
