FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build the project if TypeScript
RUN npm run build || echo "No build script found, skipping..."

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]