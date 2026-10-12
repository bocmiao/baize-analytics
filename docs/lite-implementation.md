# Lite 实现与资源优化方案

标准版原基线为 `98f0437a36c9938e6ca79aa3a51ccd2d0037de57`；资源优化及完整运维验收版为 `023ea2613fb142c90f5e13c33943c533fa756402`，均已推送，旧交付与证据保留。Lite 同仓、同许可证、共用品牌、UI、tracker、采集协议和纯统计规则，采用单容器 TS 编译应用 + SQLite 本地持久卷；不要求 PostgreSQL、Redis 或 ClickHouse。本文记录实现与验收合同，容量只以绑定版本的实际测量为准。

## 已核实职责

| 标准职责 | 当前源码 | Lite 语义 |
|---|---|---|
| 账号/站点权限 | auth.ts, sites.ts, context.ts | 原子首位 owner、scrypt、cookie/session、逐站授权 |
| 采集/收据/原子任务 | collect.ts, db.ts, event-store.ts | 同事务事件+收据+任务，提交后 ACK |
| 会话、UV、分位数 | analytics.ts, daily-privacy-policy.ts, dimensions.ts | 抽出并共同调用纯规则，不加总 UV/p75 |
| 聚合任务/租约 | worker.ts, worker-facts.ts | 持久任务 claim token、epoch/generation fence |
| 导出/后台任务 | governance-worker.ts, external-worker.ts | 幂等效果、崩溃重投、预算与有限并发 |
| Redis | collect/bot-filter/request-rate-limit/analytics/deletion | 单实例有界限速；首版不启用统计缓存 |
| 删除/保留 | deletion.ts, worker.ts | 独立 durable journal 先行，事务删除、重放防复活 |
| 密钥/恢复 | keyring.ts, ops-stable-key.ts, backup/restore | 同步耐久密钥、独立保护密钥包、一致性快照 |

## 高层领域接口与持久性

内核使用 `node:sqlite`，启动记录实际 sqlite_version/source_id 并拒绝未核实 WAL 修复的旧引擎。当前宿主 3.53.3、镜像 3.53.4，官方修复见 https://sqlite.org/releaselog/3_51_3.html 与 https://sqlite.org/wal.html 。Node 版本本身不能证明 SQLite 安全。

数据库 owner 线程串行处理有界写队列；领域操作 `acceptBatch/deleteIdentity/publishAggregation/claimTask/completeTask/setupOwner/createSite` 各自规定事务边界，不对 HTTP 暴露通用 CRUD 或 SQL。`BEGIN IMMEDIATE`、WAL、foreign_keys=ON、synchronous=FULL；提交失败（包括磁盘满）明确拒绝，绝不提前 ACK。SQLite 数据在本地卷，拒绝网络文件系统。通过生命周期内的操作系统 flock 排他锁拒绝第二实例，不依赖仅 PID 文件。

统计在独立只读 worker 的短快照完成，查询预算/超时终止只读 worker，不阻塞 writer。事件时刻保留整数毫秒；范围半开，自然日及 DST 共用前端规则。会话按事件时间及稳定 ID，迟到数据重算；UV 使用成员集合，daily_salt 跨日 UV 明示不支持；分位数与标准版 weighted-centroid/type7 一致。超预算返回明确不可用，绝不静默采样或截断统计。

任务至少一次、效果幂等；持久 claim token、lease 到期重投、有限重试/死信；发布前验证站点 epoch/generation。批次和排队按数量/bytes 双界限；超载 503 + Retry-After 保留 tracker ID 重试。PASSIVE checkpoint 定期测 WAL、busy；长读受预算限制，超阈值背压，不能无限增长。

独立删除日志 fsync 在数据库生效前完成；失败或进程中断后按日志重放，墓碑检查先于重复 ACK。删除事务旋转 epoch、清正文与派生数据、撤销任务和附件；保留策略与去重收据寿命协同，不能删除重算所需正文后宣称筛选完整。

保留期严格使用毫秒 cutoff，无额外 grace。完整退休小时档案可保留；部分边界小时、不可证明的会话前缀及受影响派生指标明确 unknown/null，不回填零。访客删除使相关历史成员证明失效后清理档案，并重建仍保留正文。事件覆盖完整不等于所有会话指标可用。

## 初版产品范围

共用现有 HTML/UI/tracker；服务器提供可信 capabilities，菜单、总览隐式请求、设置表单和 deep link 同步适配。初版优先认证/逐站权限、站点、collect、stats（总览/页面/来源/受众/事件）、简单事件目标、导出、删除/保留、备份恢复。不支持功能在鉴权后明确拒绝；不能返回假数据或只隐藏菜单。首位 owner 不等于移除站点授权，测试要覆盖跨站拒绝。

回放/heatmap、大爬站、复杂漏斗/路径、分布式、CH authority 迁移不进入首版。基础 SEO 和 AI 只按需执行，网络在事务外，有明确预算；BYOK 加密且需用户显式配置/允许发送，不内置模型、不发起真实付费调用。

## 运维与迁移

备份暂停写入/调度并排空，使用 SQLite backup API（不能复制活动主 db），对数据库执行 integrity/foreign_key 检查；捕获删除 journal/watermark、密钥版本与关联附件，fsync 后最后原子生成成功 manifest。密钥包单独保护。恢复到新目录，合并最新 journal 防止旧备份复活删除、清撤销附件、作废旧任务、轮换 epoch并重算；不自动切流量。

恢复 API 必须冻结相同 canonical 目录的 owner，覆盖验证到成功标记；核验当前数据库墓碑与最新 journal 逐条一致。未来 schema、签名版本、清单、链接或密钥证明异常均拒绝。导出备份只归档快照元数据、完成任务及文件 hash 共同证明的附件；缺证明失败，孤儿文件不打包。恢复不落旧导出附件，未被隐私失效的完整历史档案保留。旧备份不能证明完整当日 AI 账本，恢复目标当天 UTC 禁止全部手动 AI 尝试，次日解除。

Lite→标准版首版是停写、一致快照、空目标导入、逐项校验后人工切换；保留事件/收据 ID、时间精度、规范化、删除状态与密钥，保留原 Lite 库可回退。不得承诺改连接串无损切换，往返数据核验是测试而非未经实现的反向迁移功能。

## 验收与可对照资源优化

真实进程 kill/重启、重复投递、任务崩溃、SQLITE_FULL、长读并发采集、删除重放竞争、schema 升级/备份恢复和离线迁移对账；共享纯业务用例在 PG 和 SQLite 上分别验证，不只换连接串。故障记录保留。资源测试另名列数据/配置，不改旧 5000 契约。

标准版与 Lite 同机、同数据/配置分别记录应用和 PG/Redis/可选 CH 的逻辑/压缩镜像、启动/空闲/负载 RSS 与 cgroup（注明缓存）、CPU、数据/WAL/日志增长、ACK/查询延迟与任务积压。全栈与应用分开，采样峰值不称持续上限。优先实测镜像 staging 白名单、维护编译产物或保留必要 tsx、按需模块、有限连接池与后台预算/错峰、批量持久采集、精确预聚合/索引、前端按需加载、日志轮转/告警。默认标准配置保持兼容，不削弱权限、耐久提交、幂等、删除屏障或备份，不自动清用户数据。

## 并行边界

根统一高层接口、HTTP 集成、迁移与资源对照。独立模块负责 SQLite 内核/任务、采集事务、纯统计共享、运维与恢复、UI capabilities。每个模块有明确文件边界；先审查接口再合并，不让共享 SQL 仿真层进入产品。

接口 v1约定：内核 owner worker 分发 `intake`、`identity_delete`、`retention`、`task_claim/complete/fail`、`accounts/sites/goals/exports` 等领域命令；只读 worker 分发 `stats_snapshot` 等受预算的快照命令。模块内部允许 SQLite 参数化 SQL，不向 HTTP/消费者暴露 SQL 或模拟 pg.Pool。基础 schema 由内核模块统一，其他模块不得改其 DDL。

内核表协议：users(id,email,name,password_hash,is_admin,created_at)；auth_sessions(token_hash,user_id,expires_at)；sites(id,name,domain,timezone,privacy_mode,retention_days,salt_secret,config,owner_id,generation,epoch,processed_generation)；site_members(site_id,user_id,role)；events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions)；receipts(site_id,event_id,wire_hash,ts,visitor_id,page_id,type,parent_event_id)；revenue_orders(site_id,order_hash,event_id,visitor_id,ts,currency,amount)；goals(id,site_id,name,definition)；jobs(id,site_id,kind,dedupe_key,status,payload,token,attempts,lease_until,next_at,epoch,generation,result,error)；rollups(site_id,hour,data,epoch,generation)；tombstones(seq,site_id,visitor_id,user_id,at,journal_hash)；exports(id,site_id,format,status,file,generation,epoch,created_at,error)。日期为UTC整数毫秒，JSON列为text，按站点/事件复合键及必要 FK/唯一索引。接口新增须由根协调，不能各模块猜不同列名。
