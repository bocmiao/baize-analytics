# Fixed companion runtime. Application code/config/data are supplied separately.
FROM node:24-bookworm-slim AS node
FROM php:8.3-fpm-bookworm@sha256:f768bd9142444f6126a690697b028c23f30878c3b628a7c355dfce75e29cc045
RUN apt-get update && apt-get install -y --no-install-recommends nginx libicu-dev \
 && docker-php-ext-install -j2 pdo_mysql pcntl bcmath intl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/LICENSE /opt/baize-updater/NODE-LICENSE
COPY --chmod=0755 dist/updater /opt/baize-updater
USER 1000:1000
WORKDIR /opt/baize-updater
ENTRYPOINT ["node","/opt/baize-updater/baize-updater.mjs"]
CMD ["--config","/run/secrets/updater.json"]
