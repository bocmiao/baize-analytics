#!/usr/bin/env bash
set -euo pipefail
# Only disposable loopback fixtures: every suite creates and drops its own random database.
root=$(cd "$(dirname "$0")/.." && pwd)
image=${BAIZE_PHP_TEST_IMAGE:-baize-php-test:intl-20261015}
container=${BAIZE_PHP_TEST_CONTAINER:-}
ports=${BAIZE_PHP_TEST_PORTS:-'3307 3308'}
for port in $ports; do
  case "$port" in 3307|3308) ;; *) echo 'Use disposable local test database ports 3307/3308 only' >&2; exit 1;; esac
  for suite in kernel collect analytics governance sso platform keyring manual-search providers mcp annotations; do
    if [ -n "$container" ]; then
      docker exec -e BAIZE_TEST_DB_PORT="$port" -e BAIZE_TEST_PORT="$port" -w /app "$container" php "php/tests/$suite.php"
    else
      docker run --rm --network host -e BAIZE_TEST_DB_PORT="$port" -e BAIZE_TEST_PORT="$port" -v "$root:/app" -w /app "$image" php "php/tests/$suite.php"
    fi
  done
done
