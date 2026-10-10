# syntax=docker/dockerfile:1

# ---- build: install production dependencies (native better-sqlite3) ----
FROM node:22.20.0-alpine3.22 AS build
WORKDIR /app
# Build tools are only needed if no prebuilt better-sqlite3 binary matches.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- runtime ----
FROM node:22.20.0-alpine3.22
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    HOME_ENABLED=true \
    AI_ENABLED=false
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY backend ./backend
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
CMD ["node", "backend/server.js"]
