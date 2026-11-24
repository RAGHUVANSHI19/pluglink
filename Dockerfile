# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY . .
RUN --mount=type=secret,id=build_ca \
    if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --no-audit --no-fund && npm run build && npm cache clean --force

FROM build AS release
ENV NODE_ENV=production
CMD ["npm", "run", "db:migrate"]

FROM build AS runtime-files
RUN --mount=type=secret,id=build_ca \
    if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && test -f node_modules/.prisma/client/index.js \
    && mkdir -p /opt/pluglink/backend /opt/pluglink/frontend /opt/pluglink/data/uploads \
    && mv node_modules package.json /opt/pluglink/ \
    && mv backend/dist /opt/pluglink/backend/ \
    && mv frontend/dist /opt/pluglink/frontend/

FROM base AS runtime
ENV NODE_ENV=production PORT=3001 UPLOAD_DIR=/app/data/uploads
COPY --from=runtime-files --chown=node:node /opt/pluglink/ ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=25s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health', { signal: AbortSignal.timeout(4000) }).then(response => { if (!response.ok) process.exitCode = 1 }).catch(() => { process.exitCode = 1 })"]
CMD ["node", "backend/dist/server.js"]
