# PHP + MySQL 网页安装版

原 Node.js 标准版继续保留，原安装入口为仓库根目录 `install.sh`、`docs/PANEL_INSTALLATION.md`。本目录说明独立的 PHP 运行时，代码在 `php/`，安装包只携带预构建的 React / ECharts 前端和 tracker；接收服务器不需要 Node.js。

PHP 版使用独立的 InnoDB 文档表、事务锁行及队列租约，不执行 PostgreSQL 迁移，不将原库直接切换为 MySQL。原版的数据存档、scrypt 密码、加密设置和 ClickHouse 权威存储必须保留；没有经过验证的迁移工具时，不能直接复制表或替换正在运行的实例。PHP 目标为标准版功能；具体差异见本文兼容边界。

## 运行条件

- PHP 8.3 或更新版本，启用 `pdo_mysql`、`curl`、`mbstring`、`dom`、`Phar`、`openssl`、`zlib`、`intl`；地域库纯 PHP 解码还需 `bcmath` 或 `gmp`。CLI 与 PHP-FPM 使用同一版本、扩展、配置路径和网站运行用户。
- MySQL 8.4，InnoDB、UTF-8。MariaDB 部署需验证对应版本兼容性。
- 1Panel 网站的运行目录只指向安装包的 `public/`。配置、主密钥、删除日志和备份均在 `public/` 之外。
- 使用自己的 HTTPS 域名完成网页安装。数据库密码、供应商密钥在自己的安装页填写，不要发到聊天、工单或公开日志。
- 使用 PHP CLI 常驻队列，或 1Panel 每分钟执行一次计划任务。网站进程不承担可靠后台调度。

## 三步装完（推荐路径）

下面的命令在运行 PHP 的容器内执行（1Panel 用 `docker exec -it -u www-data <php容器>`），路径换成站点实际目录。

```sh
# 1. 自检：PHP 版本、扩展、私有目录；带上 BAIZE_DB_* 还能顺带测数据库连接
BAIZE_DB_HOST=mysql BAIZE_DB_NAME=baize BAIZE_DB_USER=baize BAIZE_DB_PASS='…' \
  php /www/sites/<域名>/index/bin/install.php --check

# 2. 安装：终端里问几个问题，装完直接登录，不需要打开安装页
php /www/sites/<域名>/index/bin/install.php --interactive

# 3. 队列：每分钟把采集到的事件聚合成看板数据
php /www/sites/<域名>/index/bin/worker.php --once
```

先运行 `--prepare`，再使用 `--interactive` 输入一次性 nonce、公开访问地址、数据库资料及管理员信息。nonce 和密码在终端中隐藏输入；无法安全关闭回显时会停止，改用下方受保护的 `--stdin-json` 管道。非敏感字段可用 `BAIZE_PUBLIC_URL`、`BAIZE_DB_*`、`BAIZE_ADMIN_*` 预置。

网页和 CLI 安装都必须提供 `--prepare` 生成的 nonce，它证明你有应用服务器的访问权。能连接数据库不能代替这项证明，本机、私网和公网数据库规则相同。公网数据库还需要操作者在服务端显式设置 `BAIZE_ALLOW_REMOTE_DB=1`。安装期间固定使用已校验的 IP；成功后保存操作者填写的服务名，供重启后正常解析。

`--interactive` 同样校验 nonce，不会自动跳过安装凭证。自动化凭据通过标准输入传递，避免放到命令参数中。

## 准备安装包

这是发布端操作；只在有源码和 Node.js 的构建环境执行：

```sh
npm ci
npm run build
node scripts/package-php.mjs --output /absolute/new/baize-php --archive /absolute/new/baize-php.tar.gz
node scripts/package-php.mjs --verify /absolute/new/baize-php
```

输出目录必须是新目录。打包清单包含每个文件的长度、SHA-256及权限，记录源码修订和构建时是否有未提交改动。代码目录为755、文件为644、CLI文件为755，空私有目录为700，不受发布环境umask影响。校验应在安装前、未加入实例配置时执行。打包脚本不递归复制仓库、私有配置、数据库、测试证据或 `node_modules`。

归档里的权限位由打包脚本统一写入，因此在 Windows/macOS 上打包同样可用：Windows 表达不了 POSIX 权限，脚本会在生成 tar 后重写头部权限字段，接收方用 `tar --same-permissions` 解出来就是 755/700/644，不需要再手工 `chmod`。

## 在 1Panel 安装

1. 创建 PHP 8.3+ 网站和独立数据库。解压安装包，将网站运行目录设为包内 `public/`；配置 HTTPS。命令行解压使用 `tar --same-permissions -xzf baize-php.tar.gz -C /your/new/directory` 保留包内权限；面板解压后按清单检查代码可读、私有目录为700。Nginx 规则参考包内 `deploy/nginx.conf.example`，其 PHP-FPM 地址需换为该站点现有运行环境的地址。
2. 为网站进程准备私有配置及数据目录，所有者设置为该网站实际PHP运行用户；目录700、配置和密钥文件600。代码保持目录755、文件644，不要将整个包改为私密或可写。可使用默认 `private/`，或在 PHP-FPM 与 CLI 共同设置 `BAIZE_CONFIG_PATH=/var/lib/baize-php/config.php`。不要通过 URL 读取配置、nonce 或主密钥。
3. 以 PHP-FPM 网站的同一运行用户，在同一 PHP 环境执行 `php bin/install.php --prepare`。命令显示私有安装凭据文件的位置；从服务器上读取后，在自己的 HTTPS 安装页输入。凭据不得放在查询字符串中。
4. 打开 `/install.php`，填写数据库连接、公开 HTTPS 地址、安装凭据和管理员信息。安装提交使用持久状态与数据库事务完成管理员认领。完成后安装入口关闭；删除所有用户也不能重新开放安装。
5. 登录后创建站点，按页面说明安装 tracker，再发送一个真实页面访问验证采集、统计、时区和隐私模式。
6. 配置 CLI worker。Supervisor 示例在 `deploy/worker.supervisor.conf.example`；计划任务示例在 `deploy/cron.example`。两者择一，确保配置路径与网站一致。常驻命令为 `php bin/worker.php --loop`，计划任务为 `php bin/worker.php --once`。

手动 CSV 导入允许5 MiB文件、最多100,000行；JSON封装需要较大的请求上限。示例使用 Nginx `client_max_body_size 32m`、PHP `post_max_size=32M`、`memory_limit=512M`、`max_execution_time=120`。采集接口仍在应用内限制为1 MiB。不要放宽私有文件的600/目录700权限来解决运行用户不同的问题。

### 1Panel 配置要点

面板会自行生成站点 vhost，包内 `deploy/nginx.conf.example` 只作参考。以下六点来自一次真实的 1Panel + PHP-FPM 8.3 + MySQL 8.4 部署，都是从"能打开安装页"到"看到统计数据"之间实际卡住的地方。

**① vhost 必须有 `try_files` 回退。** 面板生成的配置通常只有 `location ~ [^/]\.php(/|$)`，没有 `location /`，结果是 `/install.php` 能打开，但提交、`/app`、`/login`、`/api/*`、`/healthz` 全部由 nginx 直接 404（响应头 `Server: openresty`，PHP 日志里没有记录）。在站点配置里补：

```nginx
server {
    client_max_body_size 32m;               # 手动导入 JSON 需要；默认 1m 会 413
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
    location = /router.php { return 404; }  # 仅供 php -S 联调，不要对公网开放
    location ~ [^/]\.php(/|$) {
        include fastcgi_params;             # Debian 系的 fastcgi_params 已含 HTTPS 参数
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass <站点现有 PHP-FPM 地址>;
    }
}
```

缺少 `fastcgi_param HTTPS $https if_not_empty;` 时，安装页的 POST 会返回 `400 https_required`。

**② 面板路径与容器路径是两套。** 1Panel 常见布局：宿主机 `/opt/1panel/1panel/www/sites/<域名>/index`，容器内 `/www/sites/<域名>/index`（用 `docker inspect <php容器> -f '{{range .Mounts}}{{.Source}} => {{.Destination}}{{"\n"}}{{end}}'` 核对）。所有 CLI 命令必须同时满足两点：

- 用**容器内路径**，否则 `Could not open input file`；
- 用 `-u <FPM用户>` 执行，并确认新建的私有目录由该用户拥有；已有数据先备份，核对实际路径后仅修正需要调整的目录权限。

```bash
docker exec -u www-data <php容器> php /www/sites/<域名>/index/bin/install.php --prepare
docker exec -u www-data <php容器> cat /www/sites/<域名>/index/private/keys/install-nonce.json
```

**③ 网页安装被 CSRF 拦时走 CLI 通道。** 安装页会校验 `Origin` 与 `Sec-Fetch-Site`，某些浏览器、插件或前置代理会让提交固定返回 `403 csrf_origin_denied`。不必改代理，用 `--interactive` 在终端逐项回答即可；需要脚本化时再用 `--stdin-json`：

```bash
set -o pipefail
python3 -c '
import getpass, json, sys
def ask(label):
    print(label, end="", file=sys.stderr, flush=True)
    return input()
payload = {
    "installationNonce": getpass.getpass("nonce: "),
    "public_url": ask("公开 HTTPS 地址: "),
    "db_host": ask("数据库主机（容器/服务名）: "),
    "db_port": int(ask("数据库端口 [3306]: ") or "3306"),
    "db_name": ask("数据库名: "),
    "db_user": ask("数据库账号（不附加单独的授权来源）: "),
    "db_password": getpass.getpass("数据库密码: "),
    "name": ask("管理员姓名: "),
    "email": ask("管理员邮箱: "),
    "password": getpass.getpass("管理员密码: "),
}
print(json.dumps(payload, ensure_ascii=False))
' | docker exec -i -u www-data <php容器> php /www/sites/<域名>/index/bin/install.php --stdin-json
```

在交互终端执行，宿主机需有 Python 3。密码输入不回显，凭据只经标准输入传递，不写入命令参数、环境变量或临时文件。成功只打印 `安装完成。`。失败会打印错误码或异常信息（`--stdin-json` 与网页安装是同一套校验与事务，不会绕过任何安全检查）。

**④ 队列必须有消费者。** 面板计划任务里加一条每分钟执行：

```bash
docker exec -u www-data <php容器> php /www/sites/<域名>/index/bin/worker.php --once
```

不配置时采集接口照样返回 `202`，事件停在 `queue_jobs` 里，看板永久为空。

**⑤ 常见错误对照**

| 输出 | 原因 | 处理 |
| --- | --- | --- |
| `400 https_required` | vhost 未传 HTTPS | 加 `fastcgi_param HTTPS $https if_not_empty;` |
| `403 csrf_origin_denied` | 浏览器 Origin / Sec-Fetch-Site 不符 | 用 ③ 的 `--stdin-json` |
| `mkdir(): Permission denied` | `private/` 属主不是 FPM 用户 | `chown -R <uid>:<gid> private && chmod 700 private` |
| `[1045] Access denied for user ...` | 账号、密码或授权来源不匹配 | 核对账号字段与数据库授权；不要拼入面板单独显示的授权来源 |
| `[2002]` / `getaddrinfo failed` | 主机填了 `127.0.0.1` | 填面板显示的容器名（如 `mysql`） |
| `/login` 返回 openresty 404 | 缺 `try_files` | 见 ① |
| `database_unavailable` | 主机/库名/账号之一不对 | 用 `PDO` 单独连一次，看具体 SQLSTATE |

**⑥ 追踪代码的同意开关。** 复制代码时勾选「包含同意横幅」会生成 `data-consent-required="true"`，访客点击同意前不会上报任何数据；自用站点建议不勾选。已误加的，删掉该属性并清理 CDN 缓存即可恢复采集。

不要使用 PHP 内置开发服务器承载正式网站；本地联调可用 `php -S 127.0.0.1:8080 -t public public/router.php`。

## 备份、恢复、升级

备份不只包括数据库，还需要当前及历史主密钥、独立删除日志和配置。必须独立保留当前 `data_dir/privacy-deletions.jsonl`、`data_dir/privacy-watermark.json` 与 `key_dir/privacy-journal-identity.json`；这里的 `data_dir`、`key_dir` 指实例配置中的私有路径。数据库回滚后必须在对外服务之前重放保留下来的删除日志，防止旧备份使已经删除的访客、回放帧和派生内容重新出现。不得用旧备份覆盖较新的独立删除日志。恢复会验证删除日志身份；缺失日志或误建的空日志不能用于恢复旧备份，不能通过重新安装绕过。

操作入口为包内 `bin/backup.php`、`bin/restore.php`、`bin/export.php` 和 `bin/upgrade.php`；参数以各命令的帮助输出为准。升级前保留完整可恢复副本，升级后验证安装仍为终态、历史 namespace 未丢失以及删除日志重放结果。不能只验证数据库连接就删掉旧版。

```sh
php bin/backup.php /private/backups/baize-php.enc
php bin/restore.php /private/backups/baize-php.enc --replace
php bin/export.php SITE_ID /private/exports/site.json
php bin/upgrade.php
```

这些命令使用与网站相同的配置和运行用户；示例路径需替换为自己的私有目录。`--replace` 会替换目标实例数据，恢复前停止对外访问及队列，先保存当前完整副本。CLI worker在执行导出、通知或外部任务前先修复持久删除日志，避免数据库事务回滚后泄露已删除的数据。

## 兼容边界

PHP 存储采用文档记录与按站点锁定的事务，可保存原始明细和配置；其吞吐与原版 PostgreSQL / ClickHouse 的容量模型不同。部署容量需按实际工作负载测试。需要原版的大规模权威存储、实例增量更新协议或已有 Node 数据库原位升级时，继续使用 Node 标准版。

旧 Node scrypt 密码需要经过验证的重哈希迁移或独立重置；PHP 不会将不能验证的旧哈希当作有效密码。AES-GCM 历史信封只能在密钥与格式均明确时解密，不能据此承诺所有历史数据库直接兼容。外部供应商调用需要用户自己配置凭据；模拟提供商测试不等于真实账号联通。

### 与 Node 标准版的主要差异

- PHP 使用 MySQL/InnoDB 文档存储与站点事务锁，不运行 PostgreSQL 迁移，不提供 Node 数据库原位转换。Node scrypt 账号需要独立迁移或重置。
- 原始读取预算按站点保留事件计，超过 100000 条返回不可用；缩短查询日期不能绕过全站读取预算。
- PHP 实时数据通过短 SSE 流自动重连，需检查代理缓冲和超时配置。
- PHP 历史 namespace 与 Node ClickHouse 权威存储协议不同；旧 Node 存档不能直接导入。实例自动增量更新、ClickHouse 权威迁移使用 Node 版维护工具。
- daily-salt 不提供跨日访客识别；缺少历史明细、身份来源或会话上下文时返回未知与覆盖状态，不用零代替。收入按币种独立累计，不汇率换算。
- 回放保留最多 30 天。恢复需要最新独立删除日志及密钥，旧备份不会恢复已撤销的 Token、分享或邀请。
- 外部连接器、通知、SSO 和 AI 需要部署者配置自己的供应商账号，并验证实际可达性。
