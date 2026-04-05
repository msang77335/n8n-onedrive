import compression from 'compression';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

import path from 'node:path';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { ProxyManager } from './helpers/ProxyManager';
import apiRoutes from './routes';

// Load environment variables
dotenv.config();

const app = express();
// Trust proxy only from localhost/Docker network (more secure than 'true')
// If behind nginx/proxy, set to number of proxies or specific IP ranges
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "blob:"],
    },
  },
})); 

app.use(compression()); // Compress responses
app.use(morgan('combined')); // Logging
app.use(limiter); // Rate limiting
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Increase timeout for long-running requests (5 minutes)
app.use((req, res, next) => {
  req.setTimeout(5 * 60 * 1000);
  res.setTimeout(5 * 60 * 1000);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response): void => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use(process.env.API_PREFIX || '/api/v1', apiRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize Proxy Manager
const initializeProxyManager = async () => {
  const proxyManager = ProxyManager.getInstance();
  const webshareToken = process.env.WEBSHARE_TOKEN;
  const proxyRefreshInterval = Number.parseInt(process.env.PROXY_REFRESH_INTERVAL_MS || '3600000'); // Default 1 hour

  if (webshareToken) {
    try {
      await proxyManager.initialize(webshareToken, proxyRefreshInterval);
      console.log(`✅ Proxy manager initialized with ${proxyManager.getProxyCount()} proxies`);
    } catch (error) {
      console.error('❌ Failed to initialize proxy manager:', error);
      console.warn('⚠️ Server will continue without proxies');
    }
  } else {
    console.warn('⚠️ WEBSHARE_TOKEN not set, running without proxies');
  }
};

// Start server
const startServer = async () => {
  // Initialize proxy manager BEFORE accepting requests to avoid race conditions
  await initializeProxyManager();

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📊 Health check available at http://localhost:${PORT}/health`);
    console.log(`🔗 API endpoints available at http://localhost:${PORT}${process.env.API_PREFIX || '/api/v1'}`);
  });

  // Set server timeout to 5 minutes
  server.setTimeout(300000);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM signal received: closing HTTP server');
    server.close(async () => {
      console.log('HTTP server closed');
      const proxyManager = ProxyManager.getInstance();
      await proxyManager.shutdown();
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    console.log('🛑 SIGINT signal received: closing HTTP server');
    server.close(async () => {
      console.log('HTTP server closed');
      const proxyManager = ProxyManager.getInstance();
      await proxyManager.shutdown();
      process.exit(0);
    });
  });
};

startServer();

export default app;