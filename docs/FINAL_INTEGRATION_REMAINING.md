# 最终集成剩余项：main 与工作区边界

核对时间：2026-10-10。依据 `PROJECT_SPEC.md` 全部 F01–F66/P2、`IMPLEMENTATION_NOTES.md`、逐项清单和各模块实际验收记录。此文件只整合状态，不修改规格目标，不把专项计数累加为全量，也不替代共享主清单。未运行新的 CI、Docker、负载或外部请求。

根负责人确认当前 main 为 **5b402dd**（前序 de1ec79）：7f02 阶段包含第八基础，f66f5b2 加强 AI 多轮失效检查。第八不可变证据为 **377 应用 =88 单元+289 集成，0失败/0跳过；20 检查 =18 Chromium+2日期**，见 [VALIDATION_EIGHTH.md](VALIDATION_EIGHTH.md)。这是该冻结源的本地空 Compose 结果；不是当前工作区全集、最新托管或最新 Docker 结果。042 已以独立干净快照进入 main；036/038/039/041/043–047 尚属工作区，不据文件存在推断已合入。

## 已闭合的 main 功能，不重复列为待开发

- F01–F10、F12–F30、F32–F47、F49/F50、F61/F62/F64–F66 已有对应本地应用证据。这包含真实 SDK/采集/PG/worker/中文看板、事件时间与迟到、会话/漏斗/留存、权限/审计/安全导出/分享/告警、可靠删除和独立日志，以及已有 Docker 安装升级恢复。具体范围以逐项证据为准，非无限范围或全部兼容矩阵保证。
- F44 标准 MCP 已生产注册，官方 SDK 实际 HTTP/PG 验收。F60 typed 只读问数、成功工具追踪、确定性图表、历史证据读取、当前 epoch/权限复查、删除清除旧答案、预算同连接原子写入已纳第八。不能继续把它们写为“仅骨架”或“尚未注册”。
- 033 精确关系事实查询、034 回放索引、035 持久 AI 预留/结算/保守过期、037 回放保留队列、040 通知派生证据清除已纳第八。AI 多轮发送前失效检查由 f66f5b2 加强。真实模型响应质量仍未测，模型运输模拟不削弱实际数据库/权限/删除验收，但也不等于模型验收。
- F48 GA4 精确窗口导入/独立 totalUsers 报告/历史虚线显示已本地 API 和浏览器验收；F31/F51/F53–F59 安全连接器、真实聚合或规则流程已有本地证据。provider 响应使用明确模拟；不冒充实际 Google/SERP/模型账号。
- P2 回放、热图、A/B、WordPress 实际本地安装及启停、固定中英 UI、Cookie 同意横幅已实现且本地验收。P2-10 与 F50 是同功能，不重复计数，也不继续标未实现。
- ClickHouse 副本/增量混合读取、028 历史 manifest/签名文件/权限/独立 namespace 恢复均已有阶段验收。不是“没有 CH”，但也不是“PG 已仅元数据”。

## 自主实现与集成还须完成的封闭清单

| 编号 | 原目标与当前状态 | 完成条件 / 具体剩余 |
|---|---|---|
| R1 | P2-01 全 canonical 生产迁移；guard 仍 false | 集成 036/038/039/041/043–047 的当前 producer、reader、worker、删除、保留、历史与恢复链；证明 PG 不再保留原事件/EAV、session header、effects/vitals/carry 等应迁出正文，而不是仅 events=0。PG 保留安全元数据/权限/身份/队列/预算。全部 readiness 条件完成后由负责人启用 guard，不能用手工改 authority 代替。 |
| R2 | 044 事实读来源接线在制 | `ai-evidence.ts` 当前调用尚未传 `queryAiPublishedSeries` 第五参数 `{pool:ctx.pool}`；需同一已有 client 选择 CH registry/TEMP 来源，不借新连接。所有读取（AI、统计、治理、导出、历史备份）审计 source/epoch/deletion_epoch/coverage 和缺 body 失败关闭；不得把空 PG 表当零或悄悄 fallback。 |
| R3 | 精确删除 / journal / restore 在新 CH 正文模式的事务恢复在制 | D 早期实际 native restore 在 journal 推进 deletion_epoch 后遇到 `FACT_STORE_SOURCE_FENCE`；C 早期实际 CH ACK→PG rollback 发现 surviving-fact 修复捕获缺口，失败记录保留。根最新确认044 producer native partial+ACK rollback 已通过，不继续写为未修；完整 runtime 因046 allowlist guard 在制尚未完成，不写成最终产品已失败。仍须完成受内部授权、同站 gate 的 repair 全运行时对账，普通只读严格拒绝陈旧源；最终证明删 A 保 B、失败 ACK 不成功、已物理删除后 PG 回滚与重试、最新 journal 恢复不复活、导出/AI/缓存无旧数据。不能把这些归为外部账号阻塞。 |
| R4 | 036 会话 carry / 041–046 headers 与 facts 生命周期在制 | 生产 worker 默认接线、跨保留期/晚到/乱序精确 owner、GC/保留/精准删除和 backup/restore 的整链对账。已有独立成熟留存/跨 cutoff 率专项通过，不重复列未实现；未知 backing 必须 unsupported，不能伪零。 |
| R5 | 038 控制列证明 +039 生产操作预激活已专项通过，尚未发布全量 | 可复现 daily native 3/3（旧 producer 夹具实际采集、升级同 wire、真实 shadow/verify/activate/prune、startup 新证明、CH ACK→PG rollback→重启恢复、精确删除、CH 故障503）；主 guard false。将当前 shared policy、旧 wire replacement receipt 链及证明生命周期纳入同一不可变源全集，再验证 main 正式模式。旧 body 不制造证明；完整性清洗只保证已知标识/完整邮箱，不保证任意自由文本匿名。 |
| 已闭合，不再待做 | F52 安全自定义手动搜索导入042已 main 5b402dd | 独立干净快照4 unit+7真实PG+1真实browser（11+1），build/type/lint PASS；证据 `manual-search-clean-main.json`。不加进第八377。自定义模板/列映射不是官方读取API或百度原生CSV兼容，后两项仍按外部边界保留。 |
| R7 | 最新完整发布验收尚未覆盖上述 WIP | 对最终不可变源执行 lint/type/单元/真实 PG+CH+Redis/浏览器/构建/空卷 compiled-app CI，并跑该精确镜像 Docker 安装、升级、备份、独立新卷恢复、503/迁移失败回滚。不得用第八377+20或旧 c610 镜像替代新增迁移。记录失败/未运行与 SHA。 |
| R8 | 单机规模与 bounded planner 当前新路径未完整验收 | 真持续采集并发查询/删写/重建下量化 RSS、lag、失败/重试、集中大站与多站分布；含 CH 正文、facts、carry 及047剩余正文新路径的容量与恢复。旧 1M PG-only 40站完整管线确实通过，非最新源；不能证明 1C2G、持续混合负载或5分钟保证。 |
| R9 | 最新托管/定时与运行资料尚未闭合 | 本地第八绿不等于最新 CNB 绿；保留 fa3 托管及两轮空 Compose 失败记录。托管由负责人按授权处理，不自行触发；cron 授权仍未验收。最终用户手册、schema/app兼容矩阵和逐项清单须对应新源/镜像，避免沿用“尚未注册 AI”等历史措辞。 |

此清单没有发现应重开已关闭 AI 审计的新功能任务。R2 是 044 接线的新确定缺口；R3 保留实际失败历史及已通过的修复专项，完整runtime仍待闭合；其他项是原承诺的未闭合生产/发布链，不是新增产品范围。

## 真实外部与执行器边界，独立保留未验收

| 范围 | 已有真实本地证据 | 未实测 / 阻塞，不购账号或改网络 |
|---|---|---|
| F11/F26/F63 MaxMind | 加密配置、SHA/归档/mmdb 拒绝、内存查库后脱敏、unknown 降级 | 真实授权库下载、真实地域/坐标准确性。 |
| F31/F48/F51 Google | OAuth PKCE/state/session、分页、GA4 独立精确报告窗口、GSC 延迟和聚合语义、PG/浏览器流程 | 真实 OAuth 账号、property 权限、配额及官方报告对账。 |
| F52 百度 | 官方公开文档可行性核验；042 自定义模板已main及本地验收 | 普通站长搜索分析公开读取 API 未证实，未实现该官方连接器；不能断言不存在。无当前原生 CSV 样本，不能宣称原生兼容。URL 提交 API/百度统计 PV-UV 搜索词接口不是要求的资源平台展现/排名读取。 |
| F54 SERP | SerpAPI/DataForSEO 安全运输/分页及真实 PG 排名告警队列 | 实际付费 API、代理和真实排名/计费对账。 |
| F34/F39/F40/F42 外部投递 | 真持久队列、有限超时、重试、epoch 删除屏障与本地运输 | 真 SMTP、WeCom、Server酱交付和邀请邮件；已发往外部的消息不能追溯召回。 |
| F56–F60 商业模型 | BYOK 加密/轮换、预算崩溃与迟结算、真实授权聚合工具/图与删除证据，模拟模型运输 | 实际 OpenAI兼容提供者端到端、真实输出质量/建议收益及人工密钥灾难恢复演练。输入问题和获授权聚合会发模型；观察比较不证明因果。 |
| P2-07 企业微信 SSO | 明确映射、单次 state/session、禁止自动提权、真实 PG/官方形状模拟 | 真企业、授权 IP/回调、扫码登录。 |
| P2-09 Ollama | 仅模型出口使用窄目标例外、真实本地 HTTP 安全运输 | 官方二进制 CONNECT403/curl56，未安装模型或推理；这是网络阻塞，不是缺付费账号。 |
| P2-05 小程序 / F61 Windows | 小程序 SDK 注入运输和同意/重试；Linux Docker 脚本实测 | 微信真机/实际账号；Windows 已授权执行器在命令启动前 -32603 setup helper 错误，run.bat 未执行。不能用 Linux 或模拟运输替代。 |
| 设备 / UI / 站点兼容 | 实际 Chromium、真实 localhost WordPress、保守回放和热图、中英固定交互 | 更多真设备/读屏/浏览器、WP主题/CMP/缓存组合、复杂 CSS/响应式/无限滚动矩阵。 |
| CH 集群运行 | 单节点 localhost 真 PG/CH 测试及独立 namespace 备份切片 | 集群灾备/故障转移、独立 CH 节点恢复和大规模生产运行。原目标不得以单节点专项降格完成。 |

## 不应当作待实现的诚实语义边界

每日盐跨日 UV/留存/identify 本来不支持；丢失心跳不外推；GSC 关键词不关联访客/订单；不同币种不求和；用户自报收入不是支付对账；精确 GA4 窗口不匹配时 unsupported；当前证据无法算的旧档/cohort 不假造率；每表100k、有界读与备份上限超量明确失败。它们是规格/勘误要求的正确行为，不能靠伪数据“补验收”，也不意味着其对应整个功能未实现。

本文件只在根确认的 main 边界内说“已 main”。专题测试与临时 readiness-true 源变体只说“本地专项”，不合计进377，不声称已部署、已公开、已合并或全计划完成。
