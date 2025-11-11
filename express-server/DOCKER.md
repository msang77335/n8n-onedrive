# Docker Usage Guide

## Available Dockerfiles

1. **Dockerfile** - Standard single-stage build
2. **Dockerfile.production** - Multi-stage build for production (smaller image)
3. **Dockerfile.dev** - Development build with hot reload

## Quick Start

### Build and run with standard Dockerfile:
```bash
docker build -t express-server .
docker run -d --name express-server -p 3000:3000 express-server
```

### Build and run production version:
```bash
docker build -f Dockerfile.production -t express-server:prod .
docker run -d --name express-server-prod -p 3000:3000 express-server:prod
```

### Build and run development version:
```bash
docker build -f Dockerfile.dev -t express-server:dev .
docker run -d --name express-server-dev -p 3000:3000 -v $(pwd)/src:/app/src express-server:dev
```

## Using Docker Compose

### Production:
```bash
docker-compose up -d
```

### Development:
```bash
docker-compose -f docker-compose.dev.yml up
```

## Useful Commands

### View logs:
```bash
docker logs express-server
docker logs -f express-server  # Follow logs
```

### Execute commands inside container:
```bash
docker exec -it express-server sh
```

### Stop and remove container:
```bash
docker stop express-server
docker rm express-server
```

### Remove image:
```bash
docker rmi express-server
```

### Check running containers:
```bash
docker ps
```

### Check image size:
```bash
docker images express-server
```

## Environment Variables

Set these environment variables when running the container:

- `NODE_ENV` - Set to 'production' for production
- `PORT` - Server port (default: 3000)
- `CORS_ORIGIN` - CORS origin URL (default: http://localhost:3001)

Example:
```bash
docker run -d \
  --name express-server \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e CORS_ORIGIN=https://your-domain.com \
  express-server
```

## Health Check

The container includes a health check endpoint at `/health`. You can check if the container is healthy:

```bash
docker inspect --format='{{.State.Health.Status}}' express-server
```

## Volume Mounting

To persist screenshots or mount configuration:

```bash
docker run -d \
  --name express-server \
  -p 3000:3000 \
  -v $(pwd)/screenshots:/app/screenshots \
  -v $(pwd)/.env:/app/.env \
  express-server
```

## Image Sizes

- Standard build (~900MB) - Includes dev dependencies during build
- Production build (~400-500MB) - Multi-stage build, only production dependencies
- Development build (~900MB) - All dependencies for development

## Troubleshooting

### Container not starting:
```bash
docker logs express-server
```

### Check if port is available:
```bash
lsof -i :3000
```

### Rebuild without cache:
```bash
docker build --no-cache -t express-server .
```

### Clean up all containers and images:
```bash
docker system prune -a
```