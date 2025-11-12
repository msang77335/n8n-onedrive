import { Request, Response, Router } from 'express';
import { ProxyManager } from '../helpers/proxyManager';

const router = Router();

// GET /api/v1/proxies - List all proxies
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const proxies = ProxyManager.getProxies();
    
    console.log(`📋 [PROXY] Retrieved ${proxies.length} proxies`);
    
    res.json({
      success: true,
      count: proxies.length,
      proxies: proxies.map(proxy => ({
        id: proxy.id,
        name: proxy.name,
        server: proxy.server,
        type: proxy.type,
        active: proxy.active,
        hasAuth: !!(proxy.username && proxy.password)
      }))
    });
  } catch (error: any) {
    console.error(`💥 [PROXY] Error listing proxies:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to list proxies',
      message: error.message
    });
  }
});

// GET /api/v1/proxies/active - List only active proxies
router.get('/active', async (req: Request, res: Response): Promise<void> => {
  try {
    const activeProxies = ProxyManager.getActiveProxies();
    
    console.log(`📋 [PROXY] Retrieved ${activeProxies.length} active proxies`);
    
    res.json({
      success: true,
      count: activeProxies.length,
      proxies: activeProxies.map(proxy => ({
        id: proxy.id,
        name: proxy.name,
        server: proxy.server,
        type: proxy.type,
        active: proxy.active,
        hasAuth: !!(proxy.username && proxy.password)
      }))
    });
  } catch (error: any) {
    console.error(`💥 [PROXY] Error listing active proxies:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to list active proxies',
      message: error.message
    });
  }
});

// GET /api/v1/proxies/next - Get next proxy using round-robin
router.get('/next', async (req: Request, res: Response): Promise<void> => {
  try {
    const nextProxy = ProxyManager.getNextProxy();
    
    if (!nextProxy) {
      res.status(404).json({
        success: false,
        error: 'No active proxies available'
      });
      return;
    }
    
    console.log(`🔄 [PROXY] Selected next proxy (round-robin): ${nextProxy.name}`);
    
    res.json({
      success: true,
      proxy: {
        id: nextProxy.id,
        name: nextProxy.name,
        server: nextProxy.server,
        type: nextProxy.type,
        active: nextProxy.active,
        hasAuth: !!(nextProxy.username && nextProxy.password)
      }
    });
  } catch (error: any) {
    console.error(`💥 [PROXY] Error getting next proxy:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get next proxy',
      message: error.message
    });
  }
});

// GET /api/v1/proxies/random - Get random active proxy
router.get('/random', async (req: Request, res: Response): Promise<void> => {
  try {
    const randomProxy = ProxyManager.getRandomProxy();
    
    if (!randomProxy) {
      res.status(404).json({
        success: false,
        error: 'No active proxies available'
      });
      return;
    }
    
    console.log(`🎲 [PROXY] Selected random proxy: ${randomProxy.name}`);
    
    res.json({
      success: true,
      proxy: {
        id: randomProxy.id,
        name: randomProxy.name,
        server: randomProxy.server,
        type: randomProxy.type,
        active: randomProxy.active,
        hasAuth: !!(randomProxy.username && randomProxy.password)
      }
    });
  } catch (error: any) {
    console.error(`💥 [PROXY] Error getting random proxy:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get random proxy',
      message: error.message
    });
  }
});

// GET /api/v1/proxies/:id - Get specific proxy by ID
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const proxy = ProxyManager.getProxyById(id);
    
    if (!proxy) {
      res.status(404).json({
        success: false,
        error: `Proxy with ID '${id}' not found`
      });
      return;
    }
    
    console.log(`📋 [PROXY] Retrieved proxy: ${proxy.name}`);
    
    res.json({
      success: true,
      proxy: {
        id: proxy.id,
        name: proxy.name,
        server: proxy.server,
        type: proxy.type,
        active: proxy.active,
        hasAuth: !!(proxy.username && proxy.password)
      }
    });
  } catch (error: any) {
    console.error(`💥 [PROXY] Error getting proxy:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get proxy',
      message: error.message
    });
  }
});

// POST /api/v1/proxies/refresh - Refresh proxy list from environment
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const proxies = ProxyManager.refreshProxies();
    
    console.log(`🔄 [PROXY] Refreshed proxy list: ${proxies.length} proxies loaded`);
    
    res.json({
      success: true,
      message: 'Proxy list refreshed successfully',
      count: proxies.length,
      proxies: proxies.map(proxy => ({
        id: proxy.id,
        name: proxy.name,
        server: proxy.server,
        type: proxy.type,
        active: proxy.active,
        hasAuth: !!(proxy.username && proxy.password)
      }))
    });
  } catch (error: any) {
    console.error(`💥 [PROXY] Error refreshing proxies:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh proxy list',
      message: error.message
    });
  }
});

// POST /api/v1/proxies/reset-rotation - Reset proxy round-robin rotation
router.post('/reset-rotation', async (req: Request, res: Response): Promise<void> => {
  try {
    ProxyManager.resetProxyRotation();
    
    console.log(`🔄 [PROXY] Reset proxy rotation to start from beginning`);
    
    res.json({
      success: true,
      message: 'Proxy rotation reset successfully'
    });
  } catch (error: any) {
    console.error(`💥 [PROXY] Error resetting proxy rotation:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset proxy rotation',
      message: error.message
    });
  }
});

// POST /api/v1/proxies/test/:id - Test specific proxy
router.post('/test/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const proxy = ProxyManager.getProxyById(id);
    
    if (!proxy) {
      res.status(404).json({
        success: false,
        error: `Proxy with ID '${id}' not found`
      });
      return;
    }
    
    console.log(`🧪 [PROXY] Testing proxy: ${proxy.name}`);
    
    // For now, just return proxy info
    // TODO: Implement actual proxy testing with a test request
    res.json({
      success: true,
      message: `Proxy ${proxy.name} configuration retrieved`,
      proxy: {
        id: proxy.id,
        name: proxy.name,
        server: proxy.server,
        type: proxy.type,
        active: proxy.active,
        hasAuth: !!(proxy.username && proxy.password)
      },
      note: 'Proxy testing functionality to be implemented'
    });
  } catch (error: any) {
    console.error(`💥 [PROXY] Error testing proxy:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to test proxy',
      message: error.message
    });
  }
});

export default router;