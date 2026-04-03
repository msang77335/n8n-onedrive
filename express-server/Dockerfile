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
RUN npx playwright install --with-deps firefox chromium

# =========================
# 2b. Install Chromium from Debian repos (for Puppeteer to use)
# =========================
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-l10n \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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
