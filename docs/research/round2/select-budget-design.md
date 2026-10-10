# ClickHouse SELECT 预算设计（历史设计）

## 当前验收入口（本地ce42c9f / d67应用源）

| 源/阶段 | 实际证据 |
|---|---|
| d67后端 |217单元+428真实集成=645PASS，实际后端执行|
| ce42c9f浏览器 |30检查（28真实Chromium+2日期）PASS、EXIT0；与d67 src/db/packages/sdk/scripts EMPTYdiff，不称后端重跑|
| d67镜像 |实际EXIT0：55DDL/391manifest/严格独立恢复；瞬时可用盘低62MiB风险已归档，不隐去|
| d67固定1000/5000 |实际EXIT1结束：1000PASS4.537660079秒；5000整体FAIL4700accepted/6unsent/38delayed/queryfail0，但draintrue、六final断言PASS，finalHTTP23.714184648秒；Node峰714698752B不含DB。性能仍欠，不称5000/SLO通过|
| Git/托管 |remotee441已核、push blocked，不再认证尝试；checkpoint manifest /workspace/baize-checkpoints/CHECKPOINT_MANIFEST.json、e441..87e六commit bundleverify0，仅Git对象/已跟踪source不含runtime keys。不称收工，不触发CI|

原661ENOSPC及d67首轮29/30整体EXIT1按原SHA证据保留在历史节。

1240 source文件前后不变、4项cleanup全true。当前无负载运行；末段可用盘观察1.5GiB→结束2.0GiB，不是minimum也不据此作因果解释。其后仅获批10个旧构建缓存精确ID清理，观测可用空间2485452800→9281884160B；完整清理证据另存，不触及最新镜像、共享依赖或卷。

容量探索87e（应用同d67）：PG/strict各20×50/5秒短时1000均EXIT0、0未发送/延迟/查询失败；仅有限探索，不替代原5000、日均百万或SLO验收，旧FAIL保留，见round2/CAPACITY_EXPLORATION.md。

## 历史SHA阶段记录与设计原文

## 历史2818bd4验收入口

c890实际后端211单元+421真实集成=632 PASS；1c1cb65浏览器30检查（28Chromium+2日期）PASS，src/db/packages与c890相同，不声称后端重跑。1c生产镜像实际EXIT0，main-1c1cb65-image-*证据绑定source1c。最终固定1000已PASS：最终HTTP5120ms、Node应用+harness采样峰650272768字节（不含存储服务）；5000最终FAIL（4900accepted/2unsent/39delayed、排空超时、最终断言未执行），不预称通过或SLO达标。预算默认值不保证scan行数、heap上限或性能改善。下文main0f/de当前或标记browser待等均为对应SHA历史原文，旧失败保留；托管不触发。

## 历史契约与阶段记录

当前main已推 `de7222edfd6baa7478a4e32e22f6b5399fc34daf`：整操作预算及显式SELECT失败关闭已实作，真实专项13项（9 PG/CH+4服务器/适配器）PASS/0skip，单元17项PASS；root16项是其子集，不重复累加。预算限制SELECT次数、decoded bytes与deadline，不保证扫描行数、heap峰值或性能提升。aea2ece人工日期标记已接趋势、4单元PASS，浏览器仍待新冻结。de新完整空库/浏览器/镜像正在准备，不能称已过；19与ac历史证据及所有旧FAIL保留，托管不触发。

以下保留设计时点原文；其中未实施/未测试仅指当时阶段，不代表当前代码状态。

本文件记录下一阶段设计，不表示预算已实现、性能目标已达到或已有收益。现有严格 5,000 事件负载已失败，1,000 事件完整性验证虽通过，查询延迟、发布延迟和内存仍需改进。阶段观察器与独立调度负载用于测量成本；不能由单一等待状态推断瓶颈占比。预算是失败边界，不能替代性能优化。

## 现有边界与风险

既有 SELECT 常用 LIMIT 101/201/1001，但 ORDER BY、DISTINCT、FINAL 仍可能扫描大量数据。客户端按接口限制 16/24/128 MiB 响应正文；这不限制服务器扫描或内存。客户端超时或取消 HTTP 不保证服务器已经停止执行。多 run、多 kind 的单批限制也不是整次操作的累计限制。

保留既有正常 EOF、JSON 解析、批次完整计数、哈希、私有 HMAC、精确成员、删除 epoch、来源及发布 fencing。不得采用部分结果成功、近似 distinct 或放宽排空期限来规避失败。

## 第一片：明确 SELECT 服务端抛错设置

只在明确的 SELECT 接口增加设置，不通过 SQL 文本猜测类型，不改变 INSERT/ALTER/物理删除语义。

候选设置是 `max_execution_time` 与 `timeout_overflow_mode=throw`，以及 `max_result_bytes` 与 `result_overflow_mode=throw`。执行时间应与现有客户端超时及剩余期限协调。结果字节可参考该接口已有响应预算，但 CH 服务端计算字节与 HTTP wire bytes 不同，必须真实验证边界后确定映射。额外扫描、内存限制若需要，应另行批准配置，不能根据 LIMIT 猜值。

所有值尚未确定，不修改整体默认限额。超限须整体失败，异常转换为现有安全错误，不暴露响应正文、URL、凭据或原 SQL。不使用 `break` 模式，也不扫描查询数据中合法的 `Code:` 文本判错。

验证包括合法小样本 exact oracle、服务端时间/结果超限抛错、正常 JSON 后附异常、断流、字节边界，以及失败后连接归还和 TEMP 清理。

## 第二片：操作累计预算

独立请求上下文累计 CH 请求数、收到的字节与单调时钟期限。044/047/048 共享桥、前周期比较、AI 工具轮次需按明确操作范围累计；HTTP 与 worker 使用不同配置。嵌套作用域复用同一预算，不重置，不混同阶段指标的 inclusive/exclusive 时间。

调用前预约请求预算，每个响应 chunk 累计字节，每个阶段检查期限。并发更新不能丢计数。耗尽只允许抛错，并在 finally 释放 reader、游标、TEMP 与事务；不返回 coverage=1 的不完整统计。不得把单批 16 MiB 直接当整站总预算。

需根据独立负载的真实分布决定配置值。观察 sink 失败不得改变业务结果或预算执行。验证需覆盖多 kind/run 累计、嵌套不重置、并发计数、阈值与阈值加一、缺体拒绝、原权威数据不变，以及 max1 连接池清理。

## 实施与测量顺序

先保留原不可变负载脚本和既有失败证据，使用阶段观测与独立调度测量。候选预算单独验证正确失败与清理，再按批准值接入；与批量归属 SQL、TEMP ANALYZE 分片评价，不能合并宣称收益。

TEMP ANALYZE 的独立合成实验未显示计入分析成本后的净收益，目前不接生产。上述两片预算也未实现、未执行新的真实 CH 预算测试。本文件归档期间不修改生产源码，不启动数据库、负载、构建、容器或托管 CI。

1c最终固定负载：1000 PASS、最终HTTP5120ms；5000总体FAIL：4900accepted、2unsent、39delayed、queryfail0，drainReached=false且120秒deadline，剩余积压1350/最大3250。最终查询25.389秒FAIL、assertionsExecuted=[]，不得声称六完整性断言已过。Node峰730509312字节不含数据库，source unchanged且4项cleanup全true；没有预算拒绝。已通过代码功能/浏览器/镜像不等于关闭此本地性能欠项，不据此称提速/SLO。归档证据为 docs/test-evidence/main-1c1cb65-independent-strict-5000.json 及配套record；原FAIL保留。

661正式641应用/30检查通过；固定1000PASS5.047623651秒，5000总体FAIL4350accepted/13unsent/35delayed/drainfalse120秒。已接受4350最终PV4350/coverage1/sourceCH、六完整性断言PASS21.102973929秒，不证明5000或SLO。新镜像待，e441本地HEAD的远端push因HTTPS认证失败未确认；旧FAIL保留。

## 历史前次状态入口（原记录保留）

## 当前验收入口（66150be，唯一当前）

最新本地主干d67bb8a已保存，正常Git push权限当前不可用，不创建token。只在同run effects/vitals均为complete CH时省identity TEMP写，混源保持原路径；type/lint、新2+旧18=20受影响真实集成及217单元PASS/0skip。20是部分集成，不与旧426累加；217首次215PASS/2旧mockFAIL保留，随后仅修形状不降断言。d67新whole/image/load等待串行验收，最新已过完整全轮仍是661641+30；不推断提速。原镜像ENOSPC FAIL及精确自有旧cache清理/targethealthy EXIT0仅诊断恢复，native未跑，不称镜像生命周期通过。
d67整轮实际EXIT1/cleanup：645后端（217单元+428集成）ALL PASS；浏览器29PASS/1FAIL，protected share只读提示未找到、实际HTTP503“统计快照已改变请重试”，D正在诊断竞态，不称全passed。新完整镜像/负载待。父已核远端e441；local e441..d67 Gitbundle及tracked-source tar保存在/workspace/baize-checkpoints，bundleverify0且排runtime，不创建新凭据。

正式全轮215单元+426真实集成=641PASS，30E2E（28真实Chromium+2日期）PASS，EXIT0/cleanup。固定1000PASS、finalHTTP5.047623651秒；固定5000整体FAIL：4350accepted/13unsent/35delayed、drainfalse120秒；已接受4350最终PV4350/coverage1/CH且六完整性断言PASS21.102973929秒，不是5000或SLO验收通过。

新镜像实际EXIT1：CH target233/ENOSPC创建preprocessed_configs；build/install/manifest/budget/55DDL/licensing/seed已过，native阶段未开始，targetcleanup完成，F归档证据。不推测底层原因。本地01e2c5d已保存，不预称远端确认；托管不触发。下文全为按SHA保留的历史阶段与设计，预算不保证scan/heap或性能收益。
