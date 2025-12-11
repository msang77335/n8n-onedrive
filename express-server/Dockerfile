FROM node:18

RUN apt-get update && apt-get install -y --no-install-recommends \
  firefox-esr \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build || echo "No build script found, skipping build..."

EXPOSE 3000

CMD ["npm", "start"]
