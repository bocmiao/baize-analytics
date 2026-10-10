# A2 独立权威适配器边界

新增 `src/server/canonical-clickhouse.ts` 与迁移032；默认authority为postgres，不启用切换，不裁剪PG。它与prefer_clickhouse镜像模式、028历史snapshot命名空间分开。

`publishBatch(client, siteId, batchId, epoch, [{event, acceptedHash}])` 仅接受已由PG event_keys裁决的事件。批次最大1000、正文稳定SHA256、随机CH attempt写入后回读计数与正文checksum；同事务发布PG manifest/member。调用者必须持共同站点采集/删除gate与PG事务，仅在最终COMMIT成功后才能202。方法本身返回不等于HTTP已接受。PG提交失败的CH孤儿永不出现在exact published attempt白名单，同批重试checksum冲突拒绝；跨批相同event_id返回已发布错误供上层映射重复响应，不重复统计。

`captureReadState(client, siteId)` 提供source/coverage/epoch/deletionEpoch/rawPruned/watermark。`streamCommitted(client,siteId,{from,to,snapshotEpoch})` 需同RR事务及站点gate，PG游标每次读取一个manifest，CH每批最多1000，验证正文与PG member checksum。无generation<=可见性规则，无CH失败时空PG假coverage fallback；调用方须传播unavailable。事件跨批排序由031磁盘排序负责。

`deleteSegments(client,siteId,[{visitorId,from,to}],journalFsyncBarrier)` 先锁authority再持久日志回调，精确visitor半开时间段CH synchronous mutation，确认count0才返回physicalAck；PG member同事务删除并提升deletion_epoch。不得以eraseSite替代。调用者须先登记tombstone并持共同站点gate；同步CH删除成功而PG事务失败时应可靠重放，不能确认最终删除完成。独立日志与恢复目标CH namespace/备份scope尚未接线。

真实独立PG schema与CH随机site三项专项已测（3通过/0跳过）：CH写成功PG rollback孤儿不可见，之后发布只读取一次，同批冲突拒绝；fsync回调失败拒绝ACK，同visitor身份A时间段物理删除保留B；错误epoch拒绝及故障注入CH HTTP503明确unavailable，无成功空PGfallback。该结果只证明独立适配器，不证明collect、event-store、worker、导出、回放、身份改写、历史存储或备份恢复完整权威迁移。未构建镜像、未跑全量或百万测试。

后续阶段：`event-store.ts` 已接独立registry，authority优先于client/prefer；同RR读取精确白名单后逐批写PG临时表，SQL按事件时间全局排序、同一SQL过滤bot/path/event/visitor/时间，并过滤PG tombstone与identity半开时间段。API保留原retention/privacy边界及limit+1，未限定数组读取最多100001/128MiB；CH单批也限制1000行/128MiB。owned API读末尾重新确认authority epoch/deletionEpoch；worker外部client须在publication阶段确认相同authority fence，不能将canonical epoch直接等同aggregation epoch。

新增 `canonical-migration.ts` shadow小批反连接已发布member，迟到旧时间事件不会被持久游标遗漏。activation与pruning现均明确INTEGRATION_NOT_READY拒绝，未提供启用按钮；裁剪代码仍被集成闸封锁，尚未实测真实裁剪，不可认为完成迁移。真实PG/CH小专项扩为6项通过：另覆盖authority优先同client共通读/全局排序/filter/limit、shadow迟到旧事件及禁activation/prune。类型与owned lint通过；全仓/新Docker未运行。

零事件捕获接口为 `captureEventReadState(pool,siteId,{client})`，同RR client返回authority/canonicalEpoch/deletionEpoch；worker须在源开始捕获，不能只依赖第一个非空batch。EventReadResult同样携带这些字段，031负责人负责将它们持久化并在fresh publication SQL验证。本适配不修改031文件。
