# 白泽 Baize Analytics 第二轮技术研究

核查日期：2026 年 10 月 10 日。目标是为免费自托管、BYOK 的现有应用选出可验证的小范围改进，重点为 strict ClickHouse 模式的性能可靠性，以及 SEO 和 AI 建议的可信解释。

本报告通过 GitHub 连接器只读核查 `bocmiao/baize-analytics` 的 main，固定源码版本为 `f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030`。同时阅读 ClickHouse、PostgreSQL、Google Search Central 与成熟分析工具的官方资料。没有修改仓库、运行基准、触发 CI、连接真实 OAuth 账号或购买服务。后文“建议”与“测试方案”均不是已经实现或通过的声明。

## 关键结论

1. **P0 先补可归因的性能证据。** 保留已有串行回归基准，另加采集与查询独立调度的有界负载，并把连接池等待、锁等待、事实认证、CH 运输、PG 暂存、聚合拆开计时。现在的 5000 事件结果足以证明该配置表现不佳，不能证明固定吞吐容量，更不能从单个等待状态推导根因占比。
2. **P0 收紧 CH HTTP 完成语义与整次查询预算。** 当前多个适配器在 2xx 后直接取消 command 响应体，读请求主要限制单次运输。官方文档说明 200 可能包含后续异常，断开 HTTP 也不保证查询停止。补完整响应核验、服务端 SELECT 预算和请求累计预算，超限明确失败，不能返还“部分成功”的正常统计。
3. **P1 验证 TEMP 桥表 ANALYZE。** 044、047、048 暂存表已经有索引和有界填充，但源码未见填充后的 ANALYZE。PG 临时表不会由 autovacuum 分析。可在 hydrate 完成后、复杂 JOIN 前按阈值分析一次，用真实执行计划验证；不修改 hash、签名、归属或删除隔离。
4. **P1 把 SEO 建议改为可判定的发现与定点复测。** 扫描和建议复测已经存在。新增价值是把阻断、建议、未知分开，保留响应证据和扫描边界；“缺 canonical/OG/h1”不能统一等同索引错误。“已复测”与“问题已修复”“收益已证明”必须分开。
5. **P1 给 GSC 导入补覆盖契约。** 现有 25,000 行分页已经实现，但 Google 明确不保证返回全部明细。保留窗口、维度、聚合方式、时区、导入状态与展示截断；站点总量、页面表现、查询词明细各用对应来源，不能把查询词明细的和冒充完整页面或站点总量。

建议实施顺序：先完成正在进行的 100 行有界批量与可信无关批次跳过优化，再用结论 1 对照；结论 2 的异常路径测试可独立先做；结论 3 以独立小补丁验证；结论 4、5 可与 UI 打磨并行。

## 已有能力与本轮增量

| 领域 | 已核查的现状 | 本轮不重复做 | 本轮值得补的部分 |
|---|---|---|---|
| 事实读取 | PG 控制元数据、CH 权威正文、逐批 checksum/HMAC、归属与墓碑检查、事务本地 TEMP 桥 | 不重写权威模式，不退回 PG 正文，不将全闭包认证改成抽样 | 可观测性、查询预算、TEMP 统计信息 |
| 聚合与增量 | 已有小时/日汇总、run 选择、session/carry 与发布水位；嵌套读取能复用当前事务准备结果 | 不再泛泛建议“增加预聚合”“加批量处理” | 定位当前桥接、验证与最终聚合的真实成本 |
| AI 问数 | 只读 DSL；站点/时间范围限制；最多三轮；每轮授权；epoch/generation 校验；图表来自实际 tool；截断组数提示 | 不把已有工具证据、只读权限或多轮能力列作新功能 | 模型解释与已验证事实的逐项关联，置信度维度与复测结果解释 |
| SEO | BaizeBot；robots 约束；同源链接；最多 30 页；请求间约 2 秒；本地真实 HTTP 扫描和新扫描复测测试 | 不重建扫描器，不宣称缺少复测 | 更准确的规则严重度、HTTP 头证据、明确未知、相同目标定点复测 |
| GSC | OAuth 只读范围；每页 25k；窗口导入事务；最多 100 万明细保护；UI/API 提醒延迟与聚合局限 | 不再建议“首次添加分页”或必须新建真实 Google 账号 | 来源与窗口元数据、独立总量、分页/截断状态、按日处理与失败原子性 |
| 无账号数据来源 | 自定义 CSV 模板、映射、校验、摘要与独立手工搜索导入已经存在 | 不把手工 CSV 当未实现，不冒称原生 GSC 导出任意格式都支持 | 给手工资料同样标注提供者、范围、时区与未知完整性 |

源码依据：[事实桥](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/fact-store-source.ts)、[剩余事实桥](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/remaining-fact-source.ts)、[缓存桥](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/cache-store-source.ts)、[AI 证据执行](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/ai-evidence.ts)、[AI 证据界面](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/web/AiEvidenceView.tsx)、[外部任务与扫描](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/external-worker.ts)、[手工导入解析](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/manual-search-parser.ts)。

## 1 性能基准应回答什么

### 已有 5000 事件证据的准确解释

直接核对保存的 JSON 后，有一处需要避免沿用旧的中途数字：4650 是采集末尾附近的 HTTP 样本，最后两个 HTTP 样本已到 4900，但仍不完整。

| 项目 | 实际记录 |
|---|---|
| 冻结应用源码 | `7fbb5612cee6121df23425ff14274316e43a4bca` |
| 模式 | 1 站，strict CH 权威正文，真实后台 worker；没有手动推进 worker |
| 接收 | 5000 个负载事件，另有 1 个 bootstrap |
| 采集加串行查询时间 | 3,044,955.061 ms，约 50.749 分钟 |
| 采集末尾样本 | 18:04:48 UTC：PV 4650，coverage 0，generation 102 / processed 95 |
| 最后 HTTP 样本 | 18:07:40 UTC：PV 4900，coverage 0，generation 102 / processed 100 |
| 发布水位延迟 | p95 380.906 秒，max 473.096 秒 |
| 接收批次延迟 p95 | 19.908 秒 |
| 查询延迟 p95 | 64.701 秒 |
| Node RSS 采样峰值 | 623,210,496 bytes；不包含 PG、CH、Redis，也不是清理期间的峰值 |
| 终态 | failed，后台未在既定 drain 条件内完成 |
| 独立清理前观察 | outbox done 4901 / queued 100；包含 bootstrap |
| 未执行到的最终断言 | canonical 5001 PV/精确 UV、9 张 PG 正文表为零、最终 coverage 1、outbox 全完成 |

来源：[原始运行 JSON](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/docs/test-evidence/main-7fbb561-strict-5000.json)、[终态与清理核查](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/docs/test-evidence/main-7fbb561-strict-5000-handoff.json)。

脚本每轮先发送 50 个事件，再 await 真实 stats，之后才尝试补足一秒。查询慢会降低下轮到达率。120 秒 drain 的循环内部同样 await 查询，单次调用可能跨过截止时间。因此应称为“持续采集与查询的串行回归负载”，不能叫固定 50 events/s 的压测，也不能把 5000/50.749 分钟解释成系统吞吐上限。脚本与早期报告本身已有边界说明，应保留，不覆盖历史失败。[基准脚本](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/scripts/continuous-pipeline-benchmark.ts#L69-L86)、[历史持续验证说明](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/docs/validation-continuous-scale.md)。

### 小范围实现

保持原脚本用于优化前后同条件回归，新增独立场景，不偷偷改变旧场景定义：

- **采集任务**按预定时间调度，和查询采样任务独立。记录计划到达、实际发送、202 接收和失败/排队数量。限制并发与队列长度；超过能力时明确报告未发送/延迟，不能无限堆内存或悄悄降速。
- **查询任务**采用固定的低频采样和小并发，分别测试无查询、正常仪表盘并发、有意施压；避免让测量查询本身独占 worker 所需资源。
- **轻量进度观察**记录 generation、processedGeneration、outbox backlog、最老未处理年龄与水位；HTTP 验证仍不可省略，但不必为每 50 事件重复全量重读。
- **分阶段计时**最少包括 pool acquire、partition/site lock、清单/成员读取、CH 请求次数和返回字节、hash/HMAC/归属检查、TEMP 填充、ANALYZE、聚合 SQL、JSON 序列化。只记录阶段、数量、耗时与非敏感关联 ID，不记录访问者身份、正文或凭据。
- **终态**分开记录 `drain deadline reached` 与最终断言是否实际执行。最后一次 stats 必须在观察到排空后重新请求；禁止复用排空前样本。
- **环境**固定版本、runner digest、CPU/内存限制与其他负载。资源峰值分开列 Node/PG/CH/Redis；未隔离时继续明确写共享宿主。

可用 CH `system.query_log` 的查询耗时、读写字节与内存字段，以及 PG 执行计划定位数据库成本；可用的字段以所部署版本为准。`pg_stat_statements` 若已启用，可读其聚合统计；本轮不要为调研擅自安装扩展或重启数据库。[CH query_log](https://clickhouse.com/docs/operations/system-tables/query_log)、[PG EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html)、[pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)。

### 验收与边界

先在相同 5000 事件、同版本依赖和同负载下对照，再扩大到多站。每次仍检查精确 PV/UV、会话与跨界 carry、最终水位、outbox、正文权威与删除后的拒绝读取。单独测“另一个站点仍能发布”的公平性，不能仅看总吞吐。只有在这些断言通过后，延迟改善才有意义。

本报告不预设“快十倍”或“满足 1C2G”。分阶段计时是为了决定下一刀改哪里；如果大部分时间在认证运输，ANALYZE 只能改善剩余部分。

## 2 CH HTTP 完成语义和累计资源预算

### 仓库差距

`canonical-clickhouse.ts`、`fact-store.ts`、旧 `clickhouse-store.ts` 的 request 路径都检查 `response.ok`；command 随后取消响应体。读取已有 16 MiB/128 MiB 等单次上限、100/1000 行批次上限及 15/30 秒运输超时。这些保护有价值，但单个 HTTP 的预算不能限制整次 stats 的批次数、PG 暂存成本或总持锁时间。

ClickHouse 官方明确：HTTP 200 不保证查询成功，异常可能在响应流后段出现；HTTP 连接丢失也不自动停止请求。`wait_end_of_query=1` 能改善响应缓冲，但仍不能替代对响应体的完整处理。[HTTP 接口与异常说明](https://clickhouse.com/docs/interfaces/http)。这意味着当前模式值得补异常路径测试；**这并不证明已发生未认证数据发布**，现有上传后读取、checksum 与发布 fence 仍是独立防线。

### 小范围实现

1. 为无数据返回的 command 增加有界的完整响应消费，读至正常 EOF，验证允许的成功体；遇到 2xx 异常体、中途断流或超限都视为失败。SELECT 保留完整格式解析、行数、hash 与签名验证。不得简单 grep 任意正文中的 `Code:` 后宣告异常，避免数据内容被误判。
2. 为每个请求生成非秘密 `query_id` 便于追踪。优先先为 SELECT 设置部署版本支持的 `max_execution_time`、`max_memory_usage`、必要的读/结果字节限制，明确所有 overflow 使用 `throw`；不得使用 `break` 或 `group_by_overflow_mode=any` 得到貌似正常的部分统计。
3. 给一次对外查询统一累计期限、认证行数/字节和 CH 次数预算，并在批次边界检查。超限返回有类型的“查询范围/资源超限”，提示缩小范围或重试，不能返回 0、coverage=1 或偷偷走弱校验来源。
4. PG 的交互读取事务按剩余请求时间设置局部 statement/lock timeout，发生错误后 rollback 并释放连接。不要一刀切修改全局配置；worker、备份、物理删除的预算与交互查询分开。`statement_timeout` 是单条语句限制，本身也不是整个请求的累计预算。
5. 对写入超时保留“结果未知”的语义，走原有 attempt/receipt/fence 恢复核对。不得把客户端超时解释为服务端未写入，然后生成新身份无条件重试。物理删除仍需现有同步确认与最终 count 校验。

官方依据：[CH 查询复杂度限制](https://clickhouse.com/docs/operations/settings/query-complexity)、[PG 17 客户端超时设置](https://www.postgresql.org/docs/17/runtime-config-client.html)。CH 预算可能在 part 处理后才检查，因此不是精确到每行的硬内存墙；还需要宿主/容器资源预算和有界应用并发。

### 测试

- 模拟 200+异常体、合法头后断流、延迟到 EOF、超过响应字节上限；所有路径不发布新指针、不归还半个成功结果。
- 真实部署版本执行会在开始输出后报错的查询，验证包装层确实拒绝。
- N 个小批次分别没超单批限制，但累计超请求限制：应确定地中止、rollback、释放临时表和连接。
- 慢查询与正常站点并发；确认正常读取/采集不会因无限请求队列被饿死。
- timeout 后验证原 attempt 已写入/未写入/部分失败三个分支；重复请求不重复计数。
- 错误日志只保留错误分类和 query_id，不包含 CH 密码、私有事件、访问者 ID 或完整 SQL 参数。

### 版本提醒

仓库 Compose 固定 CH `25.8-alpine` 镜像摘要、PG 17。2026 年的最新文档可能介绍 25.11/26.2 才加入的 header 字段或异步去重行为，不能直接当作 25.8 的能力。此处建议首先在该固定镜像验证，不以升级数据库掩盖应用问题。[CH 部署文件](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/docker-compose.clickhouse.yml)、[基础部署文件](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/docker-compose.yml)。

## 3 TEMP 桥表统计信息是安全的性能实验

### 为什么值得测

044、047、048 桥会建立 `ON COMMIT DROP` 临时表，复制约束/索引，再将认证后的正文填入供关系查询使用。已读的三个 prepare 模块未见 ANALYZE。PG 17 明确临时表不会由 autovacuum 分析，复杂查询前应由当前会话在填充后分析。[PG 17 CREATE TABLE](https://www.postgresql.org/docs/17/sql-createtable.html#SQL-CREATETABLE-TEMPORARY)。

这是源码与官方机制结合得到的**待验证性能假设**：缺少行数和分布统计可能造成不合适的 JOIN、扫描或排序计划。尚不能证明它是 64.7 秒 p95 的主要来源。

### 小范围实现与测试

- 完成全部认证填充后，在第一次复杂读取前，对达到阈值的 TEMP 表 ANALYZE 一次；不能每 100 行反复分析。
- 保留当前生成且正确引用的表名，不允许用户输入成为标识符。优先覆盖 effects、vitals、sessions、numeric/member 等实际参加复杂 JOIN 的关系；空表/很小表可跳过。
- 对相同数据分别保存前后 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`，比较估计/实际行数、nested-loop 次数、临时磁盘溢出、聚合阶段耗时和总耗时。ANALYZE 本身耗时也算进总数，不能只报之后的 SQL。
- 场景至少包括小数据、5000 事件、高维基数、偏斜来源分布、跨日 session、删除/迟到重算后的数据。结果 JSON 必须精确相等，隐私受限 UV 等仍保留 null/unsupported。
- 重复查询与连接复用后，检查统计信息没有跨站泄漏，临时表在 commit/rollback 后消失；维护当前同 client、同事务安全边界。
- 只有总耗时与资源占用有重复可见改善才保留该策略；没有改善就撤掉这个性能开关，不扩大成数据库重构。

PG 文档提醒 EXPLAIN ANALYZE 会实际执行语句且测量有开销，因此在隔离测试数据执行，不能在生产对未知修改语句随意试验。[PG 17 EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html)。

## 4 SEO 发现和 AI 建议应表达证据强度

### 当前已有基础

`inspectHTML` 已检查 title、description、h1、alt、canonical、OG、viewport 与 HTTP 错误；扫描界面已经提醒未扫描页面不等于健康，也不能替代搜索引擎索引报告。建议已绑定 evidenceId、自动候选默认 low confidence、有明确非因果优先级说明；SEO 复测会重新授权、重新抓取并保留旧证据。真实本地 HTTP 测试已覆盖 robots、节流、同源、问题修复后再扫描与旧证据不变。[扫描界面](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/web/SeoScans.tsx)、[建议与复测实现](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/external.ts#L144-L163)、[本地运行测试](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/tests/integration/seo-local-runtime.test.ts)。

增量应针对判定质量，而非添加更多看起来先进的 SEO 分数。

### 规则严重度要对应事实

- **HTTP 4xx/5xx、发现 noindex、X-Robots-Tag 限制**：保存实际状态/指令，说明可能影响抓取或索引；noindex 也可能是站长有意设置，不能擅自建议全部移除。
- **robots 不允许 BaizeBot**：结果是“本工具未抓取”，不是“页面健康”，也不能自动等同 Googlebot 被禁止。Googlebot 的规则解释应作为独立分析；不冒充 Googlebot 绕过限制。
- **canonical 缺失**：可以建议检查重复版本或偏好 URL，但不是索引阻断。Google 官方明确 canonical 偏好声明并非必需；还支持 HTTP Link 头，不能只查 HTML 标签后认定完全缺失。[canonical 指引](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)。
- **description、h1、OG 缺失**：视作内容呈现、可读性或分享/标题线索建议。Google 可从页面正文生成摘要，也使用多种标题来源；不能声称这些单一缺失必然导致排名下降。[摘要说明](https://developers.google.com/search/docs/appearance/snippet)、[标题链接说明](https://developers.google.com/search/docs/appearance/title-link)。
- **noindex 与 robots 组合**：若 Google 无法抓取，未必能读到 noindex；呈现限制本身及这个条件，不把两个规则简化成一个“SEO 错误”。[robots meta 与响应头](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)。

### 最小数据契约

给新扫描加 versioned 结构，不强制迁移重写历史证据：

- 发现：稳定 ruleId、URL、类别、严重度、实际观察值、检查时间、支持该规则的官方链接、`pass / fail / unknown / not-applicable`。
- 范围：本次抓取页数、最多 30 页、同源且不跟踪 query-string 链接、原始 HTML 未执行 JS、robots 跳过数、未取回数、达到预算/正常结束的原因。
- 证据：保留必要且有界的标签/响应头摘要与内容摘要，不默认保存/发送完整 HTML 给模型。扫描器版本与 ruleId 足以重现判定。
- 展示：“此页面返回了 noindex”是可直接核对的观察；“移除后可能恢复被该规则阻止的索引资格”是带前提的建议；“会涨 20% 流量”没有这里的证据支持。

不建议现在新增浏览器渲染爬虫。先明确原始 HTML 的能力边界；JS 构建的标题/canonical 未在源响应出现时可提示需人工或受支持工具核查，不能装作已检查渲染 DOM。

### 复测应核对同一问题

现在的 fresh crawl 是必要基础，但从首页重新广度遍历，不保证再次抓到原问题 URL。后续应在原授权域名内，按原 findingId 对目标 URL 定点复测，继续遵守 robots、同源、2 秒间隔与页数预算。

复测结果分为 `fixed / persists / unknown`：页面因为 robots、超时、预算、导航变化而未被抓到时，只能 unknown，不能因为新扫描没有这条问题就算修复。保存 before/after scanId、ruleId、观察值、时间与扫描器版本。现有 lifecycle 的 `verified` 可以兼容，但 UI 应明确它表示“完成复测”还是“该规则已确认修复”；不能把它变成排名收益认证。

### AI 置信度与模型解释

当前图表有可靠工具来源，答案 prose 仍是模型解释，界面也已经提醒可能出错。下一步可低成本拆开四项，避免一个 high/medium/low 混合不同含义：

1. 观察可信度：是否来自实际扫描或服务端工具；
2. 数据范围：时间/筛选、完整或截断、样本量与缺失；
3. 新鲜度：checkedAt、水位与 epoch；
4. 影响依据：确定的技术条件、待验证假设，或没有因果证据。

若要加强回答可核对性，先为“观测卡片”提供结构化 evidenceRef 与 metric/value，数值由服务器从已验证 tool 复制；模型只写解释和候选原因。不要靠正则从任意自然语言抽数字充当事实校验，也不要把 model 自报的高置信作为质量证明。现有 priorityScore 是受影响数量×观测严重度的代理，继续明确不是预计收益。

Google 对 AI Overviews/AI Mode 的官方要求强调基础 SEO 与索引/摘要资格；满足要求不保证抓取、索引、展示或排名，也不要求新增所谓 AI 专用文本文件或特殊 schema。产品应提供技术诊断和可复测建议，不做“AI 排名保证”。[Google AI features](https://developers.google.com/search/docs/appearance/ai-features)。

### 测试

- 无 canonical 但内容正常；只有 HTTP Link canonical；HTML 与 header canonical 冲突；相对 canonical；多个 canonical。
- title/description/OG/h1 分别缺失；验证分类/措辞，不将全部显示为索引阻断。
- meta robots 与 X-Robots-Tag、大小写、多个指令、BaizeBot 和 Googlebot 不同分组。
- 第 31 页、robots 阻断页、JS-only 元数据、超时页显示 unknown；这些页面不能让复测转为 fixed。
- 相同 URL 修复/未修复、旧证据不变、权限撤销、epoch 失效、跨域目标拒绝。
- 模型给出不存在的 evidenceRef、夸大效果、错误数字：观测卡片不接受；解释不能获得“事实已验证”的标签。
- 未请求真实账号时，全部用本地 HTTP fixture、保存的提供商响应或模拟模型完成；“本地测试通过”与“真实 Google/模型账号验证”分列。

## 5 GSC 导入和展示必须承认上游缺失

### 仓库具体风险点

`gscRows` 已按 25k 页读取 `date, query, page`，直到短页或本地 100 万行上限。`GET /gsc` 只返回点击量前 1000 行，未见配套 total/hasMore 展示元数据。`/seo/conversions` 当前将这些 query+page 明细按 page 求和后与站内数据对照。该来源适合解释“导入明细中的点击”，不宜无条件呈现为该页全部 GSC 点击。[外部数据实现](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/external.ts#L62-L71)。

Google 官方规定 Search Analytics 请求日期采用 PT，API 返回的是受内部限制的靠前行，不保证全部明细；`dataState` 默认 final。完整分页只表明已遍历这次 API 能返回的行。官方还说明 page/query 细分可能丢失数据，建议按日请求，并区分总量查询与细分查询。[Query 参考](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)、[获取性能数据与 50K/日/搜索类型限制](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data)。

### 分两步实现

**第一步不增加外部调用：修正来源与元数据。**

- 保存本次 property、start/end、`type`、dimensions、aggregationType、dataState、提供商日期口径 `America/Los_Angeles`、请求/完成时间、页数与返回行数。
- 区分 `providerDetailCompleteness: not-guaranteed`、`localImportStatus: complete/failed`、`displayTruncated`。本地导入成功不等于上游全量；也不要凭空给一个百分比 coverage。
- `/gsc` 显式返回 limit、returnedRows、hasMore；稳定排序加入 day/query/page 作为并列点击的 tie-breaker。要分页时，游标应绑定导入版本/筛选；数据重导入使游标失效，不能将新旧窗口拼成一页。
- 搜索转化对照在仍使用 query+page 来源时写“查询词明细已报告点击”，不写完整自然搜索点击；保留站内站点时区与 GSC PT 日期不可直接对齐的说明。
- 固定“延迟 2–3 天”保留为通常情况，不作为每次数据已最终齐全的保证；展示实际最新提供者日期。

**第二步在已有授权连接和任务范围内才扩充导入：**

- 分开每日站点总量、页面表现与查询词明细。总量不携带 page/query 维度；页面表从 page 粒度来源读取；查询词表继续保留细分局限。各来源保留独立 request signature，禁止混加不同 aggregationType。
- 使用有界日期范围、按日分页、失败重试与 staged window。一个日窗口所有页成功并验证后再原子替换；任一页失败不破坏旧的完整快照。
- 每页在有界事务内批量入库，避免当前最多 100 万行先堆进 Node 数组再逐行 SQL；本地 stage 不是发布事实，发布前仍需窗口/连接配置一致性确认。
- 429/5xx 重试有次数、退避与抖动上限；重试不能继续 append 同页造成重复。连续重导入同日应幂等；空结果明确“该请求返回空”而不是保证网站当天没有搜索活动。

不需要新建 OAuth 或实测真实账号才能实现契约与 fixtures。手工 CSV 沿用现有独立数据集，提供者/时区/完整性不清楚时标 unknown，不把它提升为官方 GSC 总量。

### 测试

- 25,000、25,001、50,000 行边界；空页；上游返回短页但仍不保证全量。
- 分页第二页失败、429 后重试、连接配置被修改、重复同日导入、多个并发导入同窗口：不得清掉旧完整快照或混版。
- 非请求日、错误 keys 长度、NaN/负数、无效 URL、同页重复键：按定义拒绝或确定去重，不能 silently 污染统计。
- top1000 并列点击稳定翻页、筛选变化及重导入后的游标失效。
- PT 跨 DST 日与 UTC/亚洲站点时区，UI 说明一致；不能把两种自然日当相同时间窗算精确转化率。
- query 明细之和小于无 query 总量：这是有效 fixture，UI 不自动“补齐”、不归因丢失给 Baize、更不把差值分摊给访客。

URL Inspection 若以后接入，只能展示 Google 保存的索引版本状态；官方 API 不能测试实时 URL 的可索引性。它不是本轮新 OAuth 的理由，也不能替代当前抓取证据。[URL Inspection API](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)。

## 从成熟工具借鉴什么

| 官方来源 | 有用的做法 | 对白泽的落地边界 |
|---|---|---|
| [Plausible WriteBuffer 源码](https://github.com/plausible/analytics/blob/master/lib/plausible/ingestion/write_buffer.ex) | 按累计字节与定时条件 flush，减少零碎写入 | 借鉴字节/时间预算与观测方式；不复制纯内存确认语义，不移除白泽耐久队列和认证发布 |
| [Matomo archiving](https://developer.matomo.org/guides/archiving) | 后台预计算和失效后重算，避免用户每次等待报告生成 | 白泽已有汇总/发布，因此重点测读取认证桥成本；不能把普通 cache 当作跨 epoch 安全证明 |
| [Plausible Stats API](https://plausible.io/docs/stats-api) | 显式 pagination、total_rows 与不能纳入导入数据时的说明 | 借鉴返回元数据，不照搬其启发式精度或云端商业 API 可用性 |
| [Umami 网站统计 API](https://v2.umami.is/docs/api/website-stats-api) | 时间粒度与范围约束、明细 limit | 白泽可限制可视化点数/维度组数，但必须声明返回粒度和截断；不能静默更换精度 |

CH 官方建议通用同步写入使用更大批次，减少 part 和合并开销；推荐范围不等于应把白泽安全边界内的 100 行事实批次直接扩成 100k。应先测 `parts`、合并负载和每次发布的 insert 数，证明确实受碎片写入影响再做独立运输实验。[CH bulk inserts](https://clickhouse.com/docs/optimize/bulk-inserts)。

若将来尝试 async insert，应保持 `wait_for_async_insert=1`，并维持当前上传后认证与 PG fenced publication。`wait_for_async_insert=0` 会提前确认缓冲、掩盖 flush 错误，不符合本项目完整性目标；也不能把最新文档中的异步去重承诺套到固定 25.8。[CH async inserts](https://clickhouse.com/docs/optimize/asynchronous-inserts)。

## 本轮不应采用的捷径

- 不关闭 hash/HMAC、不采样校验、不跳过删除墓碑，不仅凭时间交集排除跨界 session/carry。
- 不把 `LIMIT` 放到事实闭包认证之前，然后对残余数据宣称精确总量。结果分页只能限制展示，不能自动消除认证整个可信范围的成本。
- 不引入跨请求“已经验证”缓存来绕过 epoch、generation、发布来源和删除检查。
- 不直接换近似 UV、近似 DISTINCT 或静默 t-digest 改口径；现有近似指标继续使用现有显式方法标签。
- 不让 CH 超限返回 break/any 部分结果，不用 fire-and-forget 换取漂亮接收延迟。
- 不因本轮研究升级数据库大版本、引入 Kafka/新任务系统或重新设计事实权威。
- 不把本地抓取、GSC 明细、AI 候选原因包装成已证明的索引/排名/转化收益。
- 不连接新真实账号、不扩大 OAuth 范围、不接付费 SERP 服务来完成这些本地改进与测试。

## 交付检查表

| 交付 | 最小成功条件 |
|---|---|
| 性能证据 | 固定源码与环境；原串行回归保留；独立到达率场景记录真实发送与积压；所有正确性终态明确 |
| CH 运输 | 200 异常体、断流、累计超限均 fail closed；写入未知结果按原协议核对 |
| TEMP 分析 | 有真实前后计划与总耗时；精确输出一致；失败/小样本不强行保留优化 |
| SEO v2 | 规则证据、范围与 unknown 可见；同问题定点复测；历史不可变；不保证排名 |
| GSC 契约 | 上游完整性、本地完整性、展示截断分开；不同聚合口径独立；失败不替换旧快照 |

本文最确定的新增结论是规则/数据口径边界与 HTTP 完成语义；TEMP ANALYZE 和更大运输批次的性能收益仍须用新证据验证。正在实施的有界归属批量优化应单独归档其改动与前后结果，不能被这份研究预先算作通过。
