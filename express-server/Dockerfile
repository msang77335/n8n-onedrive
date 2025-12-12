FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install && \
  npx playwright install-deps    

COPY . .

RUN npm run build || echo "No build script found, skipping build..."

EXPOSE 3000

CMD ["npm", "start"]
