# A3 权威正文备份与独立目标恢复（模块验收）

`backupCanonical(client,adapter,siteId,directory,sourceJournalDir)` 要求调用者持源RR事务和采集/删除共同site gate。输出目录0700、文件0600：events.ndjson是<=1000批的脱敏持久正文、PG已裁决acceptedHash及正文SHA；published.ndjson保存PG已发布manifest元数据；manifest.json保存两文件SHA、数量、源CHscope指纹、authority epoch和独立删除日志prefix证明。文件及目录fsync完成后才形成最终manifest；不写任何CH凭据、主密钥或keyring。

正文备份仍含业务事件，必须按私有敏感备份保护。数据库完整metadata（站点/角色/身份episode/审计/密钥版本等）仍须PG备份；主密钥独立保护。本模块不是完整应用安装恢复入口，也不是原生CH全集群备份。028历史snapshot可能在PG明细到期后成为唯一历史细节，须单独覆盖其namespace与manifest，不能声称全部CH可从PG重建。

`restoreCanonical(targetClient,targetAdapter,directory,currentJournalDir)` 要求独立目标PG事务且该站点没有canonical authority metadata；PG站点应由独立PG恢复预先提供。拒绝相同scope，验证备份SHA及当前独立日志水位、backup-prefix后才写目标CH。目标随机attempt逐批写入/回读正文SHA/PG发布manifest，最新日志按visitor或身份半开时间段同步物理删除、确认零残留，PG成员同事务协调，再读取已发布白名单对账。日志在过程中变化则失败，必须重试；缺失、合法空日志重置破坏backup-prefix或损坏归档均拒绝。

返回verified只说明目标正文/metadata校验，`commitRequired:true` 表示调用方必须PG提交；`trafficSwitched:false`，不自动开放查询或切生产流量。启动前还须协调最新独立日志重放、缓存/epoch失效和worker状态门闩。PG提交失败仅留下不可见目标CH孤儿，源不修改。既有mirror restore的eraseSite/回PG逻辑不得用于authority。

资源上限：正文单行1MiB、CH批<=1000/128MiB、独立日志64MiB且<=100000记录；超过明确拒绝，不假恢复。日志文件/水位应保持独立可靠保护，不能将重新创建二者视为恢复删除历史。当前模块尚无超大日志流式索引、加密归档、应用CLI/安装器接线或跨主机灾备验收。

真实PG/CH专项使用当前CH同endpoint下随机独立database，4项通过：同scope/缺日志拒绝、valid-reset-prefix拒绝、归档篡改拒绝、旧备份+最新A段删除恢复B并保持源两事件/原epoch。目标数据库和测试PGschemas已清理；这证明独立数据库scope，不等于另一机器灾备。与A2六项（含大写UUID归一及随机UUID稳定排序）合计10专项通过，非全应用CI或新Docker验收。
