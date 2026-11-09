# 在 NAS 固态硬盘上部署测试实例

本页使用源码构建 **Node 标准版 + PostgreSQL 17 + Redis 7**。三个服务独立运行，程序源码、应用数据、数据库、密钥和 Redis 持久数据放在选定的 SSD 存储中。示例只开放白泽应用端口，不发布 PostgreSQL / Redis 端口，也不创建公网代理。

配置文件为 [`deploy/docker-compose.nas.example.yml`](../deploy/docker-compose.nas.example.yml)。它是完整、独立的 Compose 配置，不需要叠加根目录 `docker-compose.yml`，也不使用默认命名卷。

## 1. 确认固态存储与运行环境

NAS 需要 Linux、Docker Engine、Compose v2、Git、Bash 和 OpenSSL。先在 NAS 的存储管理器确认 SSD 对应的存储池和卷；SSD 缓存不等于用于存放文件的 SSD 卷。

可以辅助核对：

```bash
lsblk -o NAME,TYPE,SIZE,ROTA,MODEL,MOUNTPOINTS
findmnt -T /替换为实际SSD目录
docker info --format '{{.DockerRootDir}}'
docker compose version
id
```

`ROTA=0` 表示非旋转设备；有 RAID、LVM 或存储池时还要核对卷到物理盘的对应关系。Docker 镜像、构建缓存和容器日志的位置由 `DockerRootDir` 决定。若这些内容也需要放在 SSD 上，先通过 NAS 的容器管理设置确认其存储位置。本示例不迁移既有 Docker 目录。

将仓库克隆到 SSD 上的源码目录；数据使用同一 SSD 上的另一独立目录，例如：

```text
<SSD目录>/baize-source/       # Git 源码
<SSD目录>/baize-test/
  storage/app/               # 应用文件、删除日志、导出等
  storage/keys/              # 应用版本密钥、初始化凭证
  storage/postgres/          # PostgreSQL 数据
  storage/redis/             # Redis 持久数据
  secrets/master.key         # 主密钥
```

数据根目录必须是绝对路径，不能指向 SMB/NFS 挂载。以下命令均在 **仓库根目录**执行。

## 2. 准备私有配置和目录

先执行 `umask 077` 和 `mkdir -p .baize`，在忽略目录中创建 `.baize/nas.env`，权限设为 `0600`。配置示例中的路径和 UID/GID 换为当前 NAS 的实际值：

```dotenv
NAS_DATA_ROOT=/替换为实际SSD绝对路径/baize-test
NAS_LISTEN_IP=127.0.0.1
BAIZE_PORT=3000
PUBLIC_URL=http://localhost:3000
BAIZE_UID=1000
BAIZE_GID=1000
POSTGRES_PASSWORD=替换为随机生成的64位十六进制值
```

`POSTGRES_PASSWORD` 会用于数据库连接 URL，建议使用 `openssl rand -hex 32` 生成的值，直接写入私有文件，不粘贴到聊天或公开日志。`.env` 文件中的 `NAS_DATA_ROOT` 若含空格，需要用引号包围。

默认仅本机可访问。需要在局域网其他电脑上测试时，将 `NAS_LISTEN_IP` 改为 **NAS 的实际局域网地址**，并同步修改 `PUBLIC_URL=http://该地址:端口`。选择未被占用的端口；保持 NAS 路由和防火墙的公网入口关闭。

读取自己创建的配置，再检查数据目录：

```bash
umask 077
chmod 700 .baize
chmod 600 .baize/nas.env
set -a
. .baize/nas.env
set +a
case "$NAS_DATA_ROOT" in /*) ;; *) echo 'NAS_DATA_ROOT 必须是绝对路径' >&2; exit 1;; esac
findmnt -T "$(dirname "$NAS_DATA_ROOT")"
```

这里只初始化**全新的测试目录**。确认它不存在后，以具有目录管理权限的账号创建；已有实例保留原数据、密钥和所有者，不重新生成密钥或批量改权限。

```bash
test ! -e "$NAS_DATA_ROOT" || { echo '目录已存在，请核对后使用原配置' >&2; exit 1; }
mkdir -p "$NAS_DATA_ROOT/storage/app" "$NAS_DATA_ROOT/storage/keys" \
  "$NAS_DATA_ROOT/storage/postgres" "$NAS_DATA_ROOT/storage/redis" "$NAS_DATA_ROOT/secrets"
chmod 700 "$NAS_DATA_ROOT" "$NAS_DATA_ROOT/storage" "$NAS_DATA_ROOT/secrets" \
  "$NAS_DATA_ROOT/storage/app" "$NAS_DATA_ROOT/storage/keys" \
  "$NAS_DATA_ROOT/storage/postgres" "$NAS_DATA_ROOT/storage/redis"
openssl rand -hex 32 > "$NAS_DATA_ROOT/secrets/master.key"
chmod 600 "$NAS_DATA_ROOT/secrets/master.key"
chown "$BAIZE_UID:$BAIZE_GID" "$NAS_DATA_ROOT/storage/app" \
  "$NAS_DATA_ROOT/storage/keys" "$NAS_DATA_ROOT/secrets/master.key"
```

`BAIZE_UID` / `BAIZE_GID` 是应用容器实际使用的 Linux 数值身份，不是用户名。master.key 的 `0600` 文件必须由该 UID 拥有；本地 Compose 的文件 secret 不会替你转换宿主机文件所有者。PostgreSQL 和 Redis 使用各自官方镜像的默认入口管理新数据目录，不能强行套用应用 UID。

## 3. 检查配置、构建和启动

先做静态配置校验。`config --quiet` 只报告配置错误，不展开打印数据库密码：

```bash
docker compose --env-file .baize/nas.env -f deploy/docker-compose.nas.example.yml config --quiet
docker compose --env-file .baize/nas.env -f deploy/docker-compose.nas.example.yml build app
docker compose --env-file .baize/nas.env -f deploy/docker-compose.nas.example.yml up -d --wait --wait-timeout 180
docker compose --env-file .baize/nas.env -f deploy/docker-compose.nas.example.yml ps
```

所有持久目录由配置中的 `NAS_DATA_ROOT` 绑定挂载；`create_host_path: false` 会阻止 Docker 在路径拼错时自动创建空目录。需要核对实际挂载时，只查看 mount 信息，不输出完整容器环境：

```bash
docker inspect --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}' \
  "$(docker compose --env-file .baize/nas.env -f deploy/docker-compose.nas.example.yml ps -q app)"
```

PostgreSQL / Redis 同样可将最后的服务名换成 `postgres` / `redis` 核对。健康检查通过后，打开配置的 `PUBLIC_URL`。

## 4. 初始化与实际采集测试

新实例的初始化凭证位于 SSD 的 `storage/keys/install-nonce.json`。在 NAS 本机读取其中的 `nonce`，只在自己的初始化页面输入，随后创建管理员。应用完成初始化后，该凭证失效；已有账号正常登录。

按顺序验证：

1. 创建一个独立测试站点，设置实际测试网页的域名和时区。测试数据与正式网站分开。
2. 将白泽生成的 tracker 代码放入该测试网页；脚本地址应是浏览器能访问的白泽地址。
3. 浏览器打开测试网页，核对 tracker 加载、采集请求和采集状态。要求同意的站点先完成授权。
4. 等待后台聚合，再核对总览、页面和来源中的新访问；手动访问另一页面或触发测试事件，检查统计有对应变化。
5. 检查桌面、手机布局、深浅主题及登录退出。截图使用测试站点，不包含管理员凭证或正式访客信息。
6. 重启这组容器，重新登录并检查站点、访问记录和统计是否保留。

这里只验证自托管程序与实际浏览器采集。外部 AI、搜索、邮件等连接器需要各自的配置和测试，不由这套 Compose 自动开通。

## 5. 停启、备份与清理

```bash
docker compose --env-file .baize/nas.env -f deploy/docker-compose.nas.example.yml restart
docker compose --env-file .baize/nas.env -f deploy/docker-compose.nas.example.yml stop
docker compose --env-file .baize/nas.env -f deploy/docker-compose.nas.example.yml start
```

容器配置了 `restart: unless-stopped`。验证 NAS 重启后的状态时，确认 Docker 服务也能自启动。

备份需覆盖 PostgreSQL、应用文件、独立删除日志与水位、`storage/keys`、`secrets/master.key` 和私有配置。参考 [维护与迁移](migration.md)、[Node 原生维护](release-native-ops.md) 和 [部署运维](deployment.md) 中的备份与恢复要求。

本示例使用独立 Compose 文件和 SSD 绑定目录，不能直接套用假定根目录 Compose 或默认命名卷的备份命令。备份前核对服务名、挂载路径与数据库版本；数据库运行中不直接打包 PostgreSQL 数据目录。恢复应在新的测试目录进行，并验证删除日志重放和恢复后的登录。

停止测试只需要 `stop`，数据仍保留。需要移除容器时使用同一份 Compose 配置执行 `down`；它不会删除 SSD 绑定目录。清理源码或容器与删除测试数据是两件独立操作。
