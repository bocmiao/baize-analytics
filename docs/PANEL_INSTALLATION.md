# 在 1Panel 安装原 Node 版白泽（兼容宝塔）

本页适用于保留的原 Node 标准版与 Node Lite：先让面板启动后台服务，再在你自己的 HTTPS 页面检查环境、创建管理员、添加站点，最后取得追踪代码。Node 运行包保留现有后端、React 界面和分析能力。独立的 PHP + 数据库网页安装版使用 [PHP 安装指南](PHP_INSTALLATION.md)，其运行环境、迁移和守护任务与本页分开配置。

## 1. 选择运行方式

标准版需要 PostgreSQL；Lite 使用单进程本地 SQLite。预编译 node-ready 包需要 Linux x64/glibc、受支持的 Node 24、Bash 和 flock；bundled-node 包附带 Node。请使用同一版本的运行包与 SHA256 清单，先校验再解压，不在预编译包内运行 npm install 或重新构建。获取与构建方法见[发布包说明](release-packages.md)，源码 Docker 部署见[部署方式](deployment-methods.md)。

两种运行方式不能通过换包转换数据库。标准版原生维护目前支持 PG-only；ClickHouse 使用单独维护流程。PHP-FPM/MySQL 使用[PHP 安装指南](PHP_INSTALLATION.md)。

## 2. 在面板准备目录和配置

以下为路径约定，可改为你的面板实际路径，但三类位置必须分开：

| 用途 | 例子 | 要求 |
| --- | --- | --- |
| 发布目录 | `/opt/baize/releases/baize-lite-node-ready-linux-x64-REVISION` | 解压后的包根目录，保留包内权限，不存数据和配置 |
| 数据与密钥 | `/var/lib/baize/data`、`/var/lib/baize/keys` | 独立持久目录，实际应用用户拥有，0700；不同实例不得共用 |
| 私有配置 | `/etc/baize/runtime.env` | 实际应用用户拥有，0600，普通文件，不能是链接或硬链接，不能放入发布/数据/密钥/网站目录 |
| 日志目录 | `/var/log/baize` | 面板守护器能够写入；不映射成网站目录 |

通过面板文件管理或自己的受信终端，以实际服务用户准备目录。不要自动递归改已有目录所有者/权限，不删除或清空任何旧目录。存在旧配置和数据库时，转到后面的升级说明，不按空实例重装。

解压到发布父目录（目标必须是新的独立目录，保留内部权限）：

```bash
test ! -e /opt/baize/releases/baize-lite-node-ready-linux-x64-REVISION
tar --same-permissions -xzf baize-lite-node-ready-linux-x64-REVISION.tar.gz -C /opt/baize/releases
```

在你自己的 HTTPS 面板私有文件编辑器中填写 runtime.env，不把实际密码、连接串或安装凭证发到聊天、工单或截图。Lite 最少配置：

```dotenv
HOST=127.0.0.1
PORT=3000
PUBLIC_URL=https://analytics.your-domain.example
DATA_DIR=/var/lib/baize/data
KEYS_DIR=/var/lib/baize/keys
GEOIP_AUTO_DOWNLOAD=0
```

PUBLIC_URL 改为你自己的最终 HTTPS 域名。标准版还需由你在私有配置中填入已有、最小权限 PostgreSQL 账号的 DATABASE_URL。应用会在私有密钥目录创建密钥；已有密钥必须保留，不要从其他实例复制或覆盖。数据库、域名、系统路径由部署者在面板配置，网页向导负责应用初始化，不会开放任意服务器配置写入或从网页安装数据库。

## 3. 1Panel 受管启动（推荐入口）

进入 1Panel 的“工具箱 → 进程守护”，确认其 Supervisor 功能可用。不同版本具体控件可能不同，下面按字段映射，不要求安装新系统账户或改变面板权限。若你的版本没有该功能，可由现有管理员采用随包 systemd 示例；同一个应用只用一个进程管理器。

| 字段 | Lite NodeReady 例子 |
| --- | --- |
| 名称 | `baize` |
| 运行目录 | `/opt/baize/releases/baize-lite-node-ready-linux-x64-REVISION` |
| 启动命令 | `/bin/bash /opt/baize/releases/baize-lite-node-ready-linux-x64-REVISION/scripts/release-start.sh --env-file /etc/baize/runtime.env` |
| 用户 | 你已有的专用非 root 服务用户，并与私有文件所有者一致 |
| 进程数量 | 1；Lite 只允许一个本地写入实例 |
| Node | 将实际 Node 24 的 bin 路径放进该守护进程 PATH，不依赖 SSH 登录 shell 的 PATH |
| 日志 | 发布目录外的私有日志文件，开启轮换 |

标准版换成标准发布目录，命令形式不变。可以导入 [Supervisor program 配置](../deploy/baize.supervisor.conf.example)，逐项替换绝对路径和已有用户；如果面板自行创建管理配置，只填 program 字段，不另外启动第二个 supervisord。检查 `stopasgroup=true`、`killasgroup=true`、停止超时 30 秒、异常退出自动重启；不要对同一目录同时开 systemd、PM2 和 Supervisor。

启动成功后，在本机检查：

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/healthz
```

返回 ok 且 database 为 ready 才继续。RUNNING 只表示进程存在，不能代替健康检查。关闭终端后服务仍应受面板监督；意外退出恢复后再次核对 healthz。正常点“停止”用于维护，守护器不应立即抢先拉起。

如果进程守护本身在容器里，先确认它能看到同一发布/私有目录、Node 及数据库网络；不能把宿主机 127.0.0.1 或路径直接假定为容器内同一位置。

## 4. 配置 HTTPS 后完成网页三步

在 1Panel 创建反向代理网站，转发到实际可达的本地服务地址，绑定你的域名并配置有效 HTTPS 证书。面板代理若在容器内，用其实际能够访问的受限地址，保持应用端口不向公网直接开放。核对 PUBLIC_URL；只信任你明确管理的反向代理，不填写任意受信代理地址。

1. 用自己的浏览器打开 `https://你的域名/setup`。应用启动后，在私有 KEYS_DIR 找到 install-nonce.json，仅通过自己的受信文件管理界面读取 nonce 字段，把它填入自己 HTTPS 页面里的“安装凭证”。不要把它放入 URL、聊天、日志、发布包或公开下载目录。
2. 点“检查运行环境”。应显示 Node、系统/架构、存储可用、schema、数据及密钥目录可用且私密。检查只读取状态，不创建管理员，不消耗凭证。检查环境也会把凭证通过 POST 发往本站受保护的诊断接口。网页显示 HTTPS 配置不等于实际证书及公网可达性验证；无运行进程时，网页也无法替你安装 Node。
3. 填姓名、邮箱和至少 12 位的独立密码，创建管理员；随后添加首站点并复制追踪代码。进入看板后，按追踪说明验证采集。整个过程不需要填任何云平台或项目开发会话凭据。

初始化凭证在管理员、会话和终态事务成功后被移除，不能重复安装或创建第二个首任管理员。安装后走普通登录；站点管理员不等于可升级整个实例的拥有者。

## 5. 宝塔使用相同运行包

优先在已有进程守护中使用与上面相同的启动命令、私有配置及工作目录。若使用宝塔 Node 项目托管，选择兼容 Node 24，关闭自动安装依赖/自动构建，工作目录为包根目录，入口使用包内 npm start 或 dist/server/src/release/panel-start.js，并在项目环境中私下配置持久目录及数据库。启动器的 --env-file 方式更便于明确私有文件位置；不要把 .env 放入密封发布目录。

保持单进程，不为 Lite 配置 cluster 多实例。不上传到 PHP 网站目录，不选择 tracker 或 dist/web 作为服务入口。面板负责保活和反向代理，应用网页只负责应用初始化。

## 6. 中断、重复安装和升级

| 情况 | 正确处理 |
| --- | --- |
| 还没提交管理员时进程中断 | 面板重新启动，使用原配置、数据和凭证；不要删除目录重装 |
| 提交后网络断开 | 先重新检查初始化状态；已完成则用刚创建的账号普通登录，不重新提交 |
| 首站点创建结果不确定 | 向导先核对站点列表，选择已有站点，不连续点击新建 |
| 已安装后再次访问 setup | 登录继续，不重新开放安装；删除 users 或放回旧 nonce 也不应重新认领 |
| 恢复的数据库没有管理员 | 初始化被保护性关闭；由操作者核对并恢复含有效管理员的备份，不把恢复实例当新空实例 |
| 配置报 NATIVE_ENV_FILE_UNTRUSTED | 检查实际服务用户、0600、链接/硬链接、文件位置；不放宽检查或打印配置 |
| 健康失败、DB 无法连接 | 停在当前状态检查本机错误码、路径/数据库/端口；保留数据、密钥、配置和备份 |
| 程序升级 | 使用 [实例增量更新](INSTANCE_INCREMENTAL_UPDATES.md)，先备份并确认兼容 schema；禁止以重装代替升级 |

后台严格增量更新是独立的维护流程：需要主机操作者部署外置最小权限执行器、绑定拥有者及受信签名源。Web 应用不挂 Docker socket，也不执行任意 URL、路径或 shell。它不是安装后自动联网追最新版，需要配置可信的签名分发源。受管应用和外部更新执行器应分别管理，更新窗口明确停止/启动对应服务，避免进程管理器与执行器同时争抢启动权限。
