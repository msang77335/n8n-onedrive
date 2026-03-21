FROM node:20-bookworm

WORKDIR /app

# =========================
# 1. Install Node deps
# =========================
COPY package*.json ./
RUN npm install

# =========================
# 2. Install Playwright Firefox + deps
# =========================
RUN npx playwright install --with-deps firefox

# =========================
# 2b. Install Chrome system dependencies
# =========================
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnspr4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
  && rm -rf /var/lib/apt/lists/*

# =========================
# 2c. Install Chrome for Puppeteer
# =========================
RUN npx puppeteer browsers install chrome

# =========================
# 3. Copy source code
# =========================
COPY . .

# =========================
# 4. Build app (optional)
# =========================
RUN npm run build || echo "No build script found, skipping build..."

# =========================
# 5. Expose port
# =========================
EXPOSE 3000

# =========================
# 6. Xvfb display
# =========================
ENV DISPLAY=:99

# =========================
# 7. Start app
# =========================
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x720x24 & npm start"]
