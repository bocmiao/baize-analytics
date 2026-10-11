# ADR 060：采集回执与持久收件箱的有限容量实验

状态：**当前隔离专项 36 项实际 PASS（14 base + 8 admission + 14 两模式 PG/CH）；真实 physical 删除闭环此前 21 项已通过。生产未接入，新增超时与负载验证尚待结果，不宣称性能改善。** 060 是本文编号，不分配数据库迁移编号。不替换正式采集入口、不新增依赖、不部署。历史 e7afef9 14 项、f75f089 联合 17 项保留下文，不与新专项重复累加。

## 当前事实与决策

当前普通 PG 模式的 `202` 在事件/幂等键/outbox 同事务提交后返回；严格 CH 模式还要求脱敏正文真实 CH 写入、完整读回验证及 PG 成员/批次提交。`202 accepted` 表示正文已按当前权威协议可靠接收，**不表示会话/统计已经发布**。实现见 [collect.ts](../src/server/collect.ts)、[canonical-ingest.ts](../src/server/canonical-ingest.ts)。严格重试也验证原已提交正文或受控隐私替换链存在，不能只凭旧幂等键成功。

B 的 `published` 同样只表示权威事件正文与 PG 回执已发布，**不表示会话或统计 ready**。第四层派生状态必须另看聚合 generation、水位和 coverage；不得把 inbox 已处理数量当作统计完整性。模拟 publisher 不能据 `published` 标签承诺真实 CH 已耐久；当前真实 CH 3 项只证明其 standard prepared 隔离路径，不扩大到正式采集或所有类型。

现阶段不改变这项公开语义。优先比较 A；B 只作为独立试验，不把提前 ACK 的吞吐数字与当前 `202` 的耐久性混为同一验收。

| 方案 | 回执与用户含义 | 可能收益 | 新成本/风险 |
| --- | --- | --- | --- |
| A：保留严格协议，优化有界批处理 | CH 正文耐久、完整读回、PG commit 后仍返回既有 `202`；聚合另有水位 | 减少固定往返/序列化，沿用既有隐私删除和备份证明 | 同站点事务/锁仍覆盖耐久写入；批处理必须有界，可能只改善短请求 |
| B：前置 PG durable inbox | 分别显示 `received`（脱敏收件箱已提交）、`validated`（当前身份/策略验证通过）、`published`（权威事件正文与 PG 权威回执提交；原型仅模拟 publisher） | 可把网络请求接收与 CH 发布解耦，批量调度和显式背压 | PG 再持久化待处理正文，增加隐私/备份/容量成本；`received` 不能冒充正式 accepted/published，ACK 后拒绝如何反馈需产品契约 |

父集成负责人提供的实际证据：239 源 5000 固定负载仍 FAIL，4900 accepted、2 queue-full 未发送；另 A72 原 5000 FAIL，4700 accepted、6 未发送，均保留；047 的同站点 100 条实验在特定配置下约有 19–21% HTTP 改善；正文传输字节与请求数量也不同，父提供请求数 71→25，不能解读为等工作量的约 21% 请求数下降或容量通过。本文未重新执行这些基准。已有短时改善不抵消 5000 FAIL，也不能声称日均百万、P0 聚合滞后或资源隔离 SLO 已达标。A72 完整本地验收已通过，5000 仍失败；不据短时净收益写成容量通过。

## 当前独立 admission 候选

独立 admission **默认关闭**，模式持久化且不可变，不能同站点运行中悄悄切换。新模式 receive 使用 `P → 762` 短锁，不取得 parent 行锁；publish 使用 `P/site → 761` 并读取 parent（plain read）；原型 delete 使用 `P/site → 761 → 762 → parent FOR UPDATE`。容量检查为保守 snapshot，不通过共享计数更新重新引入 parent 写竞争。

该锁序只属于隔离原型，**生产删除尚不取得 762**，因此不声称已兼容正式采集/删除接线。PG 同 schema journal 不是独立文件 fsync 最新日志。36 项实际通过只能支持对应功能与故障范围；新增 timeout 与负载结果尚未完成，不能从解耦锁推断性能或容量提升。

## 后续必须保留的协议不变量（不是当前原型完成清单）

1. `(site,event_id)` 同内容重试幂等，不同内容明确冲突。批次重复、收入订单别名、回放序列仍各自遵守原策略；不能因 inbox 重试重复 identify、收入或治理副作用。
2. 接收与发布 worker 都检查站点、来源、当前授权及 tombstone。个人删除先可靠独立日志 fsync，再执行待处理/已发布正文的物理清理；删除 ACK 后不能发布早已排队的旧身份正文。已发外部通知不可召回的边界保持明确。
3. identify 按事件时间及身份区间处理，不能按 inbox 排队/处理顺序重写过去身份；迟到、多标签和 SPA page instance 不改变。并发删除、identify 和发布沿既有 P/site/正文锁顺序，不能持连接再借同池。
4. 持久 inbox 只能存入口内存 IP/HMAC/地域处理后脱敏内容，不能新增原 IP/UA/原请求正文。每日盐按事件时间的站点日域，不保跨日稳定用户、页或订单 ID，不制造跨日留存证明。
5. 每个 pending 项需绑定验证 hash、站点、协议/隐私解释版本、事件时间及来源/删除 epoch。epoch/config 变化必须受控重验证或拒绝，不能用旧验证覆盖新策略；失败状态明确，不能伪造统计 coverage。
6. CH 成功但 PG rollback 的 attempt 是不可见 orphan；published 仅由已提交 PG 白名单、完整读回/hash/HMAC 和 fresh fence 共同决定。两个并发任务必须全部 settle 后才释放锁；失败保留原错误，不靠扩大每批 100 条上限提速。
7. 队列同时限制条数、字节、每站点份额、年龄和在途任务；超限显式背压及重试提示，不无界排队或以内存队列替代耐久回执。站点公平调度，持续写入不饿死旧完整窗口。
8. 备份/恢复包含 pending 与其策略来源、去重键和处理状态；目标暴露正文前先应用独立最新删除日志及单调 TTL 证明。源 namespace 不改变；缺证明、旧未知拓扑或正文缺失必须 fail closed，不能把不完整恢复显示为 ready。

## 隔离原型与决策闸

历史 e7afef9/f75f089 实施记录（当前以顶栏 36 项为准）：`scripts/prototypes/durable-inbox.ts` 与独立测试的 14 项 PG 已覆盖 per-site pending bytes（默认 16 MiB）等原型约束；另有真实标准 prepared publisher 3 项 PG/CH 验证，复用生产 CH 写入、完整读回及 PG 白名单协议，见[真实 CH 验证记录](VALIDATION_DURABLE_INBOX_REAL_CH.md)。原型独立 PG 删除日志提交/重放不等于生产独立文件 fsync 删除日志；每日域身份由受控上游提供并在原型脱敏校验，不能称已验证真实 collector。历史模拟首轮结果为 1 文件 8 tests PASS、0 skip、EXIT0；CLI received=1、publishedEvents=1、publisher=simulated_transport、productionIntegrated=false，详见[原型验证记录](VALIDATION_DURABLE_INBOX_PROTOTYPE.md)。历史联合 17 项通过结果以真实 CH 文档的 source binding 为准；历史模拟结果保留，均不表示未来故障闸全部完成。

仅在随机 schema/独立 namespace 上实现可撤销试验，不注册正式 HTTP endpoint、不改正式 `accepted` 字段。两方案使用相同事件、站点、节奏、队列、超时和故障；同时报告收到、验证、发布的实际数量与耗时，不把降速探索替代原固定负载。

以下仍是下一阶段验收要求，不能将历史联合 17 项或当前 36 项等同于全部完成：必须通过真实 PG/CH 故障夹具：提交前/后进程终止；CH 写成功后 PG 回滚；两项并发中第一/第二失败；重复和冲突 event_id；收件后删除与处理期间删除；迟到 identify A→B 与删除 A 保 B；跨午夜/DST 每日盐；源/删除 epoch 变更；队列满/公平性；带 pending 的签名备份独立恢复与最新日志重放。每项保存预先建立的正文/指标/owner/hash oracle，不能受损后重算作为唯一正确答案。

性能闸要求完整发送、可解释拒绝、真实最终 PV/UV/会话与成员对账、水位/outbox 排空、无 unhandled promise、清理源不变。报告 p50/p95 接收和发布延迟、队列峰值/年龄、Node RSS（不含数据库时明说）、PG/CH 存储量、锁等待和恢复时间。若 A 无稳定净收益或 B 仅提前回执而最终发布更慢，不宣称解决 5000。先由实际结果决定保留、撤回或继续；本文不预设数字 SLO。

## 当前原型明确未覆盖

原型 `validated` 只表示 prepared shape/digest、当前 source epoch 和 tombstone 检查；保存事件时间和给定删除区间，未实现真实 identify 映射、迟到身份重分段、每日 HMAC 与跨日/DST 身份证明。单行 16 KiB、批次最多 100 条和 pending 条数有界，尚无全局队列字节、全局公平、年龄或总历史存储限制；每站点 pending 字节现已实际验证。

同 schema PG 删除日志提交/重放不是独立文件 fsync 最新日志，也不是签名 pending 备份的跨数据库恢复。真实 CH standard prepared 路径已验证读回和 PG 提交白名单；但 prepared digest 不是原 wire 回执，也不是每日身份 HMAC 证明。identify/revenue/daily_salt 未由真实 publisher 支持，真实隔离 publisher 的已发布正文 physical-delete ACK 已由此前 21 项验证；PG journal 仍非生产独立 fsync 日志，不能外推正式删除或跨数据库恢复。publisher 超时触发 AbortSignal 后仍持 privacy gate 等待实际 callback settle；若 callback 不配合取消，可能无限等待。这是安全 fail closed，不是有界墙钟延迟。模拟外部写入不能宣称已物理擦除。

这些欠项属于 B 原型下一闸，不表示既有产品功能整体未交付，也不宣称 B 性能或容量闭环。

## 外部技术参考的证据等级

以下来源由父研究提供，本文未独立访问、核验对应提交全文：

- Plausible `bc2c7b3`：父提供 runtime 667–699 与 `write_buffer` 线索，可研究有界写入调度；不能据此证明白泽回执等价。
- Rybbit `bc23257`：父指出 `pageviewQueue` 是内存队列且 ACK 非耐久；不能复制为白泽可靠采集证明。
- GoatCounter：父提供短批交换引用的思路，确切提交/正文未核验，保留为待核线索。

这些参考只帮助比较实现取舍，不能替代本仓库实际故障测试或当前隐私、权威和恢复契约。
