# 治理、分享与通知验收记录

本记录对应实际代码与命令，不代表全部项目或全部 P2 已验收。后端路径以 `/api/v1/sites/:siteId` 为前缀。主体功能没有收费门槛。

| 目标 | 已实现与验证 | 尚未实测/边界 |
|---|---|---|
| F33 自定义报表 | 严格 JSON DSL（时间、页面、渠道）、增删改查与真实筛选执行；仅参数化 SQL；拒绝 SQL/未知字段的实际 PG 测试 | UI 完整交互由前端验收；没有任意 SQL 报表 |
| F34 定时推送 | 日/周/月周期，完整周期查询并应用 path/channel；事务认领排程+持久通知任务、租约与三次失败退避；SMTP TLS、企业微信、Server酱、通用 HTTPS Webhook；频道配置带版本号 AES-GCM 加密（兼容旧格式、独立保留旧版本密钥）；通知记录仅保存脱敏错误 | 未连接真实 SMTP/第三方账号；第三方接受后进程崩溃可能重复送达（至少一次）；PG 持久队列代替 Redis BullMQ，Redis 缓存由主应用提供 |
| F35 CSV 导出 | 后台任务、十万行限制、真实 PG 行生成 CSV、公式防注入、仅管理员下载，实际 PG 测试通过 | 超过上限明确失败；大规模吞吐未压测 |
| F36 只读分享 | 随机令牌仅存哈希、可选密码、过期、撤销；仅输出日级 PV/UV 与站点名，不输出配置/明细；实际 PG 密码+撤销测试 | 分享前端浏览器交互由前端验收；不对外部署 |
| F37 iframe | 热门页面实际 HTML 条形图，路径 HTML 转义，nonce 样式 CSP、精确 origin frame-ancestors 白名单、无脚本；PG 测试检查 CSP | 常规 iframe 请使用独立无密码分享；密码仅通过请求头接受，不能放 URL；外部宿主浏览器未实测 |
| F38 流量告警 | 上一个完整小时对比28天同小时（含零流量桶）、偏离阈值、z-score、连续两小时才触发、同小时重试不累加、漏小时重置；实际 PG 持久任务与防重复测试 | 没有长达28天的真实生产观测；站点本地 DST 小时样本需进一步验收 |
| F39 目标/漏斗告警 | 事件/页面/会话时长目标达阈值（goal_id）；复用真实事件时间 sessionize/funnelCounts 对比两个已完成站点本地日，支持严格漏斗；通知与静默 | 逐步骤当前/前日转化率、任一步骤或指定步骤跌幅阈值；尚无真实生产长期告警实测 |
| F40 脚本掉线 | 无事件/超过24小时未采集告警，与频道任务复用 | 真正等待24小时的在线检测未进行 |
| F41 多站点与分组 | 主应用站点 CRUD、tags、独立权限；治理所有表查询必须 site_id 过滤，实际 PG 跨站点禁止测试 | 主应用/前端站点管理验收另记 |
| F42 团队权限 | 成员列表、管理员/分析师/只读角色修改/撤销、owner保护；七天邀请令牌仅存哈希；现有账号登录接受；无账号仅凭有效一次性邀请注册非管理员账户，实际 PG 测试 | 存在SMTP频道则入持久队列发送邮箱邀请，无SMTP仍可手工分发链接；真实邮件投递未实测；不能创建生产邮箱凭证 |
| F43 审计 | report/share/token/member/export/retention 关键操作审计，站点管理员查看，180天清理 | 全站配置/删除审计由主应用处理；所有新增写接口逐一审计覆盖仍需审查 |
| F44 API Token | 随机令牌仅存哈希、read/write/admin scopes、过期与撤销；真实 PG 哈希/撤销验证；主应用 authorize 强制站点与 scope | MCP只读服务器由外部连接器模块验收；高负荷限流未压测 |
| F45 用量与保留 | 事件数与记录大小、保留天数更新；按站点原始明细清理由聚合 worker 统一负责，不删除共享分区；回放最多30天保留 | 记录大小非整个 PG 磁盘占用；磁盘水位 storage 告警是事件记录阈值；生产磁盘压测未做 |
| F46 被遗忘权 | 管理员删除路由调用主应用 deleteVisitor；实验分配/导出 worker 与入口共享站点 advisory lock，避免删除并发生成；root 删除覆盖派生数据和文件 | 具体 tombstone fsync、恢复重放、缓存/旧worker fencing 验收见主应用/恢复记录，不由此记录宣称 |
| F47 内部IP | 由采集模块实现站点 config.excluded_ips，不在治理重复处理 | 入口内存脱敏验收另记 |
| F48 GA4 | 外部连接器模块实现历史聚合导入 | 真实 Google 账号未实测；不还原身份与事件流 |
| F49 整站导出 | JSON 或 table/record CSV：事件、属性、会话、日/小时聚合、性能、报表、目标、漏斗、热图、回放、实验、站点非秘密设置；明确十万行上限；生成全过程与删除共用 advisory lock；原子文件替换 | 外部账号秘密和 API Token 不导出；超过上限用数据库备份；完整配置迁入尚需对应导入器 |
| F50 同意横幅 | tracker/前端模块实现同意前不开行为采集、撤销清除行为队列；最小 consent 记录 | 对应浏览器用例见 tracker 验收，不是此模块单独证明 |
| P2 热图 | 显式 site config.heatmap 才持久化、点击/滚动类型、坐标归一化粗化、屏幕宽度分桶；真实查询 API | 未完成丰富设备筛选与页面截图叠加验收；不保存文字内容 |
| P2 回放 | 显式 config.replay 才允许、递归结构检查拒绝未掩码文字/URL/敏感属性，safe HTML结构与rrweb数字ID；按页面实例/顺序保存；实际 PG 拒绝明文测试 | rrweb播放器与动态浏览器回放完整重建由 tracker/web 验收；隐私评审属于持续义务，默认关闭 |
| P2 A/B | 实验定义与变体计数、标准模式/显式 experiments 开关/同意才分配；固定哈希分桶、分配写入与删除同锁；采集事件匹配目标后转化 | 未实现显著性/统计功效/实验停止决策，不能宣称统计上显著；每日盐模式不提供跨日实验归因 |
| P2 SSO | 交由外部连接器模块 | 企业微信真实租户未实测 |

## 实际命令

- `npm exec vitest run tests/unit/governance.test.ts`：5/5 通过（加密、哈希密码、CSV注入、CSP origin、回放隐私）。
- `TEST_DATABASE_URL=postgres://baize_dev@127.0.0.1:5432/baize_dev npm exec vitest run tests/integration/governance.test.ts tests/integration/governance-privacy.test.ts tests/unit/governance.test.ts`：16/16 通过（11实际PG集成+5单元）。PG为专属云环境本地开发实例；没有模拟数据库替代。
- `npm run typecheck`：全仓通过（集成时后续更改需最终再跑）。
- `npm exec eslint src/server/governance.ts src/server/governance-worker.ts tests/unit/governance.test.ts tests/integration/governance.test.ts`：通过。

失败后修正记录：早期测试因删除模块尚未写入无法导入，现采用路由调用时导入且主模块已存在；导出/流量样例 page_id 起初使用非 UUID，改为真实 UUID 后通过。全仓初次 lint 对生成 public tracker 文件报657条错误，已告知集成负责人排除生成输出与修正 outbound 类型；不能把本模块 lint 通过代替最终全仓检查。

新增真实并发回归：导出任务在删除锁外已认领后，删除操作撤销任务；worker拿到站点锁时必须比较running状态与原始文本lease_token，不得再生成文件。实际PG回归通过。首次使用JS Date比较PG微秒租约导致合法导出无法完成，已改为保留lease_until::text精度；未通过样例没有被算入最终通过数。

每日盐追加验收：隔离真实PG schema，调用真实createApp管理员初始化/站点/采集端，两日重复client visitor/page/user标识被每日派生且稳定user与保留属性ID不落库，identify拒绝，无identity_map；真实worker处理后全站JSON与CSV下载均不包含原始稳定标识、原始IP与salt_secret。该用例无数据库或采集mock。

## 第三批 D/H 修正验证

- D 新增 `010_file_cleanup.sql` 与持久 `export_file_cleanup` 意图：删除事务必须先保存任务再撤销下载/清空 path；独立磁盘 worker 按 export job UUID 删除 JSON、CSV 和崩溃遗留的 `.tmp[-UUID]`，不会删除相邻其他 job 文件；原始数据库中旧的 `/app/data` 绝对路径不会影响恢复目标目录的 basename 扫描。删除文件后 fsync 目录才确认完成；失败脱敏记录并持续退避重试，不因 path NULL 丢失清理意图。
- D 实际PG/磁盘故障恢复测试已通过：目标故意为目录时不做递归删除，任务保持 pending；移除阻塞并恢复文件后重试成功。完整 HTTP 删除→下载撤销→物理文件清除测试初次失败，准确暴露主删除模块尚未衔接；随后集成负责人已接入删除事务内 schedule、提交后按站点 runFileCleanup、启动清理调用；最终实际 HTTP/磁盘回归通过。
- H 定时报表与保存报表执行改用同一个 `queryStats` 引擎，完整保留 totals、精度/区间可用性、水位、coverage、daily_salt 跨日 UV 不支持状态与过滤方法；不会从剩余 events 明细重新数出另一套结果。实际月报流水线在原始明细已删、历史预聚合仍在时与看板查询完全一致（PV 非零、跨日 UV 为 null），通过真实PG测试。
- 保存报表过滤测试增加仅心跳访客：它不会被计为页面浏览访客；页面/渠道过滤仍 PV=2、UV=1。

本阶段首次组合运行：19 项中 18 通过，唯一失败准确暴露主删除模块尚未衔接物理清理。接入后最终组合命令 `TEST_DATABASE_URL=postgres://baize_dev@127.0.0.1:5432/baize_dev npm exec vitest run tests/unit/governance.test.ts tests/integration/governance.test.ts tests/integration/governance-privacy.test.ts tests/integration/governance-file-cleanup.test.ts`：4 文件、19/19 全部通过（真实PG/磁盘/API，不以mock代替）。随后 `npm run typecheck` 与所属文件 ESLint均通过。

## 排名告警与实验统计补验

实际执行：`TEST_DATABASE_URL=postgres://baize_dev@127.0.0.1:5432/baize_dev npm exec vitest run tests/unit/governance.test.ts tests/integration/governance.test.ts tests/integration/governance-privacy.test.ts tests/integration/governance-file-cleanup.test.ts` → **4文件、22/22通过**。随后全项目 `npm run typecheck` 与治理所属7文件 ESLint 通过。

- SERP告警：`kind=serp`，按站点时区只接受最新两次相邻日期排名，排除过期历史；绝对波动阈值默认5，可按keyword/provider限定。真实PG排名2→15产生一次持久通知，旧历史不触发，重复小时不重复。真实付费API/通知账号仍未实测。
- A/B结果：按真实visitor分配计数，首variant为对照，Wilson 95%转化率区间、固定周期双比例z检验、Bonferroni多重比较修正；成功/失败任一不足5则不出p值、不宣称显著。真实PG两组各1000、100vs200转换检验通过，相等样本/小样本/多重修正单元回归通过。重复观察、提前停止与非独立访客会破坏检验假设，API返回限制说明；不宣称序贯检验或已支付事实。
- 初次新增实验PG用例因UNION参数UUID类型推断失败（21通过/1失败）；显式UUID参数类型修正后以上22/22通过。记录该失败而不将首轮描述为通过。

逐F01–F66/P2当前状态及集中自主剩余项记录于 `docs/IMPLEMENTATION_CHECKLIST.md`；增强真实Docker新卷恢复/严格journal/已提交schema回滚脚本已EXIT0，证据 `/tmp/baize-ops-fresh-restore.log` 与 `docs/validation-ops.md`。

追加真实PG目标阈值/掉线专项：事件阈值2产生goal通知；23小时不触发offline、25小时触发，24小时静默重算不重复。与前述四文件组合重跑 **23/23通过**（05:52:55，3.85秒）。未直接联网发送通知。
