# Express Server

A Node.js Express server built with TypeScript, featuring modern development tools and best practices.

## Features

- 🚀 Express.js with TypeScript
- 🔐 Security middleware (Helmet, CORS, Rate limiting)
- 📝 Request logging with Morgan
- 🗜️ Response compression
- ⚡ Hot reload with Nodemon
- 🧪 Ready for testing with Jest
- 📋 ESLint configuration
- 🌍 Environment configuration
- 📸 **Screenshot API with Playwright**

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy environment file:

```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration

### Development

Start the development server:

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### Building

Build the project:

```bash
npm run build
```

### Production

Start the production server:

```bash
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Server health check

### Screenshot API
- `POST /api/v1/screenshot` - Take screenshot and return image directly

#### Screenshot Parameters
- `url` (required): The webpage URL to screenshot
- `width` (optional): Viewport width in pixels (default: 1920)
- `height` (optional): Viewport height in pixels (default: 1080) 
- `fullPage` (optional): Take full page screenshot (default: false)
- `format` (optional): Image format - "png" or "jpeg" (default: png)
- `quality` (optional): JPEG quality 1-100 (default: 80, only for JPEG)

#### Screenshot Example
```bash
curl -X POST http://localhost:3000/api/v1/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.google.com",
    "width": "1920",
    "height": "1080",
    "fullPage": "true",
    "format": "png"
  }' \
  --output screenshot.png
```

## Project Structure

```
src/
├── index.ts              # Application entry point
├── middleware/           # Custom middleware
│   ├── errorHandler.ts   # Error handling middleware
│   └── notFoundHandler.ts # 404 handler
└── routes/              # Route definitions
    ├── index.ts         # Main router
    └── screenshotRoutes.ts # Screenshot API routes
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm test` - Run tests

## License

ISC