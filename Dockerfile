# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app

# Toolchain for better-sqlite3 in case no prebuilt binary matches.
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM deps AS prod-deps
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=4000 \
  DATA_DIR=/data
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist/web ./dist/web
COPY package.json ./
COPY --chmod=755 entrypoint.sh /usr/local/bin/acquire-entrypoint
RUN mkdir -p /data && chown node:node /data
# Starts as root to fix /data ownership, then runs as `node`.
ENTRYPOINT ["acquire-entrypoint"]
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/web/server/server.mjs"]
