# The supervisor is fixed in the image; application versions are a separate persistent volume.
FROM postgres:17-bookworm AS pgtools
FROM node:24-bookworm-slim
ENV NODE_ENV=production
COPY dist/updater /opt/baize-updater
COPY --from=pgtools /usr/lib/postgresql/17 /opt/postgresql/17
COPY --from=pgtools /usr/lib/x86_64-linux-gnu /opt/postgresql/lib
USER node
WORKDIR /opt/baize-updater
# No Docker socket. Configuration and initial sealed version must be supplied by the operator.
CMD ["node","/opt/baize-updater/baize-updater.mjs","--config","/run/secrets/updater.json"]
