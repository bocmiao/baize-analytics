# 精确关系化统计（033）

这是 031 有界来源/会话 reducer 的后续实现，不代表 ClickHouse 权威迁移或 P2 全部完成。PostgreSQL 仍保存权威原始事件（或处于单独受控的 canonical 迁移阶段）与精确派生事实。

`analytics_effect_facts` 保存 reducer 产生的事件时间贡献和精确成员关系；每条贡献只有一份，不复制小时/日成员。`analytics_vital_samples` 保存脱敏事件对应的数值样本。两种写缓冲最多 200 行。查询在 PostgreSQL 中执行 `COUNT(DISTINCT visitor_id)`，没有 HLL 替代、跨桶 UV 求和或把标识集合传给 Node。普通兼容 rollup 不再序列化成员数组，但保留漏斗步数。

最新发布 run 的 `retained_from` 之后由该 run 完整负责，包括不完整边界小时。此前的完整小时由 `analytics_relational_buckets` 引用旧 run，不能因为原始明细过期或新空 run 发布而删除。没有新关系格式的旧归档成员在 SQL 内展开并与新关系精确联合。旧档无法提供筛选或非整点区间的完整证据时明确不可用。缺失 backing 返回 503，不返回 UV=0。

查询上限是 10,000 个输出分组、成员/AI 分组 8 MiB、数值和兼容小时输出 16 MiB；超过上限返回 413。数值 reduction 与原样本分位使用游标，分位继续采用加权 centroid Type-7 口径及近似状态标识。合法高维输出仍可能达到这些限制；这不是百万高基数性能验收。来源全保留期 capture 和长会话 spill 保持 031 的 correctness baseline，dirty 差分及跨保留期 session carry 尚未完成。

删除必须在独立 journal 持久化后，由同一个持有分区/站点门的 client 调用 `invalidateFactSegments`。完整访客删除物理擦除贡献和对应样本，用剩余贡献重算小时，保留其他访客唯一归档成员。身份时间段删除可能改变整个会话；已过期原始时序不能由 reduced facts 唯一还原，因此涉及会话的小时标为不可用，其他贡献保留。恢复已核验备份并重放最新完整 journal 后，使用 `rebasePublishedFactEpoch`，不能整站擦掉唯一归档 backing。具体备份、history store 及 hooks 的闭环由相应模块集成并独立验收。

AI 的 `queryAiPublishedSeries` 接受同一 captured client，仅返回 aggregate。转化率按所选会话开始窗口和完成窗口，将任意目标完成的 session 精确去重；多个目标不能重复计数。返回分子、分母和明确语义。旧档缺少会话 cohort backing 时不可推断转化率。

真实 PostgreSQL 专项记录：`/tmp/baize-033-fact-delete.json` 一项通过，覆盖 max=1、跨日精确 UV、新旧归档联合、原始物理到期后空 run 发布、精确分钟筛选、多币种、25:1 不等样本分位、多个目标同会话转化率以及删除 A 后归档 B 保留。该专项是小型正确性测试；持续真实采集的 RSS/延迟、全应用回归、ClickHouse 权威路径、history 独立恢复和 Docker 验收尚不能据此宣布通过。新增夹具初次缺 generation、原型字面量和漏斗步数清理导致的失败 JSON 均保留在 `/tmp/baize-033-*`，修复后重跑，不把初次失败隐藏成全绿。
