# 在 1Panel 安装白泽（兼容宝塔）

白泽已具备运行包和网页初始化，不需要重做安装系统。本次把面板入口、持久目录和守护配置补齐：先让面板启动后台服务，再在你自己的 HTTPS 页面检查环境、创建管理员、添加站点，最后取得追踪代码。白泽不是 PHP 程序，也不能上传到普通静态空间后直接使用；保留 Node 后端、React 界面和现有分析能力。

## 1. 选一个包

第一次使用、单实例且不需要高级行为分析，选择 **Lite NodeReady**；需要标准版能力，选择 **标准 NodeReady** 并准备 PostgreSQL。两个包均已包含编译结果、依赖、tracker 和离线主要文档，禁止在解压目录执行 npm install、npm ci 或 npm run build。

| 包 | 字节 | 已保存的 Library ID |
| --- | ---: | --- |
| `baize-lite-node-ready-linux-x64-38c9c61.tar.gz` | 30514231 | `libfile_20ea06045abc8191b2554aef3dbd4d1e` |
| `baize-standard-node-ready-linux-x64-38c9c61.tar.gz` | 35412021 | `libfile_843d7a91e7088191b087077dcae0593c` |

在自己的 Library 按上述完整文件名下载，SHA256 使用 [最终校验表](test-evidence/incremental-update-closure-20261014/SHA256SUMS)。先下载校验表，在交付目录校验所选包（例如 Lite）：

```bash
set -euo pipefail
grep '  baize-lite-node-ready-linux-x64-38c9c61.tar.gz$' SHA256SUMS > chosen.SHA256SUMS
test -s chosen.SHA256SUMS
sha256sum -c chosen.SHA256SUMS
```

其他包使用自己的精确文件名。不要相信来源不明的同名包。软件 revision 固定为 `38c9c611cb535816edc8748c6144284434ba3e67`，这份面板说明和配置是附加交付，不需要修改密封运行包。下载 [守护配置](../deploy/baize.supervisor.conf.example) 放在包外，不向包内添加文件，以免完整性检查拒绝启动。

部署机须为 Linux x64/glibc，具备兼容的 Node 24、Bash、flock；Lite 还会实际检查 Node SQLite 能力。NodeReady 不包含 Node。不要直接采用面板默认的较旧 Node。已有 bundled-node 包可自动使用包里的 runtime/bin/node，但这两个 bundled 包及 Docker 包尚未成功完成 Library 分发，不能把它们当作已有下载链接。

标准版使用 PostgreSQL，不能填 MySQL 连接串；当前原生自动更新仅支持 PG-only。Redis 可选，ClickHouse 模式有单独维护约束。两版不能通过换包互转数据库。PHP 适合另一些项目的安装目标，但对白泽做 PHP 重写会丢失现有运行与维护体系，不是简化安装的必要条件。

## 2. 在面板准备目录和配置

以下为路径约定，可改为你的面板实际路径，但三类位置必须分开：

| 用途 | 例子 | 要求 |
| --- | --- | --- |
| 发布目录 | `/opt/baize/releases/baize-lite-node-ready-linux-x64-38c9c61` | 解压后的包根目录，保留包内权限，不存数据和配置 |
| 数据与密钥 | `/var/lib/baize/data`、`/var/lib/baize/keys` | 独立持久目录，实际应用用户拥有，0700；不同实例不得共用 |
| 私有配置 | `/etc/baize/runtime.env` | 实际应用用户拥有，0600，普通文件，不能是链接或硬链接，不能放入发布/数据/密钥/网站目录 |
| 日志目录 | `/var/log/baize` | 面板守护器能够写入；不映射成网站目录 |

通过面板文件管理或自己的受信终端，以实际服务用户准备目录。不要自动递归改已有目录所有者/权限，不删除或清空任何旧目录。存在旧配置和数据库时，转到后面的升级说明，不按空实例重装。

解压到发布父目录（目标必须是新的独立目录，保留内部权限）：

```bash
test ! -e /opt/baize/releases/baize-lite-node-ready-linux-x64-38c9c61
tar --same-permissions -xzf baize-lite-node-ready-linux-x64-38c9c61.tar.gz -C /opt/baize/releases
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
| 运行目录 | `/opt/baize/releases/baize-lite-node-ready-linux-x64-38c9c61` |
| 启动命令 | `/bin/bash /opt/baize/releases/baize-lite-node-ready-linux-x64-38c9c61/scripts/release-start.sh --env-file /etc/baize/runtime.env` |
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

如果进程守护本身在容器里，先确认它能看到同一发布/私有目录、Node 及数据库网络；不能把宿主机 127.0.0.1 或路径直接假定为容器内同一位置。本次验证为宿主机 Supervisor，不宣称已测试每种面板容器布局。

## 4. 配置 HTTPS 后完成网页三步

在 1Panel 创建反向代理网站，转发到实际可达的本地服务地址，绑定你的域名并配置有效 HTTPS 证书。面板代理若在容器内，用其实际能够访问的受限地址，保持应用端口不向公网直接开放。核对 PUBLIC_URL；只信任你明确管理的反向代理，不填写任意受信代理地址。

1. 用自己的浏览器打开 `https://你的域名/setup`。应用启动后，在私有 KEYS_DIR 找到 install-nonce.json，仅通过自己的受信文件管理界面读取 nonce 字段，把它填入自己 HTTPS 页面里的“安装凭证”。不要把它放入 URL、聊天、日志、发布包或公开下载目录。
2. 点“检查运行环境”。应显示 Node、系统/架构、存储可用、schema、数据及密钥目录可用且私密。检查只读取状态，不创建管理员，不消耗凭证。旧包的短提示没有完整描述诊断：检查环境也会把凭证通过 POST 发往本站受保护的诊断接口。网页显示 HTTPS 配置不等于实际证书及公网可达性验证；无运行进程时，网页也无法替你安装 Node。
3. 填姓名、邮箱和至少 12 位的独立密码，创建管理员；随后添加首站点并复制追踪代码。进入看板后，按追踪说明验证采集。整个过程不需要填任何云平台或项目开发会话凭据。

初始化凭证在管理员、会话和终态事务成功后被移除，不能重复安装或创建第二个首任管理员。安装后走普通登录；站点管理员不等于可升级整个实例的拥有者。

## 5. 宝塔使用相同运行包

优先在已有进程守护中使用与上面相同的启动命令、私有配置及工作目录。若使用宝塔 Node 项目托管，选择兼容 Node 24，关闭自动安装依赖/自动构建，工作目录为包根目录，入口使用包内 npm start 或 dist/server/src/release/panel-start.js，并在项目环境中私下配置持久目录及数据库。启动器的 --env-file 方式更便于明确私有文件位置；不要把 .env 放入密封发布目录。

保持单进程，不为 Lite 配置 cluster 多实例。不上传到 PHP 网站目录，不选择 tracker 或 dist/web 作为服务入口。面板负责保活和反向代理，应用网页只负责应用初始化。宝塔具体界面尚未在本云环境安装；命令和应用后端已实际验证。

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

后台严格增量更新是独立的维护流程：需要主机操作者部署外置最小权限执行器、绑定拥有者及受信签名源。Web 应用不挂 Docker socket，也不执行任意 URL、路径或 shell。它不是安装后自动联网追最新版；当前没有正式 Release 签名源，不宣称已经接通。受管应用和外部更新执行器应分别管理，更新窗口明确停止/启动对应服务，避免进程管理器与执行器同时争抢启动权限。

## 当前交付与验收边界

本次新增文档和守护配置，沿用已验收的 38c9c61 程序包，没有重写后端或重做全站。标准与 Lite 实际浏览器 + Supervisor 4.3.0 安装、重复安装拒绝、安装前重启、强杀自动恢复、管理员/站点/配置保留均通过，安装相关回归 28/28。数据/配置留在包外；未部署生产、修改现有账户或执行平台任务。

可下载的 Library 包仍只有上述两个 NodeReady。四大包的 prepared 字节上传此前报 Forbidden，未解决；私库 Release 未发布。环境恢复使旧 /tmp Docker 两归档丢失，本轮已从原精确镜像恢复到持久工作区，以 recovered 文件名单独记录新字节/SHA并实际 load 核对镜像 ID；不冒称其压缩字节与旧包一致，也没有上传成功链接。详见 [恢复包清单](test-evidence/panel-install-20261014/RECOVERED_OFFLINE_INDEX.json)。

本轮未安装 1Panel/宝塔完整面板 UI，未在真实域名验证证书和反向代理；不把这些待用户部署项计为通过。[实际测试证据](test-evidence/panel-install-20261014/PANEL_INSTALL_E2E.json)、[回归结果](test-evidence/panel-install-20261014/INSTALL_REGRESSION.json)和[截图](screenshots/panel-install-20261014/lite-setup-diagnostics-320.png)可核对。

配置依据：[1Panel 官方工具箱手册](https://docs.fit2cloud.com/1panel/user_manual/toolbox/quick-settings/)列出进程守护入口；[Supervisor 配置手册](https://supervisord.org/configuration.html)说明目录、命令、重启和进程组停止；[宝塔官方 Node/PM2 文档](https://docs.bt.cn/practical-tutorials/nodejs-pm2-deployment/)用于界面参照。面板软件版本可能改变菜单，以上配置字段与实际命令为交付依据。
