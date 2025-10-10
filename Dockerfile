FROM node:18-alpine
WORKDIR /app

# install deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# copy source and build
COPY . .
RUN npm run build

EXPOSE 3333
ENV NODE_ENV=production
CMD ["node", "lib/server.js"]
