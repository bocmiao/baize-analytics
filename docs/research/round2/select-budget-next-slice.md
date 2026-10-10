# SELECT 预算下一独立切片建议（历史设计）

## 当前验收入口（本地ce42c9f / d67应用源）

| 源/阶段 | 实际证据 |
|---|---|
| d67后端 |217单元+428真实集成=645PASS，实际后端执行|
| ce42c9f浏览器 |30检查（28真实Chromium+2日期）PASS、EXIT0；与d67 src/db/packages/sdk/scripts EMPTYdiff，不称后端重跑|
| d67镜像 |实际EXIT0：55DDL/391manifest/严格独立恢复；瞬时可用盘低62MiB风险已归档，不隐去|
| d67固定1000/5000 |实际EXIT1结束：1000PASS4.537660079秒；5000整体FAIL4700accepted/6unsent/38delayed/queryfail0，但draintrue、六final断言PASS，finalHTTP23.714184648秒；Node峰714698752B不含DB。性能仍欠，不称5000/SLO通过|
| Git/托管 |remotee441已核、push blocked，不再认证尝试；最新local检查点以/workspace/baize-checkpoints/CHECKPOINT_MANIFEST.json为准，仅Git对象/已跟踪source不含runtime keys；87e六commit为历史verified记录。不称收工，不触发CI|

原661ENOSPC及d67首轮29/30整体EXIT1按原SHA证据保留在历史节。

1240 source文件前后不变、4项cleanup全true。当前无负载运行；末段可用盘观察1.5GiB→结束2.0GiB，不是minimum也不据此作因果解释。其后仅获批10个旧构建缓存精确ID清理，观测可用空间2485452800→9281884160B；完整清理证据另存，不触及最新镜像、共享依赖或卷。

容量探索87e（应用同d67）：PG/strict各20×50/5秒短时1000均EXIT0、0未发送/延迟/查询失败；仅有限探索，不替代原5000、日均百万或SLO验收，旧FAIL保留，见round2/CAPACITY_EXPLORATION.md。

## 历史SHA阶段记录与设计原文

## 历史2818bd4验收入口

c890实际后端211单元+421真实集成=632 PASS；1c1cb65浏览器30检查（28Chromium+2日期）PASS，src/db/packages与c890相同，不声称后端重跑。1c生产镜像实际EXIT0，main-1c1cb65-image-*证据绑定source1c。最终固定1000已PASS：最终HTTP5120ms、Node应用+harness采样峰650272768字节（不含存储服务）；5000最终FAIL（4900accepted/2unsent/39delayed、排空超时、最终断言未执行），不预称通过或SLO达标。预算默认值不保证scan行数、heap上限或性能改善。下文main0f/de当前或标记browser待等均为对应SHA历史原文，旧失败保留；托管不触发。

## 历史契约与阶段记录

当前main已推 `de7222edfd6baa7478a4e32e22f6b5399fc34daf`：整操作预算及显式SELECT失败关闭已实作，真实专项13项（9 PG/CH+4服务器/适配器）PASS/0skip，单元17项PASS；root16项是其子集，不重复累加。预算限制SELECT次数、decoded bytes与deadline，不保证扫描行数、heap峰值或性能提升。aea2ece人工日期标记已接趋势、4单元PASS，浏览器仍待新冻结。de新完整空库/浏览器/镜像正在准备，不能称已过；19与ac历史证据及所有旧FAIL保留，托管不触发。

以下保留设计时点原文；其中未实施/未测试仅指当时阶段，不代表当前代码状态。

当前 `b0be327` 同口径严格 1,000 事件运行完成：排空采样 p95 约 6,437.6 ms，最后查询约 7,009.6 ms，排空约 48.2 s，内存约 665 MB。这是共享宿主的一次结果，不能据此前后差值宣称达标或归因。此前阶段总量含初始化、采集、排空、最终验证，不能用整个运行的请求数/字节数给单次查询定硬预算。

本文件不修改冻结源码，不实施预算或运行测试。预算用于资源失控时明确失败，不是降低已有正常查询延迟的优化。

## 最少改动顺序

第一步只给 **明确 SELECT 的 HTTP 调用** 增加服务端执行时间上限及 `timeout_overflow_mode=throw`。候选上限沿用该调用已有客户端 timeout 秒数，而不是拿整次查询 p95 作每批期限；保留原客户端 AbortSignal。DDL、INSERT、ALTER DELETE 不接这个设置。原来已能在同等请求 timeout 内完成的 1,000 事件请求不应因把整体 7 秒错当每批预算而被截断；仍需同不可变脚本实际验证。ClickHouse 执行计时检查方式不等于客户端 wall time，不能未经测试断言完全等价。

暂不设新 `max_rows_to_read`、扫描字节或内存默认值，也不直接把客户端 wire body 上限复制为服务端 `max_result_bytes`。不同结果格式与 CH 计量差异必须实测。若接结果预算，只允许 `result_overflow_mode=throw`，不允许 `break`。成功必须满足原完整 EOF、JSON、数量、哈希、HMAC 和来源 fencing。

第二步是独立、可选的 **单次完整统计操作预算**：先只为已明确边界的 stats 操作记录累计请求数、实际运输字节、单调时钟总期限。不要把 worker、初始化、采集、整次 benchmark 或模型所有轮次混入同一个数值。前周期比较及嵌套 retention 属于同次 stats，应共享预算而不是重置；原事务内 TEMP 复用仍保留。

预算值尚未确定。应先获取每个 correlation 的完整终结汇总，包含最后查询而不是仅计划期间的两个采样，并标识直接 `.json()` 辅助调用的观测缺口。只用运行总量无法保证合法 1,000 事件请求完整。配置未设置时保留现有执行行为；未知预算配置不得静默采用猜测小限额。

之后在明确配置的操作上启用累计硬限制：每个 CH 调用前预约请求次数，每个 chunk 累计实际字节，并检查总期限。允许合法的两请求预取同时消耗同一上下文；不得在每次请求重新创建预算。超限会等待/取消并收束本组读请求，抛出安全错误，回滚或清理 TEMP，不返回正常的部分 totals 或 coverage=1。

## 合法请求与失败验证

- 同一不可变源运行原严格 1,000 事件脚本，全部既有完整性断言保持；不修改排空期限、样本、生产限额或预期。
- 记录初始化与正常查询分别使用的预算，真正最后查询也记录；不得用整体汇总推出单请求阈值。
- 预算阈值根据真实 per-operation 分布和明确合法输入范围决定，保留余量；1,000 事件通过不表示高基数、较大属性或较多归档 owner 的合法请求一定通过。
- 单项预算刚好满足与加一、并发预取累计、嵌套不重置、服务端执行 throw、HTTP 200 后异常、断流和缺正文仍失败。
- 错误不包含响应正文、身份、站点、凭据或 SQL；sink 故障不改变预算和业务结果。
- 失败后同客户端/池、游标、TEMP、reader 清理；实际权威数据与发布状态不变。既有 exact distinct、币种、加权分位、小样本 oracle 不变。

## 这轮不做

不新增依赖规划架构、不盲跳批、不引入跨事务缓存，不把预算导致早失败当作性能改善，不生产接入未显示净收益的 TEMP ANALYZE。044 预取只减少有条件的串行往返，当前剩余成本需独立测量确认，不能把 SELECT 限制替代进一步优化或证明 5,000 事件目标已达标。

1c最终固定负载：1000 PASS、最终HTTP5120ms；5000总体FAIL：4900accepted、2unsent、39delayed、queryfail0，drainReached=false且120秒deadline，剩余积压1350/最大3250。最终查询25.389秒FAIL、assertionsExecuted=[]，不得声称六完整性断言已过。Node峰730509312字节不含数据库，source unchanged且4项cleanup全true；没有预算拒绝。已通过代码功能/浏览器/镜像不等于关闭此本地性能欠项，不据此称提速/SLO。归档证据为 docs/test-evidence/main-1c1cb65-independent-strict-5000.json 及配套record；原FAIL保留。

661正式641应用/30检查通过；固定1000PASS5.047623651秒，5000总体FAIL4350accepted/13unsent/35delayed/drainfalse120秒。已接受4350最终PV4350/coverage1/sourceCH、六完整性断言PASS21.102973929秒，不证明5000或SLO。新镜像待，e441本地HEAD的远端push因HTTPS认证失败未确认；旧FAIL保留。

## 历史前次状态入口（原记录保留）

## 当前验收入口（66150be，唯一当前）

最新本地主干d67bb8a已保存，正常Git push权限当前不可用，不创建token。只在同run effects/vitals均为complete CH时省identity TEMP写，混源保持原路径；type/lint、新2+旧18=20受影响真实集成及217单元PASS/0skip。20是部分集成，不与旧426累加；217首次215PASS/2旧mockFAIL保留，随后仅修形状不降断言。d67新whole/image/load等待串行验收，最新已过完整全轮仍是661641+30；不推断提速。原镜像ENOSPC FAIL及精确自有旧cache清理/targethealthy EXIT0仅诊断恢复，native未跑，不称镜像生命周期通过。
d67整轮实际EXIT1/cleanup：645后端（217单元+428集成）ALL PASS；浏览器29PASS/1FAIL，protected share只读提示未找到、实际HTTP503“统计快照已改变请重试”，D正在诊断竞态，不称全passed。新完整镜像/负载待。父已核远端e441；local e441..d67 Gitbundle及tracked-source tar保存在/workspace/baize-checkpoints，bundleverify0且排runtime，不创建新凭据。

正式全轮215单元+426真实集成=641PASS，30E2E（28真实Chromium+2日期）PASS，EXIT0/cleanup。固定1000PASS、finalHTTP5.047623651秒；固定5000整体FAIL：4350accepted/13unsent/35delayed、drainfalse120秒；已接受4350最终PV4350/coverage1/CH且六完整性断言PASS21.102973929秒，不是5000或SLO验收通过。

新镜像实际EXIT1：CH target233/ENOSPC创建preprocessed_configs；build/install/manifest/budget/55DDL/licensing/seed已过，native阶段未开始，targetcleanup完成，F归档证据。不推测底层原因。本地01e2c5d已保存，不预称远端确认；托管不触发。下文全为按SHA保留的历史阶段与设计，预算不保证scan/heap或性能收益。
