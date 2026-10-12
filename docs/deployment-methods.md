# 三种部署方式与首次使用

同一份白泽提供标准版和 Lite。标准版需要 PostgreSQL；Redis 可配置，未配置时使用有界本机降级，不具备多实例共享限流保证。Lite 使用本地 SQLite，一个应用进程，不需要 PostgreSQL、Redis 或 ClickHouse。品牌、界面和 tracker 不变，两个 profile 不能直接更换镜像来转换数据库。

| 入口 | 上传/准备什么 | 部署机还需要什么 |
| --- | --- | --- |
| Docker 一键 | 完整源码包，或已验证的应用镜像及 Compose 配置 | Docker Engine、Compose v2；标准版 Compose 提供 PG/Redis |
| 预编译 Node 项目 | `node-ready` 运行包，已含 dist、tracker、依赖和维护入口 | Linux x64、符合实际 SQLite 门槛的 Node 24、Bash/flock；标准版还需外部 PG |
| 解压启动 | `bundled-node` 运行包，额外含已验证的 Node 二进制及许可证 | 相容的 Linux x64/glibc、Bash/flock；标准版仍需外部 PG |

运行包的实际 CPU/OS、Node/SQLite 版本、ELF 依赖及每个文件的校验值记录在 `release-manifest.json`。目前不承诺 Windows、macOS、ARM 或 Alpine 的原生运行包。附带 Node 不会附带数据库服务器、Docker、HTTPS 证书或进程管理器。源码 ZIP、只有 dist 的压缩包、Git bundle 都不是可以直接运行的 Node 项目。

## Docker

在私有源码目录运行 `bash install.sh` 或 `bash install-lite.sh`。安装器只初始化空的数据/密钥卷，已有非空卷不会被自动改权限。旧安装若报 `EXISTING_VOLUME_REQUIRES_OPERATOR_REPAIR`，先停止应用，核对卷与运行 UID/GID，备份后由本机管理员修正该卷的所有者和私有权限；不要将密钥目录设为全员可读写。

安装器会提示本地私有 `.baize/install-nonce.json`，不会打印凭证。浏览器填写该文件的 `nonce` 字段；完成后删除本地副本。应用数据库里的终态是凭证失效的依据，复制旧文件或恢复空用户备份不能重新创建管理员。已有账户直接登录。

镜像 save 只含应用及 Node 基底，不含 PG/Redis/CH，不能当完整离线安装器或数据备份。核对交付 SHA256 后，在包含同版本 Compose 与 scripts 的私有源码目录中加载。下面以已验交付 tag 为例；新交付必须使用 `docker load` 输出及交付清单中的准确 tag，不能保留 Compose 默认的 `baize-analytics:local`。

标准版（仅初装空实例；现有 `.env`、密钥、卷不得覆盖）：

```bash
umask 077
test ! -e .env && test ! -e .baize/master.key || exit 1
docker load -i /private/delivery/baize-standard-image-save.tar.gz
app_image=baize-validation:standard-2cf5c11
docker image inspect "$app_image" postgres:17-bookworm redis:7-bookworm >/dev/null
mkdir -p .baize
chmod 700 .baize
docker run --rm --pull=never --entrypoint node "$app_image" -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' > .baize/master.key
password="$(docker run --rm --pull=never --entrypoint node "$app_image" -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
printf 'BAIZE_IMAGE=%s\nPOSTGRES_PASSWORD=%s\nPUBLIC_URL=http://localhost:3000\nBAIZE_PORT=3000\nBAIZE_UID=%s\nBAIZE_GID=%s\n' "$app_image" "$password" "$(id -u)" "$(id -g)" > .env
unset password
chmod 600 .env .baize/master.key
docker compose --env-file .env config --quiet
bash scripts/init-empty-volumes.sh
docker compose --env-file .env up -d --no-build --pull never --wait --wait-timeout 120
docker compose cp app:/app/keys/install-nonce.json .baize/install-nonce.json >/dev/null
chmod 600 .baize/install-nonce.json
```

`docker image inspect` 会在缺依赖镜像时停止，不自动下载。联网部署者可先自行准备 PG/Redis 镜像；隔离离线机器须另行取得和校验这两个官方依赖 save，再 `docker load`。不能用应用 save 宣称依赖已交付。

Lite 不需要数据库服务镜像或标准版主密钥 secret：

```bash
umask 077
test ! -e .env || exit 1
docker load -i /private/delivery/baize-lite-image-save.tar.gz
app_image=baize-validation:lite-2cf5c11
docker image inspect "$app_image" >/dev/null
mkdir -p .baize
chmod 700 .baize
printf 'BAIZE_LITE_IMAGE=%s\nPUBLIC_URL=http://localhost:3000\nBAIZE_LITE_PORT=3000\nBAIZE_UID=%s\nBAIZE_GID=%s\n' "$app_image" "$(id -u)" "$(id -g)" > .env
chmod 600 .env
docker compose --env-file .env -f docker-compose.lite.yml config --quiet
bash scripts/init-empty-volumes.sh -f docker-compose.lite.yml
docker compose --env-file .env -f docker-compose.lite.yml up -d --no-build --pull never --wait --wait-timeout 120
docker compose -f docker-compose.lite.yml cp app:/app/keys/install-nonce.json .baize/install-nonce.json >/dev/null
chmod 600 .baize/install-nonce.json
```

卷初始化 helper 只运行上面已经明确加载并 inspect 的应用 tag；两条启动命令均禁止构建和拉取。浏览器填写本机 0600 文件中的一次性 nonce，完成后删除本地副本，不在终端或日志打印凭证。已有账户/恢复目标不用这套初装命令。

## 上传 Node 项目包或附带 Node 包

1. 核对私有交付里的 SHA256，解压对应版本/profile 的运行包到独立目录，例如 `/opt/baize/releases/版本-lite`。不放入静态网站目录，也不执行 `npm install`、`npm ci` 或 `npm run build`。
2. 为应用服务用户准备独立的持久数据和密钥目录，如 `/var/lib/baize/data`、`/var/lib/baize/keys`，由该用户拥有、权限 0700；配置文件放 `/etc/baize/baize.env`，由该用户拥有、0600。备份也放在发布目录和公开网站目录之外。新版本使用同一持久目录，不能把它们随发布目录一起删除。
3. Node-ready 选用满足包清单实际要求的 Node；附带 Node 包会由启动器使用 `runtime/bin/node`。配置以下字段，标准版另填自己的 `DATABASE_URL` 与独立 `MASTER_KEY_FILE`，维护工具还需要官方 PG 客户端。

```dotenv
HOST=127.0.0.1
PORT=3000
PUBLIC_URL=http://127.0.0.1:3000
DATA_DIR=/var/lib/baize/data
KEYS_DIR=/var/lib/baize/keys
```

4. 从发布目录运行 `bash scripts/release-start.sh --env-file /etc/baize/baize.env`。初始化凭证由服务器写入私有密钥目录里的 `install-nonce.json`，只在本机查看；切勿上传到公开网站。浏览器打开本机网址，填写凭证，按页面创建管理员、站点、复制 tracker、核对采集状态。初始化后凭证消费与管理员/首个会话同事务提交。
5. 临时终端启动只用于检查。长期运行使用随包附带的 systemd 示例，或既有面板的进程管理器，让服务独立于浏览器、SSH 和 Codex 会话。示例不会自动安装或启用服务。先确认重启后健康检查及登录仍可用，再开放反向代理。

### 宝塔等 Node 项目托管

先确认面板可以选择满足运行包要求的 Node。上传并解压**运行包**到 Node 项目目录；关闭自动安装依赖/自动构建，工作目录选择解压后的发布根目录。使用包里的 `npm start`，或指定 `dist/server/src/release/panel-start.js` 为启动文件；配置 `DATA_DIR`、`KEYS_DIR`、`HOST`、`PORT`、`PUBLIC_URL`，标准版另配置外部 PostgreSQL。附带 Node 包可让项目的启动命令使用 `bash scripts/release-start.sh --env-file 私有配置绝对路径`。不要选择 tracker、静态 `dist/web` 或源码 TypeScript 文件作为启动入口。

面板负责进程保活与重启；网页初始化不负责安装 Node 或托管进程。Node 服务启动后才有网页环境检查，它会显示运行版本、数据库和私有目录状态；无法启动时先使用本机启动器的非秘密错误码处理缺少 Node、PG 客户端、路径权限或运行库的问题。

参考面板官方 [Node 项目部署](https://docs.bt.cn/practical-tutorials/nextjs-deployment/)、[PM2 部署](https://docs.bt.cn/practical-tutorials/nodejs-pm2-deployment/)和 [SSL 配置](https://docs.bt.cn/getting-started/deploy-ssl/)。白泽的实际验收不等于已测试这些面板实例；面板示例中的旧 Node 版本不适用于本运行包。

## 初始化失败、HTTPS 与升级

创建管理员请求若响应中断，页面先核对 `/api/setup` 和会话状态。事务未提交可以重试；已提交后使用刚填写的账号密码登录，不会重新消费凭证或创建第二位管理员。建站响应中断先核对站点列表。恢复目标没有管理员时会明确阻止公开初始化，需由本机操作员选择含账户的有效恢复点，不会引导登录不存在的账户。

对外使用前配置 HTTPS 反向代理、正确的 `PUBLIC_URL` 与受信代理。不要把数据、密钥、备份或配置目录设置为静态根目录。网页检查的 HTTPS 配置提示不代表证书已验证；域名/证书和代理须由部署者实际检查，本轮不执行真实上线。

升级保留旧发布、配置和独立密钥；先停止源写入并获取验证过的备份，在新的数据库/目录中验证候选版本，再由操作员明确切换服务。失败保留源数据及恢复点。回滚恢复到兼容旧版本的新目标，同时回放最新独立删除日志；不能直接让旧程序读取新版数据库。恢复会撤销旧登录会话及临时授权，用户用原密码重新登录。标准版非 Docker PG-only 工具不支持严格 ClickHouse 历史权威模式，会提前拒绝。详细命令见 [原生维护](release-native-ops.md)、[Lite 部署](lite-deployment.md)及 [发布包清单](release-packages.md)。
