# 白泽后台更新交付与隔离验收（2026-10-18）

本轮基于 `main 80bda57c8518949934273e1a7a8ef8d48125e2ae`，补齐 PHP 原先返回 409 的后台更新。现有 Node Full PG-only / Lite 能力复用共享签名、文件增量和事务状态机。实际运行代码冻结于 `155bed07bc3da2a96dfd89a85736b38b34d4ac13`；最后的证据提交只整理测试、文档及已实际验证的 Docker 停止信号/挂载示例。测试执行器 SHA256 为 `2e2a6a67a22ee93be04641cf7096fcf656deb26bf7875bc0baa900f8f4a31b15`，源码与证据校验清单见下方目录。

代码位于 `codex/php-background-updates` 独立分支，未覆盖 main 或他人提交。仅操作本仓库。没有生产部署、正式发行上传、CI/CNB 触发、生产签名密钥生成、真实账号/权限或持久访问凭据变更。所有数据库、签名密钥、会话和本地发行源均是隔离测试设施。

## 已交付行为

- PHP 后台真实检查当前运行身份及目标版本、发行说明、变化清单、校验后确认更新和回退；沿用现有 JadeUI 布局。精确匹配已安装签名版本时显示已是当前版本，载荷为零。
- Ed25519 签名、固定可信公钥、基线身份、文件模式/长度/SHA256、完整目录与同结构限制；拒绝私有目录、符号链接、错误包或基线。发布完整初始安装包和增量包，支持 HTTPS 源与主机侧验签离线导入，不接受网页更改公钥或任意导入路径。
- 实例原认领拥有者会话、CSRF/同源检查、非拥有者/API Token 拒绝；进程身份锁、持久幂等操作、请求响应确认之后才执行。Unix socket 独立执行器与独立看门进程，不依赖浏览器保持打开。
- 停写、真实数据库/文件/配置/密钥恢复点、候选原子切换、数据库与精确版本/清单/启动身份健康检查；失败恢复旧代码，可恢复下载/健康阶段强杀中断。代码回退保留更新后业务写入。
- 原生非 root PHP-FPM/Nginx/worker 托管，以及固定监督镜像、独立持久版本/状态/数据/密钥目录的 Docker 方案。Docker 无 socket、只读根文件系统、UID 1000；显式 SIGTERM，正常停止窗口 60 秒。Node Full PG-only 与 Lite 的该 Docker 方案也已实际构建运行。

操作指南：[PHP 后台更新](../PHP_BACKGROUND_UPDATES.md)、[实例增量更新](../INSTANCE_INCREMENTAL_UPDATES.md)、[PHP 安装](../PHP_INSTALLATION.md)。

## 最终代码验收

全部记录位于 [原始证据目录](../test-evidence/php-background-updates-20261018/)。成功结果与早期失败尝试分别保存，失败日志不冒充通过。

| 检查 | 实际结果与证据 |
| --- | --- |
| 全量可用 Node 单元/集成回归 | **919 通过、0 失败、302 跳过**，共 1221 项。使用真实 PG17、SQLite、Redis；跳过项保留原仓库外部服务/专项运行条件，未将缺少 ClickHouse 等条件的检查算作通过。[最终 JSON](../test-evidence/php-background-updates-20261018/final-regression-latest.json) |
| PHP 业务回归 | MySQL 8.4.11 与 MariaDB 11.4.13 各 11 套，**22 套退出码均为 0**，涵盖 kernel、collect、analytics、governance、providers、manual-search、MCP、annotations、keyring、platform、SSO。[结果及日志](../test-evidence/php-background-updates-20261018/regression/) |
| 构建与静态检查 | `npm run build`、typecheck、lint 通过；PHP 全部源码语法检查通过。专项 4 文件 47 测试通过，另有全部回归。[检查摘要](../test-evidence/php-background-updates-20261018/final-summary.json) |
| PHP 原生真实更新 | 保留原 80bda57 的业务数据/加密秘密/密钥/文件，经签名初始安装及历次新代码验收，最终重新执行 8f0bda3 → 155bed0。坏包、断网、并发 409/幂等 202、执行器单独 SIGKILL、健康失败、回退保留新写入全部通过。[最终记录](../test-evidence/php-background-updates-20261018/native.json) |
| PHP Docker | 浏览器确认后关闭仍完成；真实备份；SIGKILL/强制重建后保持目标身份；回退保留新写入；配置/主密钥/文件保留；默认 SIGTERM 正常退出码 0、停止重启约 1 秒。[最终记录](../test-evidence/php-background-updates-20261018/docker.json) |
| Full PG-only / Lite 原生 | 最终共享执行器真实应用验收均通过：签名增量、坏包、断网、并发、备份、下载和健康阶段进程组 SIGKILL、代码恢复与新写入保留。[最终记录](../test-evidence/php-background-updates-20261018/node-native-latest/NATIVE_INCREMENTAL_E2E.json) |
| Full PG-only / Lite Docker 版本目录 | 两者均实际运行最终监督镜像：签名离线增量、真实备份、SIGKILL/重建后身份和数据、回退保留新写入、当前版本零载荷、桌面与移动端均通过。[最终记录](../test-evidence/php-background-updates-20261018/node-version-volume.json) |
| 恢复与受控 DDL | 实际从自动恢复点恢复至新隔离数据库，原密钥可解密、文件保留、旧会话撤销；真实 DDL 执行前要求计划 SHA、验证恢复点及停写确认。刻意部分提交后失败：意图保持 applying、运行/预检拒绝、再次执行拒绝，未伪称已自动回滚。[记录](../test-evidence/php-background-updates-20261018/migration-and-restore.json) |
| 真实浏览器 | Chromium 实际页面：1440 桌面，390/320 移动端，预览、确认、完成、可恢复失败、已是当前版本；PHP/Full/Lite 无页面异常或横向溢出。19 张截图含 6 张真实 320×900 视口图。[截图](../test-evidence/php-background-updates-20261018/screenshots/)、[视口测量](../test-evidence/php-background-updates-20261018/viewport-screenshots.json) |

PHP Docker 最终固定镜像 ID：`sha256:2edf282651df8df6028df848b291c0c22d4b4e3174bf3bd164bf58ca93695438`；Node 版本目录最终固定镜像 ID：`sha256:ef1c5920744c718fe43c186431f7d7ec89290468eaa9d547b9146fef425098cf`。这些是本机隔离验收镜像，不是已分发的正式镜像。

Node 原生/Docker 验收 A/B 标识是隔离内容标识，修改 26 字节测试资产并包含真实签名清单（约 2.2 MB），不将其称为两个正式 Git 发行版、生产下载量或吞吐证明。PHP 最终验收修改真实 PHP 业务/维护源码。早期空间不足、初次运行配置、请求尚未响应即停机、容器 PID 复用、默认停止信号等失败记录保留；修复后均针对最终运行代码重新验收。没有降低磁盘安全阈值；清理仅针对本任务明确创建的缓存/工具/旧测试镜像和已归档的测试副本。

## 备份与迁移的准确范围

PHP 自动更新只接受相同 `migrations/*.sql` 与 `src/Database.php` 指纹。自动备份仅覆盖已核实的 `001_documents.sql` 三张 InnoDB 表及其文档数据、外部数据文件、配置与全部密钥；检查真实列类型/索引/JSON 约束，额外表、视图、触发器、事件或例程均拒绝。未来物理存储必须先实现和验证相应全库备份恢复。此范围已实测拒绝额外表。

数据库结构变化走主机维护流程：停止全部写入者，验证恢复点并在隔离库恢复演练，审查计划 SHA 后手工执行。MySQL DDL 可部分提交，失败意图不清除、不自动再次执行、不承诺 down migration。应保留失败实例，在新数据库及私有目录恢复旧结构恢复点，合并最新独立删除日志，复核健康/业务后由操作者明确切换。不能用旧数据覆盖当前实例冒充普通代码回退。

Full 连接外部 ClickHouse 或历史 sidecar 时，现有自动预检拒绝更新，不能把 PG/SQLite 恢复点称为这些外部数据的完整备份。需运维先提供并验证一致性维护窗口、外部快照和恢复方案；本轮未声明该模式自动回滚可用。

## 正式发行与主机接入仍需提供

2026-10-18 通过正常 GitHub 连接器只读核查，仓库 Releases 仍为空，见 [只读记录](../test-evidence/php-background-updates-20261018/release-source-read.json)。没有生产源可供现有线上实例立即点击更新。

1. 发布者提供已有离线 Ed25519 签名私钥的受控签名操作、公钥/指纹和 key-id；本轮不生成生产凭据。
2. 用本次交付工具从冻结的正式提交构建、签名并审查初始安装包/增量包；提供不可变 HTTPS 清单/内容地址资源，或交付签名离线目录。测试公钥/本地源不得复用。
3. 主机维护者核对原拥有者 UUID、基础清单 SHA、公钥，保留原数据库配置、数据目录及全部密钥；安排停止旧服务/外部写入者及恢复演练。选择原生服务或固定镜像摘要，准备正确 UID/私有权限/持久目录与 HTTPS 代理，显式完成首次接入。
4. 实际主机容量、备份保留策略、外部存储与适用数据库客户端必须单独核对。首次接入需要维护窗口；旧 PHP 409 接口不能在未安装独立执行器时自行改造主机。

上述为剩余部署输入，代码、离线发行/安装工具和隔离验收已完成；隔离源没有被称为生产更新源。
