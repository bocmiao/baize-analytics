# 同参数性能比较记录模板（未填收益）

当前仅模板，没有本轮5000实测结果。既有失败文件保留，不覆盖或用300结果外推5000。

| 记录字段 | 基线 | 候选 |
|---|---|---|
| 完整源码SHA与snapshot hash | 待填 | 待填 |
| 样本300/5000，增量开关 | 待填 | 待填 |
| 源码绑定证据与锁文件 | 待填 | 待填 |
| 开始/结束UTC、串行闸 | 待填 | 待填 |
| intake accepted/rejected/unsent/delayed | 待填 | 待填 |
| 完整HTTP/SQL PV/UV会话与coverage对账 | 待填 | 待填 |
| dirty/backlog/attempts与drain结果 | 待填 | 待填 |
| 总子进程wall、Node RSS与子进程最大RSS | 待填 | 待填 |
| worker_facts_wall、coverage_witness_wall 累计/次数/最大 | 待填 | 待填 |
| full/delta/fallback计划及allowlist理由 | 待填 | 待填 |
| hydrated/producedEffectRows、reuse计数 | 待填 | 待填 |
| CH transport attempts/requests/decodedbytes分phase | 待填 | 待填 |
| EXIT码、首失败、清理与磁盘证据 | 待填 | 待填 |

固定控制：50事件/批，1秒/批，10秒查询，queue上限8，并发2，drain120秒、strict-clickhouse单站。300=6批；5000=100批，除批数之外同调度逻辑。比较必须同宿主/资源配置/应用参数，明确唯一源码及增量开关差异。

计时解释：外层进程wall是elapsed，阶段totalMs是多次调用的inclusive累计；coverage witness嵌在worker publication流程，不能与worker wall相加。CH phase只是同transport事件另一分组，不能与stage/adapter视图相加；并发累计时间不是CPU占比。缺事件明确未观测，不填零。只有同规模且最终精确对账通过的样本可讨论时间差，仍不称SLO或资源规格保证。
