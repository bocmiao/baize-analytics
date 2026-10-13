# 2026-10-13 安全性能优化与复验

本轮从 `454ce2ddb34ec3f97ab6e599e7c283272fc259b1` 冻结基线，复用请求内已读取的数值事实、批次内 UA/日期格式器及 Lite 事务内 prepared statements，并减少界面重复请求和图表重建。没有改变事件身份、幂等键、事实权限、采集与事实读取的锁边界、SQLite FULL 同步或提交后 ACK。Lite writer 128/8MiB、readers 2/64/8MiB 保持原值。

全量回归另发现并修正历史分区并发删除的存在性复查顺序：保留 exclusive advisory gate 先于父表 AccessExclusive 锁，取得父表锁后再检查候选子表存在、非空保护和 detach/drop。这个安全修复晚于下面 24 次性能测量，性能表不是这个最后 DDL 变体的重新测量。被测核心优化文件哈希仍与最终源码匹配；分区旧/新源码哈希单独保留。

## 实际共享资源与同条件对照

标准版的 Node、PostgreSQL 17.11、Redis 7.4.11 和发送器位于同一个实际 cgroup：`cpu.max=100000 100000`、`memory.max=1799999488`、swap 0。Lite 的 Node/writer/发送器也处于该限制。不是将不同容器限额相加，也不是独占物理 1 核 2GB 主机证明。运行时 Node 24.21.0；PG fsync、synchronous_commit、full_page_writes 开启。主要 PG 测试使用 Docker 数据卷的 overlayfs；最早 tmpfs 诊断不混入下表。

每个 profile/负载有三个交替配对 AB/BA/AB，共 24 次主测试，每次 1500 个 PV、150 个访客、150 个会话，加 100 个原事件重投。所有主测试实际接受 1600（含重复）、重复 100、拒绝 0，最终 PV/UV/sessions=1500/150/150，coverage=1。

固定负载：30 请求，每批 50 事件，计划每 100ms 发一个请求，报告记录实际发送时刻。同组发送器会受 CPU 限流影响，不据此声称独立持续 500 events/s 吞吐。新三波突发：每波 10 请求×50，计划 0/1100/2200ms 发波；生产 bot 防护保持开启。它与旧单波突发是不同定义。

| profile / 负载 | 基线 ACK p95 中位数 ms | 优化后 ms | 降幅 |
| --- | ---: | ---: | ---: |
| 标准 / 固定 | 4391.081 | 3389.210 | 22.8% |
| 标准 / 新三波突发 | 4626.524 | 4084.888 | 11.7% |
| Lite / 固定 | 485.241 | 352.041 | 27.4% |
| Lite / 新三波突发 | 1526.935 | 1059.105 | 30.6% |

这是每次 p95 的三次中位数，不是合并样本 p95。原始各轮值在 [MEASUREMENTS.json](validation/performance-20261013/MEASUREMENTS.json)。Lite 第一轮基线固定 p95=2317.400ms，有明显波动；全部分布保留。标准版仍是秒级，500ms 目标未通过；不宣称所有延迟目标通过。

采样 RSS 与 cgroup memory.current 是采样值；memory.peak 是组建立以来累计峰值，不能当成各轮独立峰值改善。ACK 后 freshnessWait 是等待事实可查询时间，不是完整端到端新鲜度。页面路径查询仍有逐事件 SQL，现有 `BAIZE_SESSION_PAGE_PATH_BATCH` 未默认启用，本轮没有增量事实算法或该开关的收益结论。

## 原单波突发与历史报告

原 30 请求单波诊断保留，不纳入上述同接受量对照。早期保留数据库有 1350 raw/receipts，150 申报事件受到过滤；当时完整客户端 HTTP 接收日志缺失。后来补齐 HTTP 状态观测的原单波：基线 29 个 202 / 1 个 204，接受 1450 唯一事件；优化后 28 个 202 / 2 个 204，接受 1400。两者实际接受工作量不同，不能拿 ACK 比较声称容量提速，也不能把 204 当已持久化的 1500 事件。

[RESOURCE_VALIDATION.md](RESOURCE_VALIDATION.md) 的历史条件与混合结论保留：固定 ACK p95 约 604→500ms，峰值约 1568→2092ms，不是全面提速。本轮新条件和新突发定义不能替代它。旧 5000 事件测试未重跑；tracker 4998B gzip 是另外的体积指标。

## 精确性、恢复与浏览器机制

标准真实 PG 数值查询在 partial/filtered/filtered-partial 中重复 numeric cursor 从 2→1，SQL calls 分别 58→51、48→41、48→41；aligned 不变。仅同一请求、同一事实快照内复用，没有跨请求结果缓存。150 组多样事件维度等价及日期 DST/多时区/无效输入回归通过。日期格式器缓存为有界 32 项，不缓存访客或查询结果。

两版分别以真实已确认的 1500 事件启动独立新进程，整容器 SIGKILL（exit 137、OOM=false）后再启动，登录成功、首次安装保持关闭、重投 100 全为重复，PV/UV/sessions 与 coverage 不变。标准 migration 最高 061（共 62 个记录），Lite user_version=2。证据在 `standard-postcrash.json` / `lite-postcrash.json`。这是进程/容器崩溃，未验证物理断电或磁盘故障，也不是新完整 Dockerfile 镜像的启动验收。

真实 Chromium 的固定 HTTP/render fixture 验证：六次面板切换图表实例 7→1，同帧 50 resize 调用 50→1；旧系列、空数据、注释移除、回调解绑、reduced motion 和卸载清理通过。生产构建固定 HTTP fixture 两版各五个前期比较请求场景，previous 请求 initial 2→1、pending→complete 3→2、快速日期 6→3、刷新 5→2、错误重试 3→2；主请求数不变，过期请求实际取消，最后显示最新日期数据。以上是浏览器机制检查，不是数据库查询延迟或实际部署截图证明。

另行启动实际编译标准服务器与真实 PG，空合成站点的下载页首次进入、手动刷新分别只有 1 个 content 请求，无 API mock、无 pageerror。这只是请求计数，不是非空下载数据或延迟证明。实际 Lite 不开放 content/下载报表；对这个不支持入口的探索脚本等待超时保留，不把它改成实际 Lite content 验收通过。

## 最终回归与交付状态

恢复后的全量 typecheck、lint、build 均 exit 0。标准浏览器 48/48、Lite 5/5 通过，均无跳过；标准 `E2E_STRICT_FACTS=1`，真实 CH body 丢失后页面清除旧成功数据的用例实际执行。全局应用使用独立编译入口；部分业务用例创建生产 TS 服务器、加载真实 dist/web，外部 Google/模型传输模拟在用例中明确标注。最终源码完整 Vitest 批次：311 个文件、1160/1160 用例通过，0 失败、0 跳过；[最终状态](validation/performance-20261013/FINAL_TEST_STATUS.json) 与原始 JSON/log 均保留。基线初次有环境配置错误，补齐 DATABASE_URL、PG17 原生工具、固定构建资源和只读 Git 历史后，原失败文件复查 44 通过、1 条条件跳过；按文件、完整名称及同名序号合并为 1154 通过、1 跳过，不重复累计。最终运行已设置 TEST_POSTGRES_CONTAINER，实际旧 dump 恢复回归已经通过。

第一完整候选批次 1160 条：1159 通过、1 失败、0 跳过；失败为并发分区删除在检查后报 `relation events_2020_03 does not exist`。该文件独立复查 4/4 通过，但不能据此将原批次改成全绿。父表锁后复查修复后，分区/副本协调、快照及数值查询专项 12 条通过，重新 typecheck/lint/build 通过，随后最终完整回归 1160/1160 通过，0 失败、0 跳过。最终源码的标准浏览器再次 48/48 通过，Lite 全新目录隔离复验 5/5 通过；这些重复项不累计成新增用例。

并行浏览器复验曾发现原测试配置仅按 cwd 保存 owner cookie，标准/Lite 会覆盖登录态；该次 Lite 失败日志保留。测试登录态现按 cwd/profile/baseURL 隔离，未改变应用认证、权限或会话策略；三组 profile/服务 URL 的实际配置路径不重叠。标准进行中的运行仍使用启动时已读取的旧测试文件名，Lite 隔离后它保持稳定且全部通过。

最终测试初次额外设置无认证的应用级 CLICKHOUSE_URL，导致四条 fixture 初始化 CANONICAL_CH_UNAVAILABLE；该批中止并保留日志。移除多余应用变量，保留 CLICKHOUSE_TEST_URL 后完整重跑，四条物理删除回归全部通过。未关闭严格模式或放宽断言。

历史 `7509481` 的 12 件交付文件逐件 bytes/SHA256 复核通过；四个原生包内原 README 截图匹配重新采集前的版本，没有嵌套历史白泽包（依赖自身 thread-stream 的两个测试 ZIP 保留）。旧四原生包、两版完整镜像及离线 save 保持原身份，不能改 revision 当本轮优化包。新完整 Dockerfile 构建前空间检查剩余 3118862336B，vfs 的五层 npm/build payload 复制预算约 1883449810B，已会越过保留的 2GiB 下限，且预算不含额外基底开销；两版新完整构建、同镜像四原生包和离线 save 未产出。没有执行 prune 或删除旧镜像/卷。详见 BUILD_SPACE_GATE.json。打包器要求冻结源码与镜像 label、内容 ID、compiled entrypoint 相符，不能用旧镜像拼成新版本。

本地本轮生产编译实际为 dist/server 533、dist/web 55、public 14，共 602 文件；应用及维护 TS 源码与实际编译文件哈希见 COMPILED_SOURCE_INVENTORY.json。旧 598 文件身份仅属于旧产物，本轮没有新镜像/原生包可作同源比对。

普通用户 README 与部署说明保留，本轮重新采集了 docs/images 桌面/手机真实 PNG：实际 API/PG 合成 60 天事实、查询 30 天、PV 511 / UV 30，前期 PV 120；页面断言、无手机横向溢出及截图视觉检查通过。图片证据明确记录 synthetic=true、mockedStats=false；截图业务服务器为生产 TS，前端为本轮实际 dist/web。历史测试截图先保留新文件再恢复旧 Git blob，不覆盖旧证据。只提交安全的测量 JSON；实际数据、密钥目录、数据库及详细搬迁账本不进入源码。Library 失败不循环重试；私有仓库文档/源码链接是可用的交付入口，本地大包路径不是可下载链接。Windows、macOS、ARM、Alpine、真实宝塔、生产服务器未验证。
