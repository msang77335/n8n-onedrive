import type { Browser } from 'playwright';
import { firefox } from 'playwright';

export class BrowserSingleton {
  private static browserInstance: Browser | null = null;

  static async getInstance(): Promise<Browser> {
    if (this.browserInstance?.isConnected()) {
      console.log('♻️ [BROWSER] Reusing existing browser instance');
      return this.browserInstance;
    }
    console.log('🆕 [BROWSER] Creating new Firefox browser instance');
    this.browserInstance = await firefox.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    this.browserInstance.on('disconnected', () => {
      console.log('🔌 [BROWSER] Browser disconnected');
      this.browserInstance = null;
    });
    
    return this.browserInstance;
  }
}
