FROM node:22.22.2-alpine AS build

WORKDIR /app

COPY package*.json ./
# COPY docpouch-client-1.0.3.tgz ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
RUN npm ci

COPY src ./src

RUN npm run build

# Production stage
FROM node:22.22.2-alpine

WORKDIR /app

# Copy built files from build stage
COPY --from=build /app/dist ./dist
COPY package*.json ./
#COPY docpouch-client-1.0.3.tgz ./

RUN npm ci --omit=dev
RUN mkdir -p "/app/dist/db"

# #119: run as the unprivileged 'node' user instead of root.
# NOTE for existing installations upgrading to this image: any files
# previously created by the root container (e.g. the mounted ./db volume)
# must be chowned to uid/gid 1000 before the new container starts:
#   chown -R 1000:1000 ./db
RUN chown -R node:node /app
USER node

EXPOSE 3030

CMD ["node", "dist/srv/main.js"]