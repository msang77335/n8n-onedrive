import compression from 'compression';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

import path from 'node:path';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
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
app.use(helmet()); // Security headers
// app.use(cors({
//   origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
//   credentials: true,
// }));
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

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
  console.log(`🔗 API endpoints available at http://localhost:${PORT}${process.env.API_PREFIX || '/api/v1'}`);
});

// Set server timeout to 5 minutes
server.setTimeout(300000);

export default app;