# 白泽优化版新构建交付（129d972）

本交付软件冻结于 `129d972cde1ba8d3da97a130e3adf70f8673402d`。所有六包从新环境完整 Dockerfile 构建生成；旧7509481包、镜像、哈希及证据保留，不是这些新包的来源。逐件 bytes/MiB/SHA256 见同目录 `DELIVERY_INDEX_NEW_129d972.json` 和 `SHA256SUMS`。

先在交付文件目录运行 `sha256sum -c SHA256SUMS`。不得把旧安装说明中7509481的白名单替换成任意镜像。本文件给出这次129d972的新镜像身份；冻结源码内旧交付说明仍保留历史身份。

| profile | 精确 tag | immutable image ID |
| --- | --- | --- |
| standard | `baize-new:standard-129d972` | `sha256:857643f99ad924c86e4acbab313f3635a3d627c44cd66907684282ae546c8df1` |
| lite | `baize-new:lite-129d972` | `sha256:af3e70ad04f6599ed45c115840b97ce1b0b5ee20a00974fcad20878bab33dd88` |

两版镜像的 `org.opencontainers.image.revision` 必须为以上完整软件 SHA，`org.opencontainers.image.source` 必须为 `https://github.com/bocmiao/baize-analytics`。不得把旧标签或旧镜像改标当成新构建。

## 离线 Docker 初装

使用该冻结 SHA 的私有源码目录，保留其 Compose 文件及 `scripts/init-empty-volumes.sh`。标准 save 包含标准应用、PostgreSQL17-bookworm、Redis7-bookworm；Lite save 包含Lite应用，基础Node层在各应用镜像内。没有ClickHouse、运行配置、数据或密钥。

标准先运行 `docker load -i /absolute/delivery/baize-standard-docker-offline-129d972.tar.gz`；Lite先运行 `docker load -i /absolute/delivery/baize-lite-docker-offline-129d972.tar.gz`。记录 load 输出并用 `docker image inspect` 核对上表ID和完整revision。

仅对全新空实例按冻结指南准备0600 `.env`、全新私有目录和独立随机密钥。标准配置 `BAIZE_IMAGE=baize-new:standard-129d972`、全新 `POSTGRES_PASSWORD`、`BAIZE_UID/BAIZE_GID` 和 loopback 端口。Lite配置 `BAIZE_LITE_IMAGE=baize-new:lite-129d972`、`BAIZE_UID/BAIZE_GID` 和 loopback 端口。配置 `PUBLIC_URL` 与实际入口一致。已有数据/卷不可当空实例初始化。

标准在源码目录顺序执行：

```bash
docker compose --env-file .env config --quiet
bash scripts/init-empty-volumes.sh --env-file .env
docker compose --env-file .env up -d --no-build --pull never --wait --wait-timeout 120
```

Lite顺序执行：

```bash
docker compose -f docker-compose.lite.yml --env-file .env config --quiet
bash scripts/init-empty-volumes.sh -f docker-compose.lite.yml --env-file .env
docker compose -f docker-compose.lite.yml --env-file .env up -d --no-build --pull never --wait --wait-timeout 120
```

从app的 `/app/keys/install-nonce.json` 私下取得一次性安装凭证，复制文件权限保持0600；不要公开凭证、日志或数据。然后通过安装页面完成账号认领。首次安装和登录已在新建隔离项目实际执行，两版均成功。测试结束只停止容器，保留卷用于复核。

## 原生运行包

以运行账号执行 `tar --same-permissions -xzf baize-PROFILE-VARIANT-linux-x64-129d972.tar.gz`。四包清单完整验证后，用包内 `scripts/release-start.sh --env-file /absolute/private/runtime.env` 启动；环境文件必须0600、归运行账号所有并在release之外，DATA_DIR和KEYS_DIR也必须在release之外且互不重叠。不要递归修改已封存文件权限。

Node-ready需要宿主Node24；bundled-node提供同构建镜像的官方Node24.21.0，glibc最低2.28，其他共享库需求见manifest。标准需要外部PostgreSQL和受信PG客户端，维护环境须配置 `MASTER_KEY_FILE`；Redis可选。两版维护均按包内 `docs/release-native-ops.md` 执行，目标必须全新。标准新目标数据库名须以 `baize_restore_` 开头；停止全部源写入者后才执行维护。恢复阻断旧安装凭证，不自动切流量。

## 本次验证边界

四包各602个compiled/public文件与独立宿主编译逐件一致。镜像standard1080文件、Lite664文件同源检查零差异；发布器锁版本校验标准169项、Lite166项，封存清单及真实tar解压校验通过。四包各自真实启动、nonce认领、cookie认证、前端HTML、shell备份/新目标恢复均成功，恢复owner=1且安装入口阻断。

新源回归批次28通过、1跳过、0失败；专门补测真实PG dump/restore批次5通过、0跳过、0失败（其中4项重复，不相加）。发布器9/9通过。初轮缺Git历史、PG测试用户名不匹配及原生测试参数遗漏/命名错误均保留失败记录，最终成功批次另存。历史全量1160、标准浏览器48、Lite5是此前源批次，没有改计为新镜像全量回归。

Node-ready实际宿主24.19.0/SQLite3.53.3；bundled-node及镜像24.21.0/SQLite3.53.4。没有验证生产、真实宝塔、Windows/macOS/ARM/Alpine、物理断电/磁盘故障、旧5000容量重跑或整台1C2G长期容量。标准500ms性能目标仍未通过，历史混合性能结论不改写。本次未重测性能，不把打包成功当性能改善。
