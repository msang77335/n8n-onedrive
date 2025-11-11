# Screenshot API Examples

## Take Screenshot (Returns Image Directly)

### Basic Screenshot
```bash
curl -X POST http://localhost:3000/api/v1/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.google.com"
  }' \
  --output google-screenshot.png
```

### Custom Screenshot with Options
```bash
curl -X POST http://localhost:3000/api/v1/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.github.com",
    "width": "1920",
    "height": "1080",
    "fullPage": "true",
    "format": "png"
  }' \
  --output github-screenshot.png
```

### Take JPEG Screenshot
```bash
curl -X POST http://localhost:3000/api/v1/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://stackoverflow.com",
    "width": "1280",
    "height": "720",
    "format": "jpeg",
    "quality": "85"
  }' \
  --output stackoverflow-screenshot.jpg
```

## Parameters

### Screenshot Parameters
- `url` (required): The webpage URL to screenshot
- `width` (optional): Viewport width in pixels (default: 1920)
- `height` (optional): Viewport height in pixels (default: 1080) 
- `fullPage` (optional): Take full page screenshot (default: false)
- `format` (optional): Image format - "png" or "jpeg" (default: png)
- `quality` (optional): JPEG quality 1-100 (default: 80, only for JPEG)

## Response

The API now returns the image file directly instead of JSON. The response headers include:
- `Content-Type`: `image/png` or `image/jpeg`
- `Content-Length`: Size of the image in bytes
- `Content-Disposition`: Suggested filename

### Error Response (still JSON)
```json
{
  "success": false,
  "error": "URL is required"
}
```

## Notes
- The API returns the image binary data directly
- Use `--output filename` with curl to save the image
- Content-Type header indicates the image format
- Error responses are still returned as JSON