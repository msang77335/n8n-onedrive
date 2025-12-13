import { Browser, BrowserContext } from 'playwright';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
const { firefox } = require('playwright-extra')

export class PlaywrightBrowserSingleton {
  private static browserInstance: Browser | null = null;
  private static browserContext: BrowserContext | null = null;

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
      headless: false,
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

  static async getContext(): Promise<BrowserContext | null> {
    if (this.browserContext) {
      console.log('♻️ [BROWSER CONTEXT] Reusing existing browser context');
      return this.browserContext;
    }
    const browser = await this.getInstance();
    if (!browser) {
      console.error('❌ [BROWSER CONTEXT] Cannot create context, browser instance is null');
      return null;
    }
    console.log('🆕 [BROWSER CONTEXT] Creating new browser context');
    this.browserContext = await browser.newContext({ viewport: { width: 1280, height: 1080 } });
    this.browserContext.on('close', () => {
      console.log('🔌 [BROWSER CONTEXT] Browser context closed');
      this.browserContext = null;
    });
    return this.browserContext;
  }
}
