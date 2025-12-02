# N8N + Browserless Setup

Dự án này thiết lập môi trường automation với N8N và Browserless Chrome để thực hiện các tác vụ web scraping và automation.

## 🚀 Cấu trúc Project

```
n8n-browserless/
├── docker-compose.yml      # Production setup
├── docker-compose.dev.yml  # Development setup
├── .env.dev               # Environment variables cho dev
└── README.md              # Tài liệu này
```

## 📋 Yêu cầu

- Docker
- Docker Compose

## 🛠️ Hướng dẫn chạy

### Production Mode

```bash
# Chạy production
docker compose up -d

# Dừng
docker compose down
```

### Development Mode

```bash
# Chạy development với project name riêng
docker compose -p automation-dev -f docker-compose.dev.yml up -d

# Hoặc sử dụng .env.dev
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d

# Xem logs
docker compose -p automation-dev -f docker-compose.dev.yml logs -f

# Dừng development
docker compose -p automation-dev -f docker-compose.dev.yml down
```

## 🔧 Cấu hình

### Browserless
- **Port**: 3000
- **API Token**: `JLIyO58cbu`
- **Container**: Chạy Chrome headless để automation

### N8N
- **Port**: 5678
- **Web UI**: http://localhost:5678
- **Timezone**: Asia/Ho_Chi_Minh
- **Data**: Lưu trong Docker volume `n8n_data`

## 📊 Truy cập Services

| Service | URL | Description |
|---------|-----|-------------|
| N8N Web UI | http://localhost:5678 | Giao diện quản lý workflows |
| Browserless | http://localhost:3000 | Chrome API endpoint |
| Express API | http://localhost:8000 | Screenshot & Proxy API |
| Health Check | http://localhost:8000/health | API health status |

## 🔌 API Endpoints

### Screenshot API

#### Single Screenshot
```bash
curl -X POST http://localhost:8000/api/v1/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "width": "1920",
    "height": "1080",
    "fullPage": true,
    "format": "png",
    "useProxy": true,
    "proxyId": "tor-http"
  }' \
  --output screenshot.png
```

#### Batch Screenshots
```bash
# Sequential processing
curl -X POST http://localhost:8000/api/v1/batch-screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://example.com",
      "https://httpbin.org/ip",
      "https://github.com"
    ],
    "width": "1920",
    "height": "1080",
    "format": "png",
    "useProxy": true,
    "parallel": false
  }'

# Parallel processing with concurrency
curl -X POST http://localhost:8000/api/v1/batch-screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://example.com", "https://httpbin.org", "https://github.com"],
    "parallel": true,
    "maxConcurrency": 3,
    "useProxy": true
  }'
```

### Proxy Management API

```bash
# List all proxies
curl http://localhost:8000/api/v1/proxies

# Get active proxies only
curl http://localhost:8000/api/v1/proxies/active

# Get next proxy (round-robin)
curl http://localhost:8000/api/v1/proxies/next

# Get random proxy
curl http://localhost:8000/api/v1/proxies/random

# Get specific proxy by ID
curl http://localhost:8000/api/v1/proxies/tor-http

# Refresh proxy list from environment
curl -X POST http://localhost:8000/api/v1/proxies/refresh

# Reset proxy rotation
curl -X POST http://localhost:8000/api/v1/proxies/reset-rotation
```

## 🔗 Kết nối N8N với Browserless

Trong N8N workflows, sử dụng:
- **Browserless URL**: `http://browserless:3000`
- **API Token**: `JLIyO58cbu`

## 📝 Commands hữu ích

```bash
# Xem containers đang chạy
docker ps

# Xem volumes
docker volume ls

# Backup N8N data
docker run --rm -v n8n_data:/source -v $(pwd):/backup alpine tar czf /backup/n8n-backup.tar.gz -C /source .

# Restore N8N data
docker run --rm -v n8n_data:/target -v $(pwd):/backup alpine tar xzf /backup/n8n-backup.tar.gz -C /target

# Xem logs của service cụ thể
docker compose logs n8n
docker compose logs browserless
```

## 🐛 Troubleshooting

### Container name conflicts
Nếu gặp lỗi container name đã tồn tại:
```bash
# Dùng project name khác
docker compose -p my-project-name -f docker-compose.dev.yml up -d
```

### Port conflicts
Nếu port đã được sử dụng, sửa trong file docker-compose:
```yaml
ports:
  - "5679:5678"  # Đổi port 5678 thành 5679
```

### Volume permissions
Nếu gặp lỗi permission:
```bash
# Fix permissions
docker run --rm -v n8n_data:/data alpine chown -R 1000:1000 /data
```

## 🔄 Workflow Development

1. Truy cập N8N: http://localhost:5678
2. Tạo workflow mới
3. Sử dụng HTTP Request node để gọi Browserless:
   - URL: `http://browserless:3000/content`
   - Headers: `Authorization: Bearer JLIyO58cbu`
4. Test và debug workflow
5. Export workflow khi hoàn thành

## 📚 Tài liệu tham khảo

- [N8N Documentation](https://docs.n8n.io/)
- [Browserless API](https://docs.browserless.io/)
- [Docker Compose Reference](https://docs.docker.com/compose/)