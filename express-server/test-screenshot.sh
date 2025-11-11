#!/bin/bash

echo "🚀 Testing Screenshot API..."
echo

# Test 1: Basic screenshot
echo "📸 Test 1: Taking screenshot of Google (returns image directly)..."
curl -X POST http://localhost:3000/api/v1/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.google.com",
    "width": "1280",
    "height": "720"
  }' \
  --output google-screenshot.png

if [ -f "google-screenshot.png" ]; then
  echo "✅ Google screenshot saved as google-screenshot.png"
  file_size=$(stat -f%z google-screenshot.png 2>/dev/null || stat -c%s google-screenshot.png)
  echo "📁 File size: $file_size bytes"
else
  echo "❌ Failed to save Google screenshot"
fi

echo
echo "---"
echo

# Test 2: Full page screenshot
echo "� Test 2: Taking full page screenshot of GitHub..."
curl -X POST http://localhost:3000/api/v1/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com",
    "width": "1920",
    "height": "1080",
    "fullPage": "true",
    "format": "png"
  }' \
  --output github-screenshot.png

if [ -f "github-screenshot.png" ]; then
  echo "✅ GitHub screenshot saved as github-screenshot.png"
  file_size=$(stat -f%z github-screenshot.png 2>/dev/null || stat -c%s github-screenshot.png)
  echo "📁 File size: $file_size bytes"
else
  echo "❌ Failed to save GitHub screenshot"
fi

echo
echo "---"
echo

# Test 3: JPEG screenshot
echo "📸 Test 3: Taking JPEG screenshot..."
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

if [ -f "stackoverflow-screenshot.jpg" ]; then
  echo "✅ StackOverflow screenshot saved as stackoverflow-screenshot.jpg"
  file_size=$(stat -f%z stackoverflow-screenshot.jpg 2>/dev/null || stat -c%s stackoverflow-screenshot.jpg)
  echo "📁 File size: $file_size bytes"
else
  echo "❌ Failed to save StackOverflow screenshot"
fi

echo
echo "✅ Screenshot API tests completed!"
echo "📁 Screenshots saved in current directory:"
ls -la *.png *.jpg 2>/dev/null | head -10