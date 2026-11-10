# Lite 存储与运行约束

Lite 与标准版共用品牌、UI、tracker、采集协议和纯统计规则，使用单容器 Node 应用和 SQLite 本地持久卷，不依赖 PostgreSQL、Redis 或 ClickHouse。

## 模块职责

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

内核使用 `node:sqlite`，启动记录实际 sqlite_version/source_id 并拒绝未核实 WAL 修复的旧引擎。SQLite WAL 兼容说明见 https://sqlite.org/releaselog/3_51_3.html 与 https://sqlite.org/wal.html 。Node 版本本身不能证明 SQLite 安全。

数据库 owner 线程串行处理有界写队列；领域操作 `acceptBatch/deleteIdentity/publishAggregation/claimTask/completeTask/setupOwner/createSite` 各自规定事务边界，不对 HTTP 暴露通用 CRUD 或 SQL。`BEGIN IMMEDIATE`、WAL、foreign_keys=ON、synchronous=FULL；提交失败（包括磁盘满）明确拒绝，绝不提前 ACK。SQLite 数据在本地卷，拒绝网络文件系统。通过生命周期内的操作系统 flock 排他锁拒绝第二实例，不依赖仅 PID 文件。

统计在独立只读 worker 的短快照完成，查询预算/超时终止只读 worker，不阻塞 writer。事件时刻保留整数毫秒；范围半开，自然日及 DST 共用前端规则。会话按事件时间及稳定 ID，迟到数据重算；UV 使用成员集合，daily_salt 跨日 UV 明示不支持；分位数与标准版 weighted-centroid/type7 一致。超预算返回明确不可用，绝不静默采样或截断统计。

任务至少一次、效果幂等；持久 claim token、lease 到期重投、有限重试/死信；发布前验证站点 epoch/generation。批次和排队按数量/bytes 双界限；超载 503 + Retry-After 保留 tracker ID 重试。PASSIVE checkpoint 定期测 WAL、busy；长读受预算限制，超阈值背压，不能无限增长。

独立删除日志 fsync 在数据库生效前完成；失败或进程中断后按日志重放，墓碑检查先于重复 ACK。删除事务旋转 epoch、清正文与派生数据、撤销任务和附件；保留策略与去重收据寿命协同，不能删除重算所需正文后宣称筛选完整。

保留期严格使用毫秒 cutoff，无额外 grace。完整退休小时档案可保留；部分边界小时、不可证明的会话前缀及受影响派生指标明确 unknown/null，不回填零。访客删除使相关历史成员证明失效后清理档案，并重建仍保留正文。事件覆盖完整不等于所有会话指标可用。

## 产品范围

共用现有 HTML/UI/tracker；服务器提供可信 capabilities，菜单、总览隐式请求、设置表单和 deep link 同步适配。优先认证/逐站权限、站点、collect、stats（总览/页面/来源/受众/事件）、简单事件目标、导出、删除/保留、备份恢复。不支持功能在鉴权后明确拒绝；不能返回假数据或只隐藏菜单。首位 owner 不等于移除站点授权，测试要覆盖跨站拒绝。

回放/heatmap、大爬站、复杂漏斗/路径、分布式、CH authority 迁移不进入首版。基础 SEO 和 AI 只按需执行，网络在事务外，有明确预算；BYOK 加密且需用户显式配置/允许发送，不内置模型、不发起真实付费调用。

## 运维与迁移

备份暂停写入/调度并排空，使用 SQLite backup API（不能复制活动主 db），对数据库执行 integrity/foreign_key 检查；捕获删除 journal/watermark、密钥版本与关联附件，fsync 后最后原子生成成功 manifest。密钥包单独保护。恢复到新目录，合并最新 journal 防止旧备份复活删除、清撤销附件、作废旧任务、轮换 epoch并重算；不自动切流量。

恢复 API 必须冻结相同 canonical 目录的 owner，覆盖验证到成功标记；核验当前数据库墓碑与最新 journal 逐条一致。未来 schema、签名版本、清单、链接或密钥证明异常均拒绝。导出备份只归档快照元数据、完成任务及文件 hash 共同证明的附件；缺证明失败，孤儿文件不打包。恢复不落旧导出附件，未被隐私失效的完整历史档案保留。旧备份不能证明完整当日 AI 账本，恢复目标当天 UTC 禁止全部手动 AI 尝试，次日解除。

Lite→标准版首版是停写、一致快照、空目标导入、逐项校验后人工切换；保留事件/收据 ID、时间精度、规范化、删除状态与密钥，保留原 Lite 库可回退。不得承诺改连接串无损切换，往返数据核验是测试而非未经实现的反向迁移功能。

## 开发验证

存储修改应覆盖进程重启、重复投递、任务崩溃、磁盘满、长读并发、删除日志重放、升级、备份恢复和离线迁移。测试使用独立数据目录；性能测量分别记录应用、数据库文件和 WAL 增长，不将应用 RSS 当作整机资源上限。
