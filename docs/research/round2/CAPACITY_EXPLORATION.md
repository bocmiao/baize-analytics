# 有限容量探索：PG与strict短时场景

2026-10-10 UTC。实际source87e，应用src与d67相同。此为用户新授权的有限容量探索，不替代原固定5000高到达率基准，不改规格或既有FAIL。两模式执行均EXIT0；原始JSON、精确运行入口与摘要已归档：[摘要](../../test-evidence/main-87e1f64-capacity-summary.json)、[PG](../../test-evidence/main-87e1f64-capacity-postgres-1000.json)、[strict](../../test-evidence/main-87e1f64-capacity-strict-clickhouse-1000.json)、[无环境变量运行入口](../../test-evidence/main-87e1f64-capacity-runner.mts.safe.txt)。完整1300个Git blob前后摘要相同；总runner实际EXIT0。

场景：单站20批×50事件=1000，固定每5秒一批，真实查询每30秒；queue8/concurrency2/drain120秒均保持，使用生产后台聚合，不手动worker、不放宽规则。

| 模式 | 接受/未发送/延迟/查询失败 | intake秒 | drain秒 | finalHTTP秒 | accepted-window实际events/s | Node峰bytes |
|---|---|---:|---:|---:|---:|---:|
| 普通PG |1000/0/0/0，PASS|95.148497998|5.009186747|1.066685639|10.509887|516628480|
| strictCH |1000/0/0/0，PASS|95.26014083|23.078428722|4.817513149|10.497570|689278976|

PG实际4项完整性断言通过；strict实际6项完整性断言、九类PG正文为0及epoch/authority检查通过。两者source不变、应用/CH namespace/PG schema/临时目录4项cleanup全true。Node峰是应用+harness同进程，不含数据库/Redis服务，不是完整主机内存预算。

本结果证明该短时、约10events/s、1000事件、5秒批次场景下的可靠采集与排空，不证明全天持续日均百万、1C2G、所有站点分布、混合删除负载或生产SLO。PROJECT_SPEC275的PG日均百万目标仍待相应压力验证；937聚合延迟小于5分钟是P0目标，不能把一次排空少于120秒泛化为持续SLO。50events/s只是旧负载构造，不是新增规格门槛。

原d67固定5000总体FAIL（4700accepted/6unsent/38delayed，最终完整性通过但查询23.714秒）及661/1c等失败全部保留；短时降速探索不是修复或冲销原失败。候选12批读取未实现、可靠证明暂缓，无新055迁移。当前观察可用盘9.1GiB及3个原服务，非运行期minimum或资源隔离证明。Git push仍阻塞，不新凭据、不触发托管。
