export interface ProxyConfig {
  id: string;
  name: string;
  server: string;
  username?: string;
  password?: string;
  type: 'http' | 'socks5';
  active: boolean;
}

export class ProxyManager {
  private static proxies: ProxyConfig[] = [];
  private static currentProxyIndex: number = 0;

  static loadProxiesFromEnv(): ProxyConfig[] {
    const proxies: ProxyConfig[] = [];

    // Load custom proxies from environment
    const proxyList = process.env.PROXY_LIST;
    if (proxyList) {
      try {
        const customProxies = JSON.parse(proxyList);
        if (Array.isArray(customProxies)) {
          for (const [index, proxy] of customProxies.entries()) {
            proxies.push({
              id: `custom-${index}`,
              name: proxy.name || `Custom Proxy ${index + 1}`,
              server: proxy.server,
              username: proxy.username,
              password: proxy.password,
              type: proxy.type || 'http',
              active: proxy.active !== false
            });
          }
        }
      } catch (error) {
        console.error('Error parsing PROXY_LIST:', error);
      }
    }

    console.log(`✅ [PROXY MANAGER] Loaded ${proxies.length} proxies from environment`);
    console.log(`🌐 [PROXY MANAGER] Proxies: ${proxies.map(p => p.server).join(', ')}`);

    this.proxies = proxies;
    return proxies;
  }

  static getProxies(): ProxyConfig[] {
    if (this.proxies.length === 0) {
      this.loadProxiesFromEnv();
    }
    return this.proxies;
  }

  static getActiveProxies(): ProxyConfig[] {
    return this.getProxies().filter(proxy => proxy.active);
  }

  static getProxyById(id: string): ProxyConfig | undefined {
    return this.getProxies().find(proxy => proxy.id === id);
  }

  static getNextProxy(): ProxyConfig | undefined {
    const activeProxies = this.getActiveProxies();
    if (activeProxies.length === 0) return undefined;
    
    // Round-robin selection
    const selectedProxy = activeProxies[this.currentProxyIndex];
    
    // Move to next proxy (with wraparound)
    this.currentProxyIndex = (this.currentProxyIndex + 1) % activeProxies.length;
    
    return selectedProxy;
  }

  static getRandomProxy(): ProxyConfig | undefined {
    const activeProxies = this.getActiveProxies();
    if (activeProxies.length === 0) return undefined;
    
    const randomIndex = Math.floor(Math.random() * activeProxies.length);
    return activeProxies[randomIndex];
  }

  static resetProxyRotation(): void {
    this.currentProxyIndex = 0;
  }

  static formatProxyForPlaywright(proxy: ProxyConfig): any {
    const config: any = {
      server: proxy.server
    };

    if (proxy.username && proxy.password) {
      config.username = proxy.username;
      config.password = proxy.password;
    }

    return config;
  }

  static refreshProxies(): ProxyConfig[] {
    this.proxies = [];
    return this.loadProxiesFromEnv();
  }
}