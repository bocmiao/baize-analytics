# 056 增量会话候选：在制证据

基线：`a86993d626bac551d5222d4006f8edaa0a41f29b`。本候选尚未完成整轮验收；`BAIZE_INCREMENTAL_SESSIONS=1` 才启用，默认保留原全量归约。仅 strict 模式可以选择 visitor delta，PG 继续作为全量对账。未知 generation、收入、identify、定义/时区/删除/恢复及不完整 owner 均走保守全量或拒绝，认证失败不得通过全量回退伪成功。

## 已执行

- 类型、lint 检查通过；新增相关专项最新 34 单元断言通过，小时引用专项另有 2 项单元通过。非全目录单元计数。
- 4 项真实 PG generation 证据专项通过；这不是 CH 正文认证的替代。
- strict 差分主用例通过：A/B 同小时未变 owner、迟到桥接、退役空 owner、与强制全量对账、收入/identify 回退、配置 epoch 与 receipt 重绑定、删除及 PG 正文裁剪。
- 边界初轮及第二轮均为 2 通过 / 2 失败；v3 为 3 通过 / 1 失败；v6 最终 4 通过 / 0 失败 / 0 skip。涵盖无页面组件、未变正文缺失、每日盐 DST/当地午夜、原始过期前缀。修正有据夹具之外，窄修合法设备分类缓存误拒，并为 delta 新小时追加缺失引用，保留旧小时引用与 missing 守卫。失败 JSON 原样保留。
- 3 项 CH ACK 后 PG 回滚/失 lease/删除 epoch 拒绝真实故障专项全部通过；1 项真实 PG 多 run 导出定义专项通过。独立签名恢复已执行两次失败（回退与 carry 夹具断言有误），v3 亦失败（PG 保留清理未产生 dirty 的夹具顺序错误），调整为在真实 strict 激活后执行保留清理。恢复仍待验，不宣称闭环。

## 同条件小基线

不可变 `a86993d`：300 事件，50 事件/请求、每秒计划一请求、独立 10 秒查询、队列 8、并发 2、120 秒 drain。实际 EXIT0，300 接收、0 未发送、最终积压 0，完整性断言通过。采集 P95 400.322ms，查询 P95 371.109ms，最终断言 1363.345ms。此为短样本基线，不证明 strict5000 或百万日事件 SLO。

首个启动因 `/usr/bin/time` 不存在 EXIT127，应用未执行；保留原日志，改为 Python monotonic + RUSAGE_CHILDREN 后才运行上述 v2。既有 strict5000 FAIL 及低速探索不变；没有降低预算、延长 drain 或改变验收阈值。

不可变候选 `a49aec17034d8c6344528da5d702630839592578` 同条件 300 事件 EXIT0，300 接收、0 未发送、最终积压 0。墙钟 17.025s（基线 21.165s），进程峰值 499176KiB（基线 624092KiB），采集 P95 274.436ms、查询 P95 355.557ms、最终断言 1405.234ms。044 旧事实读取仍为 9,364,444 字节，请求由 8 增至 11；发布 INSERT/独立读回各由 144 降至 88 请求。只证明该短样本减少派生发布，不能证明持续容量；跨 run 认证请求增加仍是风险。

该候选随后真实复现归档正确性 P1：同 visitor 已关闭旧会话与当前会话隔离，当前追加增量使独立保存的旧区间 PV 从 2 降至 0。原 FAIL 已入证据目录；因此上述性能结果不能作为候选可交付验收。修复后真实 PG/CH 专项 1 PASS / 0 FAIL / 0 SKIP，明确观察 `fullPlans=1`、`deltaPlans=0`、`archived_dirty_owner`，旧区间 PV2/session2/vitals2、owner run/generation 和正文哈希不变，当前 PV2、dirty/outbox 排空。没有用受损后强制全量当 oracle。056 正向访客元数据删除专项仍待结果。独立恢复 v4 另实测 `CACHE_SOURCE_FENCE` 失败，原证据保留；TTL live receipt 重绑定修复尚待真实回归，不宣称恢复通过。

## 计数口径

`reusedSessions` 只数已认证 session summary 与当前有效 owner 的精确匹配；`reusedOwnerHeads` 包含空退役 owner，因此另列。`producedEffectRows` 为 staging 派生行，`hydratedEffectRows` 为认证后可见旧 TEMP 行，均不是唯一事件或 HMAC 实际认证总量。阶段时间可嵌套/累计，不能相加作为墙钟比例。每轮 fallback 原因固定枚举；关闭功能不计为真正 fallback。

本批未运行任何 CNB/同步/GitHub Actions。原始证据见 [目录](performance/incremental-056/)。
