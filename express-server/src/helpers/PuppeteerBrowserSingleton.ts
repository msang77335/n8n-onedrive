import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';

puppeteerExtra.use(StealthPlugin());

export class PuppeteerBrowserSingleton {
  private static browserInstance: Browser | null = null;
  private static pages: Page[] = [];
  private static pageIndex: number = 0;
  private static readonly MAX_PAGES = 5;
  private static currentProxy: string | null = null;
  private static launchedWithProxy: string | null = null;

  static setProxy(proxy: string | null): void {
    this.currentProxy = proxy;
    if (proxy) {
      console.log(`🔄 [PUPPETEER] Proxy will be set to: ${proxy.split(':')[0]}:${proxy.split(':')[1]}`);
    } else {
      console.log(`🔄 [PUPPETEER] Proxy disabled`);
    }
  }

  static getProxy(): string | null {
    return this.currentProxy;
  }

  static async getInstance(): Promise<Browser | null> {
    // Check if proxy has changed - if so, recreate browser
    if (this.browserInstance && this.currentProxy !== this.launchedWithProxy) {
      console.log('🔄 [PUPPETEER] Proxy changed, closing existing browser instance...');
      await this.close();
    }

    if (this.browserInstance) {
      console.log('♻️ [PUPPETEER] Reusing existing browser instance');
      return this.browserInstance;
    }

    // Configure recaptcha plugin
    puppeteerExtra.use(
      RecaptchaPlugin({
        provider: {
          id: '2captcha',
          token: process.env.CAPTCHA_SOLVER_API_KEY || '',
        },
        visualFeedback: true,
      })
    );

    console.log('🆕 [PUPPETEER] Creating new browser instance');
    
    // Build launch args with proxy if configured
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ];

    // Add proxy to launch args if configured
    if (this.currentProxy) {
      const proxyUrl = this.formatProxyUrl(this.currentProxy);
      if (proxyUrl) {
        launchArgs.push(`--proxy-server=${proxyUrl}`);
        console.log(`🌐 [PUPPETEER] Browser launching with proxy: ${this.currentProxy.split(':')[0]}:${this.currentProxy.split(':')[1]}`);
        this.launchedWithProxy = this.currentProxy;
      } else {
        console.warn('⚠️ [PUPPETEER] Invalid proxy configuration, launching without proxy');
        this.launchedWithProxy = null;
      }
    } else {
      this.launchedWithProxy = null;
    }

    this.browserInstance = await puppeteerExtra.launch({
      headless: false,
      // executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      args: launchArgs,
    });

    if (this.browserInstance) {
      this.browserInstance.on('disconnected', () => {
        console.log('🔌 [PUPPETEER] Browser disconnected');
        this.browserInstance = null;
        this.pages = [];
        this.pageIndex = 0;
        this.launchedWithProxy = null;
      });
      console.log('✅ [PUPPETEER] Browser instance created successfully');
    }

    return this.browserInstance;
  }

  static async getPage(): Promise<Page | null> {
    const browser = await this.getInstance();
    if (!browser) {
      console.error('❌ [PUPPETEER] Cannot create page, browser instance is null');
      return null;
    }

    const nextIndex = this.pageIndex % this.MAX_PAGES;

    if (this.pages[nextIndex] && !this.pages[nextIndex].isClosed()) {
      console.log(`♻️ [PUPPETEER] Reusing page ${nextIndex + 1}/${this.MAX_PAGES}`);
    } else {
      console.log(`🆕 [PUPPETEER] Creating page ${nextIndex + 1} on demand...`);
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1280 });

      page.on('close', () => {
        console.log(`🔌 [PUPPETEER] Page ${nextIndex + 1} closed`);
        this.pages[nextIndex] = undefined as any;
      });

      this.pages[nextIndex] = page;
      console.log(`✅ [PUPPETEER] Page ${nextIndex + 1} created`);
    }

    const page = this.pages[nextIndex];
    this.pageIndex = (this.pageIndex + 1) % this.MAX_PAGES;

    return page;
  }

  static async newPage(): Promise<Page | null> {
    const browser = await this.getInstance();
    if (!browser) {
      console.error('❌ [PUPPETEER] Cannot create page, browser instance is null');
      return null;
    }

    console.log('🆕 [PUPPETEER] Creating a fresh page...');
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1280 });
    console.log('✅ [PUPPETEER] Fresh page created');
    return page;
  }

  static async close(): Promise<void> {
    if (this.browserInstance) {
      console.log('🔌 [PUPPETEER] Closing browser instance...');
      await this.browserInstance.close();
      this.browserInstance = null;
      this.pages = [];
      this.pageIndex = 0;
      this.currentProxy = null;
      this.launchedWithProxy = null;
      console.log('✅ [PUPPETEER] Browser instance closed');
    }
  }

  private static formatProxyUrl(proxy: string): string {
    const parts = proxy.split(':');
    if (parts.length !== 4) {
      console.error('❌ [PUPPETEER] Invalid proxy format. Expected IP:PORT:USERNAME:PASSWORD');
      return '';
    }
    const ip = parts[0];
    const port = parts[1];
    const username = encodeURIComponent(parts[2]);
    const password = encodeURIComponent(parts[3]);
    return `http://${username}:${password}@${ip}:${port}`;
  }
}
