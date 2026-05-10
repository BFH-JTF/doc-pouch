FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY docpouch-client-1.0.0.tgz ./
RUN npm ci

COPY src ./src

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built files from build stage
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY docpouch-client-1.0.0.tgz ./

RUN npm ci --omit=dev
RUN mkdir -p "/app/dist/db"

EXPOSE 3030

CMD ["node", "dist/srv/main.js"]