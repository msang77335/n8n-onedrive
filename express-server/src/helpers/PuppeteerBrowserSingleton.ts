import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
import { ProxyManager } from './ProxyManager';

puppeteerExtra.use(StealthPlugin());

export class PuppeteerBrowserSingleton {
  private static browserInstance: Browser | null = null;
  private static pages: Page[] = [];
  private static pageIndex: number = 0;
  private static readonly MAX_PAGES = 3;
  private static currentProxy: string | null = null;
  private static launchedWithProxy: string | null = null;
  private static proxyCredentials: { username: string; password: string } | null = null;
  private static useProxyManager: boolean = true;

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

  static setUseProxyManager(use: boolean): void {
    this.useProxyManager = use;
    console.log(`🔄 [PUPPETEER] ProxyManager auto-load ${use ? 'enabled' : 'disabled'}`);
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

    // Determine which proxy to use: manual override or auto-load from ProxyManager
    let proxyToUse = this.currentProxy;
    if (!proxyToUse && this.useProxyManager) {
      const proxyManager = ProxyManager.getInstance();
      if (proxyManager.isReady() && proxyManager.getProxyCount() > 0) {
        proxyToUse = proxyManager.getNextProxy();
        console.log(`🌐 [PUPPETEER] Loaded proxy from ProxyManager`);
      } else {
        console.warn('⚠️ [PUPPETEER] ProxyManager not ready or no proxies available');
      }
    }

    // Add proxy to launch args if configured
    if (proxyToUse) {
      const proxyUrl = this.formatProxyUrl(proxyToUse);
      if (proxyUrl) {
        launchArgs.push(`--proxy-server=${proxyUrl}`);
        console.log(`🌐 [PUPPETEER] Browser launching with proxy: ${proxyToUse.split(':')[0]}:${proxyToUse.split(':')[1]}`);
        this.launchedWithProxy = proxyToUse;
        // Store credentials separately for page.authenticate()
        this.storeProxyCredentials(proxyToUse);
      } else {
        console.warn('⚠️ [PUPPETEER] Invalid proxy configuration, launching without proxy');
        this.launchedWithProxy = null;
      }
    } else {
      this.launchedWithProxy = null;
      this.proxyCredentials = null;
    }

    this.browserInstance = await puppeteerExtra.launch({
      headless: false,
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
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

      // Set up proxy authentication if credentials exist
      if (this.proxyCredentials) {
        await this.setupProxyAuthentication(page);
        console.log(`🔐 [PUPPETEER] Proxy authentication configured for page ${nextIndex + 1}`);
      }

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
    
    // Set up proxy authentication if credentials exist
    if (this.proxyCredentials) {
      await this.setupProxyAuthentication(page);
      console.log(`🔐 [PUPPETEER] Proxy authentication configured for fresh page`);
    }
    
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
      this.proxyCredentials = null;
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
    // Return proxy URL WITHOUT credentials to avoid ERR_NO_SUPPORTED_PROXIES
    // Credentials will be handled separately via request interception with Proxy-Authorization header
    return `http://${ip}:${port}`;
  }

  private static storeProxyCredentials(proxy: string): void {
    const parts = proxy.split(':');
    if (parts.length === 4) {
      this.proxyCredentials = {
        username: parts[2],
        password: parts[3],
      };
      console.log(`🔐 [PUPPETEER] Proxy credentials stored for authentication`);
    }
  }

  private static async setupProxyAuthentication(page: Page): Promise<void> {
    if (!this.proxyCredentials) {
      return;
    }

    // page.authenticate() handles the 407 Proxy Authentication Required challenge
    // This is the correct approach for HTTPS CONNECT tunneling through authenticated proxies
    await page.authenticate(this.proxyCredentials);

    console.log(`🔐 [PUPPETEER] Proxy authentication configured via page.authenticate()`);
  }
}
