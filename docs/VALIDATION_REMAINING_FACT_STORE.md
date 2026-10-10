# 047 派生正文适配器本地验收（在制）

适配器覆盖五种严格原始行：session、numeric、member、carry checkpoint、carry key。PostgreSQL 保留运行/种类完成标记、精确 attempt 白名单、计数、正文 hash，以及真实访客/会话闭区间归属；正文写入 ClickHouse。numeric/member 不推测 bucket 为事件时间，生产阶段必须找到同运行真实 session 或 checkpoint。

`tests/integration/remaining-fact-store.test.ts` 在独立 PostgreSQL schema、连接池 max=1 和真实本地 ClickHouse 上运行：2026-10-10 13:13:32 UTC，6/6 通过，runner 1.30 秒。包括上传后 PostgreSQL 回滚不可见、精确正文往返、真实最终生产投影的五种正文、标准模式可信新运行 checkpoint 替换后旧正文物理擦除、同运行孤儿 attempt GC，已发布 PG 原始正文的严格回填（拒绝错误正文/不完整 receipts），以及真实 TCP 连接拒绝后的持久退避/恢复。`tests/unit/remaining-fact-transport.test.ts` 2/2 通过，验证完整归属/来源密封和传输上限。全局 TypeScript 检查、所属文件 ESLint 通过。

新增生产投影用例第一次失败源于测试将 JavaScript 数组作为 PostgreSQL 数组参数发送到 JSONB；修为显式 JSON 编码后通过。该失败不是成功记录。已保留执行输出，不删除或降低断言。

删除区间为 `[start,end)`，来源区间为闭区间；相交时 session 聚合整行失效，不能伪造逐事件扣减。部分 carry 删除必须先通过可信 anchor/lineage 生成独立替换运行；普通全访客删除 API 拒绝部分区间。carry keys 使用各自真实 first/last 区间。旧 checkpoint 正文物理擦除包含未提交 attempt，只保留验证通过的替换运行。047 将既有 carry lineage 的 FK 移至 fact run，避免 PG checkpoint 正文裁剪连带删掉唯一来源证明；receipt 精确保留 anchor 和 last event 引用。

尚未计为本文件验收：每日盐部分删除的 038 lineage 闭环、CH-only 消费者全部 TEMP 桥接、独立目标/同端点新运行备份恢复、默认生产注册及 PG 正文裁剪。其他负责人的独立结果由集成负责人汇总，不能把本适配器的 6 项替代这些验证。本阶段未运行浏览器/Docker/全量 suite，也未执行 Git、CNB 或外网部署。

后续新增私有 carry 恢复 sidecar：存真实新 checkpoint、真实 ready-run 元数据、038 新来源证明及经 fsync 日志授权的 scope/HMAC，不存旧 checkpoint 正文；普通查询不能借它读取 orphan。全访客删除及下一可信替换会物理擦除旧 sidecar。C 隐私负责人的实际组合执行已有 4 个 native 用例通过，包含非空新 B anchor、物理 ACK 后 PG 回滚的受控恢复、空幸存者签名 marker、追加另一真实 fsync scope 后通过当前日志精确子集授权恢复；组合 4 文件 7 项通过，证据 `/tmp/baize-047-c-combo-final.json` 与 `/tmp/baize-047-partial-expanded-journal.json`。普通缺失正文仍失败关闭。这是独立 C 负责人的结果，不增加本适配器 6 项计数；TCP 拒绝入口专项随后 1/1 实际通过：`/tmp/baize-047-tcp-real-refusal-retry.json`，真实关闭的临时 loopback 端口触发 fetch 拒绝，入口返回 503，PG epoch/proof/047 receipts 不变且 fsync 日志保留；恢复真实连接后五类正文全等，真实日志重放 A 删除、B 保留，PV 4 / UV 2。首次夹具包含未迁移的旧运行，严格读报 NOT_MIGRATED；限定真实五类完成命名空间后通过，没有放宽源规则。完整消费者与备份闭环仍待集成验收。

2026-10-10 13:27:00 UTC，044/047 两个适配器文件组合真实 PG/CH 15/15 通过（044 为 9 项、047 为 6 项），之后全局 TypeScript 检查通过。传输层随后仅增加 fetch 拒绝映射为固定 `REMAINING_FACT_CH_UNAVAILABLE`，不捕获 SQL、正文或来源验证错误；所属 ESLint 通过。该小变更已由 C 上述真实 TCP 入口故障专项验证；不增加本文件适配器 6 项计数。
