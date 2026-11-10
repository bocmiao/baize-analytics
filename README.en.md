<p><img src="public/brand/baize-head.png" width="48" height="48" alt="Baize logo"></p>

# Baize Analytics

**Understand traffic, page performance and conversions on your own server.**

Baize is an open-source, self-hosted website analytics product. Add the tracking code to explore traffic trends, acquisition, page performance and conversions. Chinese and English interfaces are available.

Baize is under active development. [Bug reports and suggestions](https://github.com/bocmiao/baize-analytics/issues) and [pull requests](https://github.com/bocmiao/baize-analytics/pulls) are welcome.

[中文](README.md) · [Installation](docs/deployment-methods.md) · [PHP installation](docs/PHP_INSTALLATION.md) · [Documentation](docs/en/README.md) · [Contributing](CONTRIBUTING.md)

## Features

- **Understand visits:** pageviews, visitors, sessions, channels, UTM, popular pages, devices, geography and Web Vitals, with date filters and period comparisons.
- **Complete traffic details (Node Standard):** distinct IPs, offline IPv4/IPv6 geography and ISP data, today’s traffic forecast, event definitions and crawler access logs. [Setup guide](docs/TRAFFIC_DATA_SETUP.md) (Chinese).
- **Track events and conversions:** custom events and goals. Standard also offers funnels, paths and retention.
- **Manage multiple sites:** site permissions, exports, data retention and visitor deletion. Standard adds team invitations, sharing, scheduled reports and alerts.
- **Explore visitor behavior:** opt-in replay, heatmaps, visual event selection, and event comparisons in Standard.
- **Control your data:** collection consent, privacy settings and an independent deletion journal that is replayed during recovery.

## Interface

The workspace uses Baize’s blue and white palette, with dark mode and mobile layouts. Analytics are organized by task, with administration grouped under Settings. The preview uses a separate demonstration site's data. See [capture details and validation scope](docs/images/README.md).

The new traffic reports in this interface are available in **Node Standard**. Node Lite and the independent PHP application retain their existing capabilities. See the [product UI validation](docs/validation/BAIZE_PRODUCT_UI_20261110.md) and [feature matrix](docs/51LA_FUNCTION_MATRIX.md) (Chinese).

![Baize desktop interface](docs/images/baize-desktop.jpg)

<details>
<summary>Mobile layout</summary>

![Baize mobile interface](docs/images/baize-mobile.jpg)

</details>

## Choose a runtime

| Runtime | Storage and deployment | Scope |
| --- | --- | --- |
| **Node Standard** | PostgreSQL; the Docker installer includes PostgreSQL and Redis, or you can host the services separately | Full analytics, behavioral reports, collaboration and report management |
| **Node Lite** | Local SQLite and one application process; no separate database service | Core analytics, events and simple event goals |
| **Independent PHP application** | PHP 8.3+, PHP-FPM, MySQL and a CLI worker | PHP / 1Panel hosting; see the [PHP guide](docs/PHP_INSTALLATION.md) for feature coverage and database compatibility |

Lite does not include funnels, paths, retention, replay or heatmaps. It requires one local database writer and does not support network filesystems. To move to Node Standard, follow the [migration guide](docs/lite-migration.md).

PHP uses its own installer, tables and maintenance commands; existing Node data cannot be switched directly to MySQL. See [deployment](docs/en/deployment.md) for Node Standard's Redis and ClickHouse configurations.

## Quick start with Docker

Install **Docker Engine, Compose v2, Git and Bash** first. These commands build the image from source:

```bash
git clone https://github.com/bocmiao/baize-analytics.git
cd baize-analytics

# Choose one runtime
bash install.sh       # Node Standard
# bash install-lite.sh  # Node Lite
```

By default, Baize listens only on the installation machine's local interface at `http://localhost:3000`. The installer tells you where to find the private credential file, `.baize/install-nonce.json`.

1. Read its `nonce` field on the installation machine, enter it on the setup page and create your administrator account.
2. Create a site with its domain, timezone and privacy settings.
3. Add the site's tracker snippet to your website's `<head>`.
4. Visit the website, then check ingestion status and the new visit in Overview. Complete the consent step first if your site requires it.

Keep the installation credential private and delete the local copy after setup. Existing installations use their existing accounts.

For access from a NAS, another computer or the internet, configure the listening address, `PUBLIC_URL` and trusted proxies using the [network and reverse-proxy guide](docs/en/deployment.md). Use HTTPS for public access. Keep databases, keys and backups in private persistent directories or volumes.

Other installation paths:

- **NAS deployment on SSD storage:** [SSD paths, standalone Compose and ingestion checks](docs/NAS_TESTING.md) (Chinese).
- **Node hosting in 1Panel / Baota:** [installation and web setup](docs/PANEL_INSTALLATION.md).
- **Precompiled Node packages:** [deployment paths](docs/deployment-methods.md) and [package contents](docs/release-packages.md). Check the package's version, platform and SHA256 manifest.
- **PHP / MySQL:** [PHP installation](docs/PHP_INSTALLATION.md), with separate instructions for building a package and installing it on the target server.

## Documentation

| Task | Guide |
| --- | --- |
| Use the API, WordPress or mini-program SDK | [API](docs/en/api.md) · [WordPress plugin](plugins/wordpress/README.md) · [Tracker and SDK](packages/tracker/README.md) |
| Configure privacy and retention | [Privacy](docs/en/privacy.md) |
| Back up, restore, upgrade or migrate | [Maintenance and migration](docs/en/migration.md) · [Lite maintenance](docs/lite-deployment.md) · [Instance updates](docs/INSTANCE_INCREMENTAL_UPDATES.md) |
| Develop and test | [Development](docs/en/development.md) · [Contributing](CONTRIBUTING.md) |
| Check feature coverage and past validation | [Feature checklist](docs/IMPLEMENTATION_CHECKLIST.md) · [Version status and acceptance records](docs/STATUS.md) |

See the [documentation index](docs/README.md) for all guides. Historical test reports and runtime packages belong to their recorded source revisions; use the manifest and instructions for the version you deploy. The [repository maintenance record](docs/REPOSITORY_MAINTENANCE_20261110.md) lists this cleanup and the preserved historical attachments.

## Contributing

Installation reports, documentation fixes, UI improvements and code changes are welcome. Include your runtime, version, reproduction steps and sanitized logs in issues. In a PR, describe the change and the checks you actually ran.

Local development uses Node.js 24 and the dependencies locked in `package-lock.json`. Common checks are `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run build`. See the [development guide](docs/en/development.md) for database integration and browser-test prerequisites.

## License

The application is licensed under **AGPL-3.0-only**. The independent website tracker uses **MIT**. Embedding the tracker has different obligations from modifying or hosting the application. See [LICENSE](LICENSE) and [tracker LICENSE](packages/tracker/LICENSE).
