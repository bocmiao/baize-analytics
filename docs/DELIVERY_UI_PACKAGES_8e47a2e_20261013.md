# 概览优化版完整运行包交付（8e47a2e）

软件源码、README 图片、编译产物与本轮包冻结为 `8e47a2e9a3cc3c700fac2d06089fd22d10cf38d1`。随后收尾提交仅新增文档/小型验证摘要，不重新标注包的 revision。旧 129d972/7509481 的包、镜像、报告和 SHA 原样保留，未操作旧环境。

## 完整文件与私有下载

六件完整归档已通过官方 Library 创建工具保存成功，返回 bytes 与本地一致，版本 xattrs 已写回本地文件；无需分片。文件的准确 Library/file ID 及需要用户登录的下载入口见 [DELIVERY_MANIFEST.json](validation/ui-packages-8e47a2e-20261013/DELIVERY_MANIFEST.json)。它们不是公开分享 URL；未创建 GitHub Release，也未公开私有资料。此前 Python Library 上传路径失败不再循环尝试。

| 文件 | bytes | MiB（2²⁰ bytes） | SHA256 |
| --- | ---: | ---: | --- |
| baize-lite-bundled-node-linux-x64-8e47a2e.tar.gz | 74821436 | 71.355282 | `d930174ff1652c89f4597f593f6501abb364168e444f7425b7de1aef8ab9c037` |
| baize-lite-docker-offline-8e47a2e.tar.gz | 125422574 | 119.612288 | `616833ecf27298b037576281428cc250d05d73e2f55103522b5315b123bad6aa` |
| baize-lite-node-ready-linux-x64-8e47a2e.tar.gz | 30131071 | 28.735229 | `4643c8af884cfa353ebddfadb8cf8b83375963318e728be9823f25a2cde9e5ad` |
| baize-standard-bundled-node-linux-x64-8e47a2e.tar.gz | 84421386 | 80.510508 | `604d50544d3db28c590071c7fd51886ead8454f66d36eec0eb5b57f153530aad` |
| baize-standard-docker-offline-8e47a2e.tar.gz | 297024582 | 283.264715 | `0c5a324c745442f8f19181fdf173407304ef21bf2913aad1b3f4582833a6952c` |
| baize-standard-node-ready-linux-x64-8e47a2e.tar.gz | 39728040 | 37.887611 | `529aa9a1e326d75e8d4a24723cd2eb18b39d5304dc6d225c3b600b74d4758146` |

校验文件见 [SHA256SUMS](validation/ui-packages-8e47a2e-20261013/SHA256SUMS)。六归档最终重新计算均匹配；旧 129d972 六包同样全部匹配。大二进制仅保留在新环境与私有 Library，不进入 Git 源码历史。

## 同源与实际安装验证

镜像 `baize-ui:standard-8e47a2e`：`sha256:94f0aad6885fe4550c30d17d41e63015cead9f62eb1b694d34bc9f8e1b013b79`；镜像 `baize-ui:lite-8e47a2e`：`sha256:f1f865d6f8c226175c40cfb2a37182ff1226ece0ba378b095f3534e3e1bf604e`。两者 linux/amd64，revision/source label、入口及实际 Node 24.21.0 核对；没有 registry RepoDigest，不能把本地 image ID 称为已推送 registry digest。

四原生包各 602 个 dist/public 文件与独立宿主编译一致，零差异；README 桌面/移动图与冻结 Git blob 一致；标准 169 / Lite 166 项已安装依赖版本与锁文件核对。两镜像 compiled/migration 内容同源，标准镜像保留的 417 个 src/scripts/sdk/packages/plugins 维护源码文件逐件匹配。证据见 [四包内容](validation/ui-packages-8e47a2e-20261013/four-package-source-witness.json)、[编译迁移](validation/ui-packages-8e47a2e-20261013/COMPILED_AND_MIGRATION_WITNESS.json)、[维护源码](validation/ui-packages-8e47a2e-20261013/MAINTENANCE_SOURCE_WITNESS.json)。

四原生包均实际执行 shell 启动、health、一次性安装凭证创建 owner/会话、前端 HTML、shell backup 和独立空目标 restore；目标 owner=1、公开安装入口 restored_blocked，未切流量。Node-ready 实测 Node 24.19.0 / Lite SQLite 3.53.3，bundled-node 实测 Node 24.21.0 / SQLite 3.53.4；不能外推所有 Node24。标准维护验证为 PG-only，有真实 PostgreSQL17 客户端，不代表严格 CH 权威备份已由这些原生维护入口支持。见 [原生结果](validation/ui-packages-8e47a2e-20261013/native-package-smoke-results.json)。

两份离线归档实际 docker load 成功，再在新的独立 Compose 项目以 --no-build --pull never 启动：标准 health 的 PG/Redis ready，Lite SQLite ready；两版均实际 nonce claim 和 owner cookie 登录。测试后停止、保留卷，不移除数据/密钥。[结果](validation/ui-packages-8e47a2e-20261013/offline-compose-smoke-results.json)与 [save 内容身份](validation/ui-packages-8e47a2e-20261013/OFFLINE_ARCHIVE_IDENTITY.json)。标准 save 含本轮应用+PG17-bookworm+Redis7-bookworm，Lite save 仅本轮应用镜像；不含 ClickHouse、配置、数据或密钥。

## 回归批次与边界

本轮冻结前 typecheck、lint、生产 build 通过；11 项定向单元、标准/Lite 两项新概览浏览器用例、独立既有38入口浏览器用例通过，详见 [概览报告](OVERVIEW_REDESIGN_20261013.md)。打包器9项单元通过。历史 129d972 的1160/标准48/Lite5仍仅属原批次，不合算为本轮。

最初测试环境 Redis 变量名、PG 默认连接配置错误的中断/失败记录保留；纠正后311文件、1144已注册测试859通过、0断言失败、285跳过，另4文件 Invalid URL 导致收集失败，整体 success=false。285项均来自94文件既有条件门槛在本轮缺少 CLICKHOUSE_TEST_URL；PG/Redis/维护容器配置已存在、CANONICAL_ACTIVATION_READY=true，无独立无条件跳过或 false 功能开关。4个收集失败文件为 canonical-backup、canonical-replay-retention-proof、restore-replica、stats-replica-budget；Vitest skipIf 仍执行 describe 回调，回调构造 undefined URL/store，尚未注册这些文件中的用例。见 [逐项审计](validation/ui-packages-8e47a2e-20261013/SKIPPED_CASE_AUDIT.json)。不靠假 URL 消除错误。

补齐后单独完整重跑同一冻结代码，2026-10-13 13:35:22–13:49:34 UTC 正常结束，exit0：**311文件、1160通过、0断言失败、0跳过、0todo、0收集错误，success=true**。500个报告内suite均通过，suite计数不是文件数。此前285跳过与4收集错误所在用例均已实际执行，新增注册16项；旧中断/失败报告保留，不混算。[精确摘要](validation/ui-packages-8e47a2e-20261013/FULL_REGRESSION_FINAL_SUMMARY.json)、[完整报告](validation/ui-packages-8e47a2e-20261013/full-regression-with-clickhouse.json)、[执行与空间](validation/ui-packages-8e47a2e-20261013/FULL_WITH_CLICKHOUSE_EXECUTION.json)。

本轮没有现成CH镜像。只读取仓库既定`clickhouse/clickhouse-server:25.8-alpine@sha256:87e0a5b72f5465b18eacca7c76850e7ff551c9795c50e451f5646299e5e24146`的linux/amd64 manifest，下载并SHA256验证对应层，在独立/tmp提取官方二进制（实际SQL版本25.8.33.6）启动仅监听127.0.0.1的独立测试服务；不是Docker CH容器验证。已有本轮隔离PG/Redis提供其余依赖，配置CLICKHOUSE_TEST_URL与已知本地测试账号，源码及测试代码未改。服务结束后正常停止，data/config/二进制/层文件均保留，无Docker pull/prune/旧包删除。[来源校验](validation/ui-packages-8e47a2e-20261013/CLICKHOUSE_NATIVE_ACQUISITION.json)。

全量执行期间/workspace最低3,566,301,184bytes、/tmp最低6,878,191,616bytes；两处均保留固定2GiB及额外1GiB缓冲。观察隔离测试PG的WAL约864MiB后，仅执行普通CHECKPOINT：archive_mode=off、replication_slots=0、max_wal_size=1GB不变；没有手动删除WAL或更改durability、凭据、权限。这个批次是正确性回归，不是可与历史性能数据比较的压力测量。[维护摘要](validation/ui-packages-8e47a2e-20261013/TEST_RESOURCE_CHECKPOINT.json)。

## 空间保护与保留

新环境先实际确认 Docker vfs 与约29.83GiB可用，再构建；本轮构建上下文预检时可用11,451,342,848bytes（约10.665GiB），规划预算6GiB并非保证。最小构建上下文512文件/5,292,813bytes，来自冻结源码，不包含历史归档/验证目录；旧材料仍在原位置。固定保护下限2,147,483,648bytes不变，额外1GiB停止缓冲同样保留，阶段最低/退出/终止详情由 *.space.json 逐阶段保存。

Lite 离线安装曾两次命中额外缓冲而中止，未记成功。只将本轮四个已封存展开目录逐文件/模式/manifest验证后可恢复搬迁到独立 /tmp，六归档 SHA不变；展开副本保留，原路径可从同一归档还原。随后两个已创建且仅读取 UID/GID 的 AutoRemove 助手完成正常启动/退出，保留配置与 stdout 摘要，未执行 prune、删镜像、卷或旧证据。Lite 最终重跑 exit0，最低可用4,002,926,592bytes。[搬迁账本](validation/ui-packages-8e47a2e-20261013/RECOVERABLE_EXPANDED_RELOCATION.json)、[助手完成](validation/ui-packages-8e47a2e-20261013/HELPER_COMPLETION.json)。

安装使用 [本轮精确 tag/ID 的补充](INSTALL_UI_8e47a2e.md)。发布仅有 [材料草稿](RELEASE_MATERIALS_UI_8e47a2e.md)，无 tag/Release、PR、Actions/CNB、付费资源、生产部署或外部凭据权限变更。没有更改业务代码来打包，也没有改变安全、持久化或 Lite 能力口径。

未验证真实宝塔/跨机灾备、Windows/macOS/ARM/Alpine原生运行、物理断电/磁盘故障；没有重跑性能压力结论，不宣称标准500ms或5000能力达标。截图为合成数据，地域为受控原始维度，不是实际GeoIP查询。
