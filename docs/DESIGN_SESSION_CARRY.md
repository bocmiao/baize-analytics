# 036 会话前缀：状态与接线边界

036 是独立在制切片，不能标记 P2-01 完成。033 生产查询不依赖它。

`session-prefix-reducer.ts` 当前实际处理单访客、全局事件时间及 event_id 排序的异步事件流。运行时仅一个紧凑摘要；页面、心跳段、目标、漏斗状态放在 SQL 键表。它从已发布 checkpoint 续接，在 standard 模式跨本地日保留首次 anchor 与 session_id；超过会话超时开启新 lineage 并删除该 staging checkpoint 的旧键。daily_salt 不续接不同本地日。定义/时区/超时哈希变化不能猜测旧状态。

生产阶段需要先在物理保留期删除前推进前缀，归约上一个 through/event_id 到新 cutoff 之间的事件，不能物理删完再试图重建。新前缀只随已通过 lease、聚合 epoch、canonical deletion epoch 的事实 run 发布；失败 staging 不得覆盖已发布 head。当前前缀归约器和 lifecycle 尚未接生产 worker、retention 或 restore。

`analytics_session_contribution_heads` 是后续逐 session ownership overlay 的状态。旧小时 pointer 单独不足以发布延长的旧会话：更新 A 的旧小时不能替换同小时 B 的唯一归档贡献。接线必须复制 A 已失去原始明细的完整贡献、加尾部、重发可变 session/goal/funnel 指标，再精确更新 A 的 head；旧 B 继续引用原 run。所有 member/numeric/vital/AI/retention 查询需统一使用这一选择契约。033 清理旧 run 时也必须保留 carry 和 contribution heads 的引用。

`eraseSessionCarrySegments(client,siteId,segments)` 要求持有同一 P→site gate，且 journal 已持久。完整访客物理删除四表中归属数据；部分身份时间段删相交 exact key、清不可逆摘要的页面、维度和计数，并保留 status=unavailable 阻止伪造新匿名会话。不能把这一保守失败口径当作完整的部分会话重算。其他访客保持不变。

`rebaseSessionCarryEpoch(client,siteId)` 只能在最新完整删除 journal 验签、重放及事实 epoch rebase 后调用。它不验证 journal，不提供恢复入口。非空 standalone 签名备份目前必须 failclosed；以后须包含四表、exact keys、ownership refs、schema version、run 映射与校验。整库 PG dump 自动含表也不等同恢复验收。

还未实现：收入订单前缀去重；有序源在零行时的 checkpoint 传递；旧贡献重发与 session ownership SQL 查询；生产前缀推进及新旧 carry run pruning；缺原始明细的部分身份删除重算；非空 carry 签名备份与隔离恢复。旧 legacy 缺失前缀必须显式不可用，不可缩成任意有限 lookbehind。

实际证据：`/tmp/baize-036-prefix-lifecycle.json` 两项真实 PG、独立 schema、pool max1 测试通过：未发布不可见、203 exact keys 流式读取、跨午夜稳定 anchor、重复心跳不重计、目标一次与漏斗续接、超时新会话键隔离、部分删除摘要清除及 unavailable 标记、完整删除 A 保留 B、epoch rebase。首个夹具键数断言失败保存在 `/tmp/baize-036-prefix-reducer.json`，修正为检查新会话不保留旧 goal/heartbeat 后通过。100000 摘要计数的存储夹具不是十万事件性能验收。

后续独立生产源接线进展（仍未默认启用）：`session-prefix-retirement.ts` 在同一 client 内将待过期源流写 SQL TEMP，按访客/时间游标归约并发布 carry；实际 PG 源 210 行得到 1 PV、209×500ms、210 exact keys，无 pool max1 二次借用。`session-contribution-overlay.ts` 实现按 session ownership 选择及 SQL 复制旧不可变 effects/vitals；同小时 A 复制不替换 B，旧可变 sessions 指标不复制。`session-prefix-seed.ts` 从 SQL 状态恢复有限定义摘要、真实 first/last page 元数据及心跳/完成 exact keys。`session-facts.ts` 新 `sessionPrefixes` 显式选项默认 false；专项实际调用完整事实 reducer，以 prefix+tail 得到稳定 session_id、PV3、visible1000、duration540秒、原入口与新出口。证据 `/tmp/baize-036-facts-tail.json` 1 PASS。这不是默认 worker、全查询、CH source、retention、备份恢复的完成证据。

## 后续生产接线 WIP（覆盖上述早期未接线状态）

默认 `rebuildSiteFacts` 已开始接线：在同一捕获 RR client 和同一个 staging run 中先推进待过期前缀，再读 retained tail；初次尚无 V2 backing 时读取所有当前实际存在的源明细建立完整事实基线，不凭摘要伪造缺失贡献。只有源捕获、lease/epoch/canonical fence 通过并发布事实后，才发布 carry 和贡献 owner。旧 run/行的清理保留 carry、贡献 owner 的引用。成员、数值及 AI 使用统一 owner；vitals 表没有 session_id，单独通过同 run/event_id 的 effect 关联 owner。已有 owner 时看板的完整小时也从事实 SQL 归约，不能混用更新前的小时数值。此状态仍为 WIP，不代表 P2 完成。

新增实际证据：`/tmp/baize-036-worker-ai-cutoff.json`，默认生产 worker、独立真实 PG schema、pool max1：A 跨保留期会话首次发布后物理清掉 cutoff 前明细，再次 worker 仍保持原 session_id/入口、PV3、700ms、240秒；B 的唯一旧贡献保留。实际 stats PV4、UV2、sessions2、coverage1；跨 cutoff AI 转化率的分母2、分子0由精确 owner 证据计算。`/tmp/baize-036-owner-selection-prune.json` 证明非 current、无小时引用的 owned run 经实际 prune 后保留贡献和 vitals，过期 owner epoch 不通过 fallback 复活旧 A。连续真实 HTTP 60 条的首次接线回归发生重复合并（10→20），失败保留于 `/tmp/baize-036-production-initial.json`；只保留真正 legacy 原始整桶后，`/tmp/baize-036-production-continuous-fixed.json` 通过。`/tmp/baize-036-production-regression.json` 原事实 reducer、prefix、删除 API 共12项通过，无 skip。这些证据不是百万性能或 CH 权威切换验收。

仍须完成：无原始明细的部分身份区间前缀精确重算（目前保守 unavailable）；受控 daily anchor 的 producer lineage/038 proof 保留、非空签名备份重新验证；全部生命周期与真实 CH switch/prune 后 source 链的联合回归；关闭前缀 exact keys 的安全回收和 dirty 差分。新的 anchorPageId 保存实际首源事件的 page_id，anchor 时间为 state.startedAt，不能以 through 或首 pageview 时间替代。旧 legacy 已缺前缀的窗口仍应明确不可用。不能把本段默认路径小样本通过等同全范围迁移完成。
