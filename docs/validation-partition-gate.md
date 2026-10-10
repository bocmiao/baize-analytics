# 分区维护与持续采集锁协调

9cd7cd0干净快照的持续后台测试实际失败，PG 40P01明确指向collector sites→events与历史partition DROP events→sites的依赖锁逆序。保留全部失败和单站条件通过结果于validation-continuous-scale.md，不用顺序百万测试或随机retry替代修复。

修复使用按schema隔离的共享/独占事务协调锁，采集、删除、聚合、导出和告警在关系锁之前获取共享锁，partition建立/清理先获取独占锁；不同站点采集仍可并发。并发drop在取得独占锁后重新检查关系存在，避免重复清理旧catalog列表。重复读快照先在事务外取得session共享锁，再建立事务共享锁后释放session锁，防等待DDL期间提前固定快照造成迁移行不可见。

本批仅将HEAD应用加锁修复导出到独立索引快照执行，未纳入其他在制功能：`npm run lint`、`npm run typecheck`、`npm run build`全部EXIT0。构建最初误在仅存patch文件的/tmp/baize-gate-index目录运行，因没有package.json ENOENT/EXIT254；已纠正到实际完整索引快照，未调整构建检查。

真实PG/CH/Redis6文件59回归测试PASS（analytics、partitions、restore-rebuild、governance、clickhouse、clickhouse-app）；新增真实原生HTTP/PG并发4项PASS，总计63项、0失败/0跳过。并发排序观察pg_locks实际等待，覆盖DDL持锁后HTTP202、采集持站点/FK锁后实际drop等待、并发双drop，以及DDL等候期间默认分区事件/boolean EAV搬移后RR完整读取。证据partition-gate-regressions.json与partition-gate-http-races.json。未以本批63项代替全应用180项或新增功能最终全集。

本修复后须在对应不可变提交上重跑单站10k与4站20k后台混合采集查询，另保存结果。当前未预先标通过，不承诺实时SLO、1C2G或CH全迁移。新Docker覆盖此修复和后续迁移尚待最终本批冻结；远端托管CI因账号计费阻断未运行，不重跑或改计费。
