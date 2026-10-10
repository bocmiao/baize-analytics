# 分区维护与连接池并发验收

历史实测：不可变9cd7cd0的持续后台采集，真实collector在第一次partition维护期间返回500；实际PostgreSQL日志为40P01，INSERT events与DROP旧events分区互相等待，安全证据保留在continuous-initial-deadlock.json、continuous-4site-20000.json、continuous-deadlock-oid-repro.json。初始OID映射确认sites/events依赖顺序。不能用随后单站retry成功抹去故障。

root引入schema级partition gate：采集/site/FK操作先shared，DDL先exclusive；RR snapshot先session共享gate，DDL完成后才BEGIN RR并移交xact gate，防止等DDL前固定快照导致default搬迁新行不可见。

实际命令 `TEST_DATABASE_URL=... npx vitest run tests/integration/partition-intake-race.test.ts`：4/4通过，独立真实PG schema与原生localhost HTTP；实际pg_locks屏障证明DDL持exclusive与关系锁时采集shared等待，释放后202；collector shared/site/FK持锁时生产drop等待，之后双方完成；两个drop拿同旧catalog后第二个重新检查缺失表；RR等DDL期间真实default事件与boolean EAV搬到新partition，读者之后完整看到新tableoid及全部行。root不可变912f675已包含该修复；持续单站10k成功，四站暴露调度公平性，见validation-continuous-scale.md，不能宣称4站低延迟SLO。

用户指出的G连接池自锁修复另行验收：runGovernance持c/shared gate时，queryStats必须沿用同c，包括保留明细和前期对比，不能向已满pool再借连接。可选beforeStats hook仅用于确定性排序，正常运行不传。

实际命令 `TEST_DATABASE_URL=... npx vitest run tests/integration/governance-pool-race.test.ts`：2/2通过。真实pool max10：G占1/shared gate、DDL占1等待exclusive、8原生HTTP采集占8等待shared，实测total10/idle0；第11条真实SELECT进入waitingCount1。在这个已满pool下放行G，正式queryStats计算报告PV1/UV1/sessions1、path过滤与coverage1，同事务存通知/更新schedule后释放，DDL和8采集全部202，额外SELECT完成，无advisory锁/等待残留。错误项beforeStats抛错，正式catch回滚next_at/job并release；DDL、8请求仍完成，无泄锁。没有mock queryStats或pool，没有对外消息：不完整SMTP fixture在创建transport前本地失败。

G旧代码自锁未在此专项实际跑成僵局，不能说已实测旧G故障；本证据证明修复后在用户所述锁/资源排列下的进展及错误释放。此G测试基于修复后的工作区，待集成负责人固化新不可变提交与持续四站再验收。owned lint/typecheck通过。
