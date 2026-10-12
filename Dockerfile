# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true
COPY . .
RUN npm run build && chmod -R a+rX dist public src scripts sdk packages plugins db LICENSE package.json package-lock.json tsconfig*.json vite.config.ts
RUN node scripts/runtime-stage.mjs /app /runtime && chmod -R a+rX /runtime
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data KEYS_DIR=/app/keys
WORKDIR /app
RUN mkdir -p /app/data /app/keys && chown -R node:node /app/data /app/keys && chmod 1777 /app/data /app/keys
# One copy avoids repeatedly cloning node_modules with the cloud vfs driver.
# Build context explicitly excludes local databases, keys, credentials and backups.
COPY --from=build /runtime /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/src/server/main.js"]
