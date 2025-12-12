import type { Browser } from 'puppeteer';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
const { firefox } = require('playwright-extra')
const stealth = require('puppeteer-extra-plugin-stealth')()

export class BrowserSingleton {
  private static browserInstance: Browser | null = null;

  static async getInstance(): Promise<Browser | null> {
    if (this.browserInstance) {
      console.log('♻️ [BROWSER] Reusing existing browser instance');
      return this.browserInstance;
    }
    // Configure plugins
    firefox.use(
      RecaptchaPlugin({
        provider: {
          id: '2captcha',
          token: process.env.CAPTCHA_SOLVER_API_KEY || '',
        },
        visualFeedback: true,
      })
    );
    console.log('🆕 [BROWSER] Creating new browser instance');
    this.browserInstance = await firefox.launch({
      headless: true,
      args: [
        '--no-sandbox',
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
