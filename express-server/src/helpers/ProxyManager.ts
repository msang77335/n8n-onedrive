import axios from 'axios';

interface ProxyListResponse {
  results: Array<{
    proxy_address: string;
    ports?: { http: number };
    port?: number;
    username: string;
    password: string;
  }>;
}

export class ProxyManager {
  private static instance: ProxyManager | null = null;
  private proxies: string[] = [];
  private currentProxyIndex: number = 0;
  private isInitialized: boolean = false;
  private refreshIntervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): ProxyManager {
    if (!this.instance) {
      this.instance = new ProxyManager();
    }
    return this.instance;
  }

  async initialize(authToken?: string, refreshIntervalMs: number = 3600000): Promise<void> {
    if (!authToken) {
      console.warn('⚠️ [PROXY MANAGER] No Webshare auth token provided, running without proxy');
      this.isInitialized = true;
      return;
    }

    console.log('🔄 [PROXY MANAGER] Initializing proxies from Webshare API...');
    await this.refreshProxies(authToken);

    // Set up auto-refresh interval (default: 1 hour)
    this.refreshIntervalId = setInterval(async () => {
      console.log('🔄 [PROXY MANAGER] Refreshing proxies...');
      await this.refreshProxies(authToken);
    }, refreshIntervalMs);

    this.isInitialized = true;
    console.log('✅ [PROXY MANAGER] Proxy manager initialized and refreshing every ' + Math.round(refreshIntervalMs / 60000) + ' minutes');
  }

  private async refreshProxies(authToken: string): Promise<void> {
    try {
      const proxies = await this.fetchProxiesFromWebshare(authToken);
      if (proxies.length > 0) {
        this.proxies = proxies;
        this.currentProxyIndex = 0;
        console.log(`✅ [PROXY MANAGER] Loaded ${proxies.length} proxies`);
      } else {
        console.warn('⚠️ [PROXY MANAGER] No proxies loaded, continuing with empty list');
      }
    } catch (error) {
      console.error('❌ [PROXY MANAGER] Failed to refresh proxies:', error);
    }
  }

  private async fetchProxiesFromWebshare(
    authToken: string,
    page: number = 1,
    pageSize: number = 100
  ): Promise<string[]> {
    try {
      const response = await axios.get<ProxyListResponse>(
        `https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=${page}&page_size=${pageSize}`,
        {
          headers: {
            'Authorization': authToken,
          }
        }
      );

      // Log response structure for debugging
      console.log(`📋 [WEBSHARE] Fetched ${response.data.results?.length || 0} proxies from API`);

      // Check if results exist
      if (!response.data.results || response.data.results.length === 0) {
        console.warn(`⚠️ [WEBSHARE] No proxies found in response`);
        return [];
      }

      const proxies = response.data.results.map((proxy: any) => {
        // Handle different proxy response formats
        let proxyString = '';
        
        if (proxy?.ports?.http && proxy?.proxy_address && proxy?.username && proxy?.password) {
          // Format: IP:PORT:USERNAME:PASSWORD
          proxyString = `${proxy.proxy_address}:${proxy.ports.http}:${proxy.username}:${proxy.password}`;
        } else if (proxy?.proxy_address && proxy?.port && proxy?.username && proxy?.password) {
          // Alternative format if structure is different
          proxyString = `${proxy.proxy_address}:${proxy.port}:${proxy.username}:${proxy.password}`;
        } else {
          console.warn(`⚠️ [WEBSHARE] Skipping proxy with unexpected structure:`, {
            proxy_address: proxy?.proxy_address,
            ports: proxy?.ports,
            port: proxy?.port,
            username: proxy?.username ? '***' : 'missing',
            password: proxy?.password ? '***' : 'missing'
          });
          return null;
        }
        
        return proxyString;
      }).filter((p: string | null) => p !== null);

      console.log(`✅ [WEBSHARE] Successfully formatted ${proxies.length} proxies`);
      return proxies;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log more details about the error
      if (axios.isAxiosError(error)) {
        console.error(`⚠️ [WEBSHARE] API Error: ${error.response?.status} - ${error.message}`);
      } else {
        console.error(`⚠️ [WEBSHARE] Failed to load proxies: ${errorMessage}`);
      }
      
      throw error;
    }
  }

  getNextProxy(): string | null {
    if (this.proxies.length === 0) {
      console.warn('⚠️ [PROXY MANAGER] No proxies available');
      return null;
    }
    const proxy = this.proxies[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
    return proxy;
  }

  getProxyCount(): number {
    return this.proxies.length;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async shutdown(): Promise<void> {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    this.proxies = [];
    this.isInitialized = false;
    console.log('✅ [PROXY MANAGER] Shutdown complete');
  }
}
