# 独立采集与查询性能证据方案（尚未运行负载）

原 `continuous-pipeline-benchmark.ts` 保持原字节与历史统计口径。新 `independent-pipeline-benchmark.ts` 是独立入口，采集采用固定计划（默认每秒一批、每批50事件），最大并发2、等待队列8；查询另以10秒频率运行，最多单个在途，查询完成不决定下批采集何时计划。队列满明确 unsent，不无限积压，也不补偿为突发超限。调度报告 planned/scheduled/sent/http202/acceptedEvents/rejectedEvents/failed/delayed/unsent；这些量分别是请求或事件，不能混用。低成本 PG watermark/backlog 探针独立于重查询，报告最后值与最大 backlog。排空达成和最终断言运行/通过分别记录，排空未达成不能以最终一次查询通过替代。

`benchmark-bootstrap.ts` 复用原脚本的真实安全步骤（复制到新文件，原脚本不重接）：独立 PG schema/CH database、生产 background worker、实际管理员初始化；严格模式通过公开 shadow/verify/activate，并迁移 headers/facts/cache，实际签名 headers/facts/remaining/cache/raw 五组包及私有 opaque proof，受控 strict 开启和 raw prune。禁止 manual worker、手工 authority/body_mode、伪造 readiness 或 proof。只有明确既有本地 CH 端点可用于 strict；cleanup 只删除本次随机 namespace。复制安全流程仍需下一次父代理串行实际执行验证，不把可编译视为真实 bootstrap 已通过。

入口必须 APP_ROOT 不可变完整快照、SOURCE_REPOSITORY、完整40位 SOURCE_SHA。对 Git `ls-tree --full-tree` 每个 tracked blob 比较 Git blob SHA1并生成总 SHA256，运行后再次核验。不接受 caller 自报短标签，不跳过 tracked 文件。拒绝符号链接/submodule 而非跟随未知外部源。结果仅含非敏感计数、source digest、随机 owned namespace。独立 fresh final HTTP stats 检查实际成功接受的 PV及coverage1，查询历史样本不充当最终结果。

阶段计量器 `phase-metrics.ts` 仅固定枚举、rows/batches/bytes、ok/failed、inclusive/exclusive时长与固定9桶直方图，状态上限固定；不接入任何生产核心文件，无 visitor/session/site、事件正文、凭证、SQL文本。并行调用时长不可加总冒称墙钟。A推荐的source_fence/manifest_read/ch_transport/body_auth/temp_insert/owner_validation/sql_aggregate/publication等已预留，实际 hooks 待父代理授权。

本轮仅纯单元测试：调度解耦/队列上界、drain与final断言分离、固定计量器。**未启动任何负载、数据库、浏览器、build、Docker**。模拟 transport 属单元证明，不是外部账号或生产性能结果。首次全仓类型检查因新文件移动后的相对导入错误失败，修为 ../../src 后类型检查通过；该初次失败不替换为通过。实际 benchmark 输出与前后对比须在后续批准的串行运行中补充。

建议实际入口（只有新 source 已提交/冻结后才能运行）：

```sh
APP_ROOT=/tmp/immutable-snapshot SOURCE_REPOSITORY=/workspace/baize-analytics SOURCE_SHA=<full40commit> BENCHMARK_STORAGE=strict-clickhouse BENCHMARK_BATCHES=100 TEST_DATABASE_URL=<local-test-url> CLICKHOUSE_TEST_URL=<existing-local-endpoint> npx tsx scripts/independent-pipeline-benchmark.ts
```

## 父代理复查后的实际可观测边界

新增严格有界 batch samples（最多400）记录计划相对时刻、实际发出时刻、延迟、请求时长与202/失败/未发原因；query和轻探针各最多200样本，达到上限明确 samplesTruncated。P95只对这些已保留样本计算，不能冒称全请求精确分位。探针含 oldest queued age、汇总generation/processed以及watermark。Node RSS分别记录 intake/drain/final窗口峰值，包含本进程 app+harness，不包含其他PG/CH/Redis服务。

实际 phase helper 只接 HTTP collector/stats 和直接 PG probe 的 inclusive墙钟测量；未测 CH运输、TEMP、认证、SQL归约等阶段明确 unobserved。未测rows/batches/bytes输出null和measuredCalls0，而非假0。HTTP stats消费有界JSON正常EOF并保存coverage/source/PV，不因仅status200或主动cancel算成功。CH CREATE/DROP复用生产 consumeClickHouseCommand 正常EOF规则。

最终新HTTP读取逐站验证实际接受PV/coverage；strict另对真实认证canonical流验证PV/UV（含bootstrap）、九张PG正文表0、CH authority/strict、outbox完整done、gen=processed/attempt0/水位覆盖最后接受事件；PG路径另SQL exactPV/UV/session验证。断言执行列表与实际计数分别保存；失败只返回false，不把未执行部分假记通过。cleanup实际查询CH namespace与PGschema均已消失；cleanup异常标 failed 并保留结果。bootstrap异常也保存安全失败记录和cleanup状态，不丢JSON，不打印凭证或任意错误正文。

源码已通过轻量单元 **4 PASS**、owned ESLint EXIT0、全仓类型检查 EXIT0（`/tmp/baize-independent-review-delivery-types.log`）。仍**未执行真实bootstrap或任何负载**；这些仅工程准备证据。

## 可选生产观察 sink（仍未执行负载）

bootstrap 现向实际 createApp 传入同步有界 `serverPhases.sink`，消费生产 `performance-observation.ts` 的事件；默认部署不配置 sink 的行为不改。仅8个固定stage×4个operation，最多32组聚合、固定9桶时长直方图、总样本256；每operation最多1024随机ALS correlation在内存中去重，超限scope数明确为lower bound，不输出correlation。scope数仅代表至少发出一次阶段事件的ALS调用，不是全部请求/worker tick。源快照中的字面measurePerformanceStage调用用于区分not_instrumented与instrumented_no_event；实际收到才标observed。

度量没有site/visitor/session/SQL/URL/body/凭证字段。每个事件仅保留固定operation/stage、duration/result与可选rows/batches/bytes；未测count为null。同步sink不创建异步Promise队列；坏事件计数并丢弃，不影响业务。阶段包含嵌套与并行的inclusive时间，不能累加为CPU或墙钟占比。server观察与private HTTP/PG探针计量分别输出。

纯单元新增3项：20000事件验证固定空间/上限、坏事件不污染汇总、真实ALS阶段回调与同步/异步observer异常不改变业务结果。连同原4项，**7 PASS**：`/tmp/baize-server-phase-metrics-unit.json`；ownedlint及全仓typecheck EXIT0，`/tmp/baize-server-phase-metrics-types.log`。尚未验证真实createApp PG/CH阶段数或实际性能；这属于后续父代理串行负载结果，未运行DB/browser/build。

最后轻量 hook 复核：递归扫描不可变 `src/server`，仅固定stage白名单的字面 `measurePerformanceStage` 调用计为已配置。新增纯函数测试直接读取 relational-stats/fact-numeric-query/fact-member-query 三个当前源码，均发现 aggregate_sql；只有json_serialize枚举不视为hook。组合 **8 PASS**（`/tmp/baize-server-phase-hooks-final-unit.json`），lint/typecheck EXIT0（`/tmp/baize-server-phase-hooks-final-types.log`）。这些SQL计时包括实际参数化读取/metadata SQL，不称CPU归约时间。没有启动DB或负载。

## 4ee 原始结果的采样窗口勘误与下一轮

父代理实际不可变 4ee strict1000 结果 `/tmp/baize-independent-4eead97-strict-1000.json` 已通过完整性、cleanup、sourceunchanged；20批均202，最大backlog650。但该版本仅采集期间查询（2个样本，约177ms的P95），约60秒drain没有继续查询。因此该分位不能代表later processed state，更不能作为性能改善结论；原结果与原脚本不改。

新调度器让独立单在途10秒查询定时器在intake和drain持续工作（probe await不会阻塞定时器），没有请求补偿队列；忙时明确querySkippedBusy。每个query sample记录发出时所属窗口，分别给sample count/P95、各窗口相对起止时刻。drain deadline后不再开始新的查询，越过deadline才完成的probe不算drainReached；已在途查询等待结束后才运行fresh final。final assertion总时长独立记录，bootstrap metadata另记录实际fresh final HTTP时长，不混入周期查询P95。

新增2个纯fake-monotonic-clock调度测试：drain中确实继续查询、单在途/无残留定时器，以及晚到drain probe不能把deadline算成通过。组合 **10 PASS**：`/tmp/baize-independent-drain-deadline-unit.json`。尚未执行这次窗口修复的任何负载；父代理后续不可变测量才是实际性能证据。
