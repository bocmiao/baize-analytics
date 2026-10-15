FROM php:8.3-cli-bookworm@sha256:c24b55afdf860c874b9ec6267ced132ff52de97d308ab08e6cf41e8596e509f7
RUN apt-get update \
 && apt-get install -y --no-install-recommends libicu-dev \
 && docker-php-ext-install -j2 pdo_mysql bcmath intl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
