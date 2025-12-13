FROM node:20-bookworm

# =========================
# 1. System dependencies
# =========================
RUN apt-get update && apt-get install -y \
  wget unzip xvfb \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxrandr2 \
  libgbm1 libasound2 \
  fonts-liberation \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# =========================
# 2. Install Node deps
# =========================
COPY package*.json ./
RUN npm install

# =========================
# 3. Install Playwright Firefox + deps
# =========================
RUN npx playwright install --with-deps firefox

# =========================
# 4. Install Chrome for Testing (Puppeteer)
# =========================
RUN mkdir -p /app/chrome && \
  wget -q https://storage.googleapis.com/chrome-for-testing-public/121.0.6167.85/linux64/chrome-linux64.zip && \
  unzip chrome-linux64.zip -d /app/chrome && \
  chmod +x /app/chrome/chrome-linux64/chrome && \
  rm chrome-linux64.zip

# =========================
# 5. Chrome profile (persist)
# =========================
RUN mkdir -p /app/chrome-profile

# =========================
# 6. Copy source code
# =========================
COPY . .

# =========================
# 7. Build app (optional)
# =========================
RUN npm run build || echo "No build script found, skipping build..."

# =========================
# 8. Expose port
# =========================
EXPOSE 3000

# =========================
# 9. Xvfb display
# =========================
ENV DISPLAY=:99

# =========================
# 10. Start app
# =========================
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x720x24 & npm start"]
