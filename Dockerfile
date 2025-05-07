FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
RUN npm ci

COPY src ./src

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built files from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

RUN npm ci --omit=dev

EXPOSE 80

CMD ["node", "dist/srv/main.js"]