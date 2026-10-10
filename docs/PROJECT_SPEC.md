# 白泽 Baize · 立项与实现规格（融合版）

> 融合版本：v1（2026-10-10）。由以下 5 份文档融合而成，内容未改写，仅调整标题层级：
>
> - 第一部分：立项报告（含产品定位、竞品调研、技术方案、66 项功能、分期、风险、决策记录）
> - 第二部分：事件协议 v1（采集端点、事件 schema、网关流水线、版本兼容）
> - 第三部分：数据库结构 v1（表定义、索引、分区、迁移）
> - 第四部分：任务处理流程 v1（采集写入、聚合 Worker、会话归因、定时任务、删除/恢复/升级）
> - 第五部分：指标测试样例 v1（8 组手工期望值 fixture）

---

## 第一部分：立项报告

> 产品名：**白泽 Baize**（2026-10-10 用户拍板），GitHub 仓库：`bocmiao/baize-analytics`（待建）
> 本报告由《产品与技术方案》与《竞品与 GitHub 深度调研报告》融合而成，全文一份。调研部分查询日期统一为 2026-10-10，star 数为当日约数。

---

### 一、产品定位与开源策略

**一句话定位**：一款**永久免费、开源、自托管、隐私优先、中文优先**的网站流量与行为分析平台（2026-10-10 用户拍板：不设收费功能门槛，所有功能免费提供；按需开关只管理资源、隐私和外部配置）。对标交集：Umami（轻量易部署）+ Plausible（看板易用）+ PostHog（事件/漏斗深度），单机可跑，企业可扩展。数据默认 100% 存于自己的服务器；启用外部 AI/SEO 服务时，按管理员配置发送指定数据（BYOK 不等于本地推理，见 F-56）。

**协议（2026-10-10 用户拍板）**：主体 **AGPL-3.0**（与 Plausible / Rybbit / OpenPanel 同阵营）。AGPL 允许合规商用（含收费托管），要求以网络服务形式向他人提供修改版时，向远程交互用户公开对应源码；它不禁止他人经营竞品或收费托管，也不会自动授予本项目商标保护。**追踪脚本 tracker.js 单独采用 MIT**（2026-10-10 用户已同意，抄 Plausible 做法，打消站长"嵌一段 AGPL 代码会不会传染我网站"的嵌入顾虑）。发行前需确定 AGPL-3.0-only 或 AGPL-3.0-or-later，并核对依赖兼容性。

协议格局背景（调研结论）：

| 阵营 | 代表 | 后果 |
|---|---|---|
| MIT | Umami（~39k★）、Ackee | 采用量最高，但无法阻止别人拿代码做竞品云服务 |
| AGPL-3.0 | Plausible、Rybbit、OpenPanel、Swetrix | 允许合规商用，要求网络服务公开对应源码；代价是部分大公司法务禁用，且 Plausible 官方承认 CE 被"有意削弱" |
| GPL-3.0 | Matomo | 老牌 copyleft，好功能多进付费插件墙 |
| MIT 核心 + 企业专有 | PostHog | star 最高，但官方劝退生产自托管，社区信任受损 |
| EUPL-1.2 | GoatCounter | 与 AGPL 兼容，国内认知度低 |

**一键安装，开箱即用**：
- 一条命令：`curl -fsSL https://raw.githubusercontent.com/bocmiao/baize-analytics/main/install.sh | bash`（或 `git clone && docker compose up -d`），目标 3 分钟内跑起来（待验证，见§十一）
- 预构建镜像发布到 GHCR，`docker-compose.yml` 一个文件拉起全部服务（app + postgres + redis），无外部依赖
- `install.sh` 自动做：检查 Docker、生成随机密钥与数据库密码、拉镜像、初始化数据库、打印访问地址与初始账号
- 首次访问进入设置向导：创建管理员账号 → 添加第一个站点 → 复制追踪代码，三步进看板
- GeoIP 离线库首次启动自动下载（MaxMind GeoLite2，需自备免费 License Key；失败则降级为"未知"不阻塞）
- 内置演示站点一键导入示例数据，空看板不吓人
- 健康检查页 `/healthz`、`upgrade.sh` 平滑升级（数据库迁移自动执行）、每日自动备份脚本随仓库附带

**开源仓库运营**：README 中英双语（截图/GIF、一键安装、5 分钟上手、架构图）；`docs/`（部署、反向代理、HTTPS、从 Umami/GA4 迁移、API 文档、二次开发指南）；发版打 tag + changelog；issue 模板 + CONTRIBUTING。

---

### 二、竞品与 GitHub 生态调研

> 调研方法：两组并行——A 组覆盖 13 个市面产品（官网 pricing/features/docs + GitHub README + 社区 issue/Reddit/HN）；B 组深读头部仓库 README/架构文档/schema/release，挖掘小众项目与可复用设计。

#### 表 1：基本面（协议 / 部署 / 技术栈 / 脚本体积 / 云定价 / star / 活跃度）

| 产品 | 开源协议 | 部署方式与最低资源 | 技术栈 | 追踪脚本（gzip） | 云版本定价 | star（约数，截至 2026-10） | 维护状态 |
|---|---|---|---|---|---|---|---|
| Umami | MIT | Docker/Node，只需 PostgreSQL；1 vCPU/1–2GB 小 VPS 可跑 | Node.js(Next.js)+PostgreSQL（v2 起可选 ClickHouse） | ~2.4KB | Hobby 免费（100K events/月）；Pro $20/月；Business $200/月 | ~39,000 | 活跃（v3.4.0，2026-09-17） |
| Plausible（含 CE） | AGPL-3.0 | Docker（PostgreSQL+ClickHouse）；中型 VPS 起 | Elixir+PostgreSQL+ClickHouse | <1KB | $9/月起（1 万 PV）；无永久免费档，30 天试用 | ~29,000 | 活跃（v3.2.1）；CE 半年一版 |
| Matomo | GPL-3.0（核心） | PHP+MySQL，普通虚拟主机可跑；大流量需手工优化 | PHP+MySQL/MariaDB | 未查到官方数字 | Cloud €29/月起；自托管核心免费，插件另购 | ~21,900 | 活跃（5.14.1，2026-10 上旬） |
| PostHog | MIT（核心）+ ee/ 企业专有 | Docker Compose 约 18 个容器，官方文档要求 4 vCPU/16GB 内存/30GB+ 存储；官方劝退生产自托管 | Python(Django)+Rust 采集+Kafka+ClickHouse+Redis+Postgres | 未查到官方数字 | 免费 1M events/月；超量 $0.000198/事件起 | ~40,000 | 极活跃 |
| Rybbit | AGPL-3.0 | Docker Compose（PG+ClickHouse+Redis）；介于 Umami 与 PostHog 之间 | TS(Next.js+Node/Fastify)+ClickHouse+PG+Redis | ~11KB | $19/月起（100K events）；年付约 $13/月 | ~13,100 | 活跃（v2.8.0） |
| OpenPanel | AGPL-3.0 | Docker Compose 一键（PG+ClickHouse+Redis）；官方称 4vCPU/8GB 扛数百万事件/月 | TS(Next.js)+Fastify+ClickHouse+PG+Redis | ~2.3KB | $2.50/月起；自托管免费且功能一致 | ~7,100 | 活跃（持续部署） |
| Fathom | 闭源 | 仅 SaaS，无自托管 | 未公开（Go） | ~2KB | $15/月起（10 万 PV）；无免费档 | —（闭源） | 产品持续迭代 |
| Simple Analytics | 闭源 | 仅 SaaS | 未公开 | 未查到 | 免费 hobby 档；付费 $20/月起 | —（闭源） | 产品持续迭代 |
| Pirsch | AGPL-3.0（自托管仅企业版） | 云为主；自托管=企业版 on-premise | Go | 未查到 | $6/月起（1 万 PV）；30 天试用 | 未查到确切数（社区小） | 一般 |
| GoatCounter | EUPL-1.2 | **单 Go 二进制**，SQLite 默认；树莓派级可跑 | Go+SQLite/PostgreSQL | ~3.5KB | 非商业免费托管；付费云约 €5/月起 | ~6,100 | 活跃（单人，v2.7） |
| Ackee | MIT | Docker（Node+MongoDB）；空闲约 80MB | Node.js+MongoDB+GraphQL | 未查到 | 无官方云版；自托管完全免费 | ~4,700 | 放缓（最近提交 2026-04） |
| Shynet | Apache-2.0 | 单 Docker 容器/小 VPS | Python(Django)+PostgreSQL | <1KB | 无官方云版；自托管免费 | ~3,200 | 低频（最新提交 2026-03） |
| Countly | AGPL-3.0（开源版非商业许可） | Docker（Node+MongoDB）；Lite 自托管免费 | Node.js+MongoDB | 未查到 | Lite 自托管免费；Flex 云约 $175/月起 | ~5,900 | 活跃 |

#### 表 2：功能矩阵（✅=有 ❌=无 ◐=部分/付费档/未完全确认）

| 功能 | Umami | Plausible | Matomo | PostHog | Rybbit | OpenPanel | Fathom | Simple | Pirsch | GoatCounter | Ackee | Shynet | Countly |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PV/UV/会话 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ |
| 实时看板 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 自定义事件 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 转化目标 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 漏斗分析 | ✅ | ◐ | ◐ | ✅ | ✅ | ✅ | ❌ | ❌ | ◐ | ❌ | ❌ | ❌ | ✅ |
| 留存/同期群 | ✅ | ❌ | ◐ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 热力图/会话回放 | ◐ | ❌ | ◐ | ✅ | ◐ | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| UTM/渠道分组 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 地域统计 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ |
| Web Vitals | ✅ | ❌ | ◐ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ | ❌ |
| 流量异常告警 | ❌ | ❌ | ✅ | ✅ | ◐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 定时报表（邮件） | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| CSV 导出 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ❌ | ✅ |
| 公开分享链接 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 多站点管理 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 团队权限 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| GA/GA4 导入历史 | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 无 Cookie/GDPR | ✅ | ✅ | ◐ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ |
| **SEO 能力** | ❌ | ◐ | ✅ | ❌ | ◐ | ❌ | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI 能力** | ◐ | ❌ | ❌ | ✅ | ◐ | ◐ | ◐ | ✅ | ❌ | ❌ | ❌ | ❌ | ◐ |

#### 各产品一句话定位 + 关键事实

1. **Umami** —— MIT 协议最轻量的自托管统计标杆，v3 起补齐漏斗/留存/回放/热力图/Web Vitals。关键：① star 全场第二（~39k）；② 只需 PostgreSQL，单机可跑；③ v3 升级两次翻车（v3.0 坏国家/收入统计、v3.3 升级无法启动 issue 仍 open），被 HN 吐槽"不能 set-and-forget"；④ 无 GA 导入、无 GSC 集成；⑤ tracker v1.32.1 起用 fetch 替代 sendBeacon。
2. **Plausible** —— 极简单页仪表盘的隐私统计标杆，云付费、CE 开源但被刻意削弱。关键：① AGPL-3.0；② 脚本 <1KB 全场最小；③ CE 无漏斗/收入目标/SSO/Sites API，官方承认"有意落后"；④ 自托管要自己运维 ClickHouse；⑤ 有 GSC 关键词集成。
3. **Matomo** —— 功能覆盖较广的自托管 GA 替代，代价是 PHP/MySQL 老架构与插件付费墙。关键：① GPL-3.0；② **唯一有真 SEO 布局的**（付费插件：GSC/Bing/Yandex 关键词、排名趋势、抓取监控）；③ 有 GA 导入、异常告警、定时报表；④ 漏斗/热力图/A-B 测试/SEO 全是付费插件；⑤ 大流量下归档靠 `core:archive` cron 预聚合。
4. **PostHog** —— 产品分析全家桶（分析+回放+特性开关+实验+问卷），MIT 核心但官方劝退生产自托管。关键：① star 全场第一（~40k）；② 内置 AI 较成熟（自然语言问数/建表/写 HogQL，云版自带模型；LLM Analytics 支持 BYOK；但 Simple Analytics/51.la 也有 AI 能力，非独家）；③ 自托管约 18 个容器、空载 1.5GB；④ Web Vitals、异常告警、HogQL 全有；⑤ 无 GA 导入。
5. **Rybbit** —— 2025-01 出生的黑马：Plausible 的简洁外壳 + GA 级深度（回放/漏斗/留存/Web Vitals/错误追踪），自托管给全功能。关键：① AGPL-3.0；② 脚本 ~11KB 偏大；③ 有 GSC 集成（自托管需自配 Google Client）；④ MCP server（44 工具，可直跑 ClickHouse SQL）；⑤ 无 GA4 导入、无定时报表；⑥ 自托管小坑多（ARM 镜像、GSC 被前端隐藏、usage cron 死循环）。
6. **OpenPanel** —— "网页+产品分析"二合一的 Mixpanel 平替，云版 $2.50/月起。关键：① AGPL-3.0；② 自托管与云功能一致；③ AI 走 opt-in 路线（自然语言问数/异常洞察/AI 报告，DPA 写明"不用则零数据传输"）；④ hosted MCP 38 tools；⑤ 无公开分享链接、无定时报表。
7. **Fathom** —— 极简付费 SaaS，无自托管。关键：① 闭源；② 功能比 Plausible 还少；③ 有"AI 引荐来源"分组（GEO 范畴）；④ 约 70% ChatGPT 流量无 referrer 被记为 Direct；⑤ $15/月起无免费档。
8. **Simple Analytics** —— 欧盟最隐私保守的极简统计。关键：① 闭源仅 SaaS；② 主打"找回被 GA4 同意横幅吃掉的 60% 流量"；③ 功能简单到"对正经运营太简单"。
9. **Pirsch** —— 德国造、服务端优先的 cookieless 统计。关键：① AGPL 但**自托管只给企业版**；② Go 编写；③ 有漏斗/A-B 测试/白标；④ 有 GA/Plausible/Fathom 导入器。
10. **GoatCounter** —— 单 Go 二进制 + SQLite 的极简主义计数器。关键：① EUPL-1.2；② `goatcounter serve` 即跑；③ 无 Cookie 用每日轮换 salt 做访客哈希（隐私与去重的最佳平衡）；④ 无会话/漏斗/事件/留存。
11. **Ackee** —— 德国单人开发者的极简 Node 统计。关键：① MIT；② GraphQL API；③ 维护放缓（最近提交 2026-04）。
12. **Shynet** —— Django 写的"不用 JS 也能跑"的隐私统计。关键：① Apache-2.0；② tracker <1KB 且刻意躲 adblock；③ 维护堪忧（最新提交 2026-03）。
13. **Countly** —— 移动+网页产品分析老兵。关键：① 开源版 AGPL 非商业许可；② 有漏斗/留存/异常告警/定时报表；③ 自称 AI-powered 但无实质 AI 功能。

#### GitHub 小众特色项目

| 项目 | 语言 | star（截至 2026-10） | 协议 | 一句话亮点 |
|---|---|---|---|---|
| medama-io/medama | Go | ~643 | Apache-2.0/MIT | 单二进制 + DuckDB，<1KB tracker，256MB 内存可跑 |
| tomtom215/mallardmetrics | Rust | ~3 | AGPL-3.0 | 单二进制 + DuckDB behavioral 扩展，漏斗/留存/序列匹配全用 SQL；PRIVACY.md 诚实写清隐私代价 |
| vul-os/athar | Go | 未核实 | MIT | 单二进制带点击/滚动/注意力热力图 + 电商 revenue 事件 + 内置 GeoIP |
| offen/offen | Go | ~981 | Apache-2.0 | 德国 opt-in + 端到端加密统计，访客可查看/删除自己的数据 |
| Swetrix/swetrix | TS | ~1,206 | AGPL-3.0 | 错误追踪+性能监控+回放+漏斗；Ask AI 为 Cloud 限定（AI 可作商业版差异点） |
| towfiqi/serpbear | TS | ~2,105 | MIT | 最成熟开源排名追踪：SERP 抓取 API 可插拔 + 自备代理 + GSC 第一方数据 |
| serphacker/serposcope | Java | ~757 | GPLv3 | 老牌排名监控，多地区/代理/验证码支持 |
| fenjo26/opengsc | TS | ~27 | MIT | 自托管 GSC 仪表盘（Google/Bing/Yandex）+ 内置爬虫站内健康审计 + GA4/Clarity 集成 + BYOK 的 AI SEO 套件 + 83-tool MCP；`install.sh` 一键安装 |
| allinurl/goaccess | C | ~20.8k | MIT | 终端实时日志分析，看 Googlebot 抓取/404/带宽的技术 SEO 利器 |
| chsharoze/clickspot | Python/TS | 未核实 | 未核实 | ClickHouse 上的自然语言问数：提问→生成 SQL+可视化，带 MCP server |

#### 国内竞品（SaaS，2026-10-10 补充调研）

> 结论前置：国内 SaaS 在功能上并不空白（51.la 有 SEO 查询助手/AI 助手）；海外开源圈有 OpenGSC 先例（GSC 仪表盘 + 内置爬虫 + BYOK AI）。白泽的仗不在"功能更多"，而在"**开源自托管 + 数据自主 + 无额度限制 + 一键安装 + 统计→诊断→建议→复检的证据链闭环**"（组合优势待同任务对照验证）。

| 产品 | 一句话定位 | 收费 | 私有化/自托管 | 与白泽的关系 |
|---|---|---|---|---|
| **51.la（我要啦）** | 国内老牌免费统计（2002 年至今，300万+开发者/2000万+网站），闭源 SaaS | 免费版限 30 站点/300万PV月/日志保留15天，超量按量付费 | ❌ 数据在其服务器 | **最直接竞品**。功能覆盖广（SEO 查询助手、蜘蛛爬虫监控、小程序统计、官网宣称含屏幕录制/会话回放待实测核验、AI 智能助手、反作弊识别）；短板：闭源、隐私政策收集范围广且有第三方共享条款 |
| **百度统计** | 百度官方免费统计，站长装机量最大 | 完全免费（未见公开额度限制） | ❌ 纯 SaaS | 直接竞品。壁垒是百度搜索/推广生态绑定（搜索词、推广转化）；有站长因数据合规被迫下掉转投 Umami 的案例 |
| **友盟+ U-Web（原 CNZZ）** | 中文统计鼻祖并入阿里友盟后，官网主推 Plus 付费方案（¥1169/年起，待核验），标准版据称 2026-07-01 起停售新增；以官网实时页面为准 | 网站统计原免费，现以官网实时页面为准 | ❌ 纯 SaaS | 直接竞品但边缘化。对怀念 CNZZ 的老站长，白泽是"精神续作+数据自主"升级版 |
| **神策数据** | 国内企业级用户行为分析龙头（对标 Mixpanel） | 企业级年费制（数十万/年起，未核实） | ✅ 私有化是核心设计理念 | 错位竞争。贵且重、需专业实施；但它证明了"私有化+数据自主"在中国值钱——白泽把同一卖点下沉到站长市场 |
| **GrowingIO** | 国内增长分析平台，2015 年率先无埋点采集 | 企业级年费制，不公开 | ✅ 支持 SaaS+私有化 | 错位竞争。"无埋点"理念值得借鉴（白泽 P0 自动事件即轻量版无埋点） |
| 诸葛 IO / TalkingData | 主战场在移动 App，网站统计非主业 | — | — | 基本不竞争 |

**竞争排序**：51.la > 百度统计 > U-Web（抢"想换工具"的站长用户）→ 神策/GrowingIO（错位，企业级）→ 诸葛/TalkingData（不用管）。

| 维度 | 51.la / 百度统计 / U-Web | 神策 / GrowingIO | 白泽 Baize |
|---|---|---|---|
| 开源 | ❌ 闭源 | ❌ 闭源 | ✅ AGPL-3.0 |
| 自托管/数据自主 | ❌ 数据在其服务器 | ✅ 私有化（但重） | ✅ 一键安装的轻量自托管 |
| 价格 | 免费但有额度/无 SLA | 企业级年费 | 免费，无额度限制 |
| SEO+AI | 51.la 有、百度部分有 | 无（非其场景） | P1：统计+SEO+AI 证据链组合（OpenGSC 已有 GSC+爬虫+BYOK 先例，差异化待对照验证） |
| 一键安装开箱即用 | N/A（SaaS 免安装） | ❌ 需专业实施 | ✅ install.sh（目标 3 分钟，待验证） |

---

### 三、可借鉴清单（按层分类，注明来源）

#### 采集层
1. **tracker 配置全走 `data-*` 属性 + `data-before-send` 拦截钩子**（Umami）：零 JS 配置、可编程清洗 payload（过滤敏感字段、砍 query 参数），把隐私合规做成用户可配的钩子。来源：https://docs.umami.is/docs/tracker-configuration
2. **单代码库多变体构建 + 体积预算**（Plausible）：编译开关 + 死代码消除，**每个 PR 自动追踪体积变化**，Playwright 真机测试。来源：https://github.com/plausible/analytics/blob/master/tracker/ARCHITECTURE.md
3. **服务端动态注入站点配置到脚本**（Plausible `tracker_plug`）：改配置不改嵌入代码。来源：同上
4. **声明式/自动事件采集**（Umami `data-umami-event`、Plausible 出站链接/文件下载/404 自动追踪、Rybbit autocapture）：P0 就该有出站链接+下载自动追踪。来源：https://docs.umami.is/docs/tracker-configuration
5. **GeoIP 本地 mmdb + 启动校验**（Gount）：`geodb_sha256` 启动时校验，离线可用、失败回退。来源：https://github.com/Orboul/Gount
6. **会话身份缝合**（Umami v3.3：`visit_id` + `session_link` + `distinct_id`，identify 后跨设备合并会话）。来源：https://github.com/umami-software/umami/releases

#### 存储与查询层
7. **事件/会话属性的 EAV 键值设计**（Umami `event_data`：data_key + string/number/date 三列 + data_type；`session_data` 数据库级 `@@unique([sessionId, dataKey])`）：自定义事件属性无需改表且类型安全，P0 可直接抄。来源：https://github.com/umami-software/umami/blob/master/prisma/schema.prisma
8. **OLTP/OLAP 双库职责分离**（Plausible：Postgres 管用户/站点/权限，ClickHouse 只管事件）：P1 上 ClickHouse 后照搬。来源：https://github.com/plausible/analytics
9. **日级预归档 + 上卷**（Matomo：log 表 → `archive_numeric_*`/`archive_blob_*`，`core:archive` cron 做 day 级归档）：P0 用 PG 而不上 ClickHouse 时报表可扩展的正解。来源：https://github.com/matomo-org/developer-documentation/blob/HEAD/docs/4.x/how-piwik-works.md
10. **物化视图 + Redis 看板缓存与请求合并**（Rybbit：ClickHouse 物化视图供高频查询；Redis 缓存 TTL 30s + 相同查询共享一次执行防惊群）。来源：https://github.com/rybbit-io/rybbit/tree/master/server
11. **写入可靠性模式**（PostHog：Kafka→ClickHouse 拉取式写入 + overflow topic + 去重）：至少一次投递下的幂等设计，overflow/死信思想可简化实现。来源：https://posthog.com/docs/how-posthog-works
12. **内存缓冲 + 后台批量落盘**（GoatCounter `memstore.go`）：单机削峰的最简实现。来源：https://github.com/arp242/goatcounter

#### 隐私合规层
13. **每日轮换 salt 的无 cookie 访客哈希**（GoatCounter：`HMAC(IP + UA + 每日 salt)`，原始 IP 不入库）：隐私与去重的最佳平衡点。来源：https://github.com/arp242/goatcounter
14. **把隐私代价诚实写进文档**（Mallard `PRIVACY.md` 明说"跨天 unique 统计的是 visitor-days"）：隐私声明的写法范本。来源：https://github.com/tomtom215/mallardmetrics/blob/HEAD/PRIVACY.md
15. **AI 功能 opt-in + 最小数据传输声明**（OpenPanel DPA："仅当用户显式调用 AI 功能时，才把 prompt + 相关数据切片传给 OpenAI；不用则零传输"）。来源：https://github.com/openpanel-dev/openpanel/blob/HEAD/apps/public/content/pages/dpa.mdx

#### AI 与 SEO 层
16. **AI 问数走"MCP 只读语义工具"而非 Text-to-SQL 直连**（Umami/OpenPanel/Rybbit/OpenGSC 四家不约而同）：当前最安全可控的 AI 问数姿势。来源：https://github.com/umami-software/umami/releases
17. **BYOK AI（多 provider + OpenAI-compatible endpoint）**（OpenGSC 可接本地 Ollama/vLLM、PostHog `LLMProviderKey`）：与我们 P1"后台自填 Key、Key 加密存储"方案一致。来源：https://github.com/fenjo26/opengsc
18. **SERP 数据源抽象层**（SerpBear：多家抓取 API 可切换 + 自备代理 IP + GSC 第一方数据互补）：P1 关键词排名模块的直接模板。来源：https://github.com/towfiqi/serpbear
19. **统计 + SEO 结合的现成例子**（OpenGSC：GSC 仪表盘 + 内置爬虫站内健康审计 + GA4/Clarity 集成一体）：验证了"统计+SEO"可以做进一个自托管产品。来源：https://github.com/fenjo26/opengsc
20. **AI 免费提供的方式参考**（Swetrix "Ask AI" 为 Cloud 限定，属其商业策略）：白泽的 AI 能力永久免费，按需开关（见 F-56）。来源：https://github.com/Swetrix/swetrix

#### 运营与开源层
21. **一键安装体验**（OpenGSC `install.sh` 单命令装完；Umami `docker compose up -d` + 首次构建自动建表/默认账号）。来源：https://github.com/fenjo26/opengsc
22. **tracker 本体用更宽松协议**（Plausible 主体 AGPL、tracker 目录单独 MIT）：降低站长嵌入顾虑——我们已采纳。来源：https://github.com/plausible/analytics/blob/master/tracker/ARCHITECTURE.md

---

### 四、可超越清单（共性短板与空白，每条注证据）

1. **一键安装体验没人做到极致**：Umami 仍需手动配数据库环境变量；Plausible/Rybbit/OpenPanel 要运维 ClickHouse；PostHog 官方直接劝退生产自托管。**超越点**：`install.sh` 一条命令 + 首次运行向导 + GeoIP 自动下载。
2. **"开源版"被刻意削弱是行业潜规则**：Plausible CE 无漏斗/SSO（官方承认有意落后）、PostHog 自托管无企业功能、Pirsch 自托管要企业许可。**超越点**：自托管给全功能（学 Rybbit/OpenPanel），用"全功能自托管"打口碑。
3. **SEO 是相对空白（仅海外开源圈，且已有先行者）**：13 家海外产品里只有 Matomo（付费插件）、Plausible（GSC 关键词）、Rybbit（GSC 集成）有实质布局；**站内 SEO 健康检查、外链监控、百度搜索资源平台——13 家全无**。但国内 51.la 已有 SEO 查询助手与蜘蛛监控（见§二国内竞品），**且本报告自己收录的 OpenGSC 已有"GSC 仪表盘 + 内置爬虫站内健康审计 + BYOK AI"先例**。**超越点修正**：P1 做"GSC + 百度搜索资源平台（待核验）+ 站内健康检查"三件套，差异化表述为具体功能组合（统计→诊断→建议→复检的证据链闭环），**不宣称"首个"**，优势待与 OpenGSC/51.la 同任务对照验证。
4. **AI 分析是相对空白（有范围、有证据）**：海外 13 家里 PostHog 有内置 AI、Simple Analytics 有 AI 问数（已核验）、OpenPanel 有异常洞察/AI 报告（opt-in）；国内 51.la/诸葛有 AI 助手。**单项 AI 能力并非空白**；13 家全无的是"统计→诊断→建议→**复检**"的证据链闭环（待同任务对照验证）。**超越点修正**：BYOK + opt-in 的"AI 日报解读 + 异常归因 + 优化建议" + **建议实施后复检闭环**（F-59），差异化是具体功能组合（证据链+复检），不是"首个"。数据边界诚实说明：**只有本地模型（Ollama）能做到数据不出内网；BYOK 是按管理员配置向提供商发送指定聚合数据**（见 F-56）——前者是 51.la 给不了的，后者不是。
5. **GA4 历史导入缺失**：Umami、Rybbit、PostHog 均无，迁移=从零开始；只有 Plausible/Matomo/Pirsch 有。**超越点**：P1 做 GA4 历史聚合报表导入，是最好的获客钩子（诚实口径：聚合级导入，不是"迁移零成本"，见 F-48）。
6. **中文支持与国内生态是集体盲区**：13 家无一家中文 UI 优先、无一家原生支持企业微信/Server酱通知、无一家接百度搜索资源平台。**超越点**：中文优先 + 企微/Server酱/Webhook。
7. **流量异常告警缺席**：Umami、Plausible、Fathom、Rybbit（部分）都没有流量突增/骤降告警和脚本掉线检测。**超越点**：P1 标配"异常告警 + 掉线检测"。
8. **轻量与功能完整之间的中间地带没人占**：GoatCounter/Ackee/Shynet 太简，PostHog/Matomo 太重。**超越点**：单机 Docker（一键装）+ PG 起步 + 功能对标 Umami v3 全量 = "轻量但完整"。
9. **升级稳定性差**：Umami v3 两次翻车被 HN 挂"不能 set-and-forget"。**超越点**：`upgrade.sh` 自动迁移（含升级前恢复点 + 兼容矩阵，见 F-66）+ 发版前回归测试；"升级不翻车"是目标不是保证，不写成卖点。
10. **AI 引荐（GEO）统计刚起步**：Fathom 只有分组且 70% ChatGPT 流量识别不了。**超越点**：P1 在"来源分析"里单列 AI 搜索引擎/爬虫渠道。

---

### 五、功能全景（按"采集 → 分析 → 分发 → 治理"四层）

#### 1. 数据采集层（tracker.js，一个 <5KB 的脚本）

**自动采集（加一行脚本即得）**：页面浏览 PV / 访客 UV / 会话 Session；停留时长（心跳 + 页面可见性 API）；滚动深度（25%/50%/75%/100%）；出站链接点击、文件下载（.pdf/.zip/.doc 等自动识别）；表单提交事件（可选）；404 页面追踪；Web Vitals（LCP / INP / CLS）；来源 Referrer、UTM 参数；终端（设备类型/浏览器/操作系统/屏幕分辨率/系统语言）；地理位置（IP → 国家/省市，离线 IP 库）；搜索引擎关键词（能从 referrer 解析到的部分）。

**手动埋点**：`track('signup', { plan: 'pro' })` 自定义事件 + 任意属性；收入事件 `trackRevenue(99)`；`identify('user_123')` 登录后关联匿名访客与账号。

**兼容性**：SPA 支持（监听 history.pushState / hashchange）；跨子域追踪；脚本自托管（放自己域名下，绕过广告拦截）；失败静默（sendBeacon + 降级，采集后端挂了不影响宿主站）。

**隐私合规（默认开启）**：无 Cookie 模式（每日轮换盐的 IP+UA 哈希）；IP 匿名化；尊重 Do Not Track；Consent Mode（未同意不采集）；数据保留策略（明细 N 天后自动删，只留聚合）；一键删除访客数据；机器人/爬虫过滤；可排除内部 IP。

#### 2. 看板与分析层

- **总览**：PV / UV / 会话数 / 跳出率 / 平均停留 / 转化数；趋势图（小时/天/周/月）；任意两段时间对比；一句话洞察
- **实时**：当前在线、过去 30 分钟事件流、实时 Top 页面/来源/地域
- **流量来源**：引荐域名、UTM 活动、渠道分组（搜索/社交/直接/外链/邮件/广告）；落地页 × 来源交叉
- **内容/页面**：Top 页面、入口页、出口页、单页停留、页面路径桑基图
- **受众**：设备/浏览器/OS/屏幕/语言分布；地域地图（国家→省市下钻）
- **行为与转化（P1）**：自定义事件报表 + 属性下钻；转化目标（事件型/页面型/时长型）；多步骤漏斗（可回看流失用户特征）；留存/同期群；任意维度交叉细分

#### 3. 报表、分享与告警

自定义报表保存；定时推送（日报/周报/月报 → 邮件 / 企业微信 / Server酱 / Webhook）；CSV 导出；公开只读分享链接（可选密码+有效期）；iframe 嵌入。**智能告警**：流量异常（突增/骤降超历史基线）、目标达成/漏斗骤降、脚本掉线检测（24 小时无数据提醒）。

#### 4. 多站点、团队与治理

多站点管理 + 分组；成员邀请与角色（管理员/分析师/只读）；操作审计日志；统计查询 API + 管理 API（Token 鉴权）；用量统计（事件数/存储占用）；WordPress 插件（P2）；**GA4 历史数据一键导入（P1，获客钩子）**；整站数据导出（JSON/CSV，防锁定）。

#### 5. SEO 模块（P1）

GSC API 集成（Search Analytics：查询词/点击/展示/平均排名/落地页）；百度搜索资源平台 API（国内站点，接口待核验，见 F-52）；站内 SEO 健康检查（自动爬：缺 title/description、重复 title、缺 h1、图片缺 alt、缺 canonical、缺 OG）；关键词排名监控（接 SerpAPI / DataForSEO，按量付费，用户自填 Key）；**与站内数据打通**：自然搜索流量 → 落地页表现 → 转化，一条链路看清"SEO 带来多少生意"（聚合口径，见 F-51）。注意：URL 检查/索引覆盖是另一组独立接口（URL Inspection API），P1 不承诺完整索引覆盖报告。

#### 6. AI 分析与优化建议（P1，BYOK）

后台设置页自填 API Key（OpenAI 兼容：OpenAI / DeepSeek / 通义 / 自建网关），Key 加密存储，可一键测试连通性。功能：智能日报解读（数字变人话）；异常归因（自动下钻渠道×页面×设备定位最大变化维度）；优化建议引擎（基于漏斗流失点、慢页面、高跳出页、SEO 问题生成整改清单）；自然语言问数（只读预聚合表 + 权限 guardrail，建议走 MCP 只读语义工具路线）。成本与隐私：token 用量统计、按站点开关、每月预算上限；发给 AI 的只是聚合数据；P2 可接 Ollama 本地模型。失败降级：没填 Key 或 AI 挂了，看板一切正常。

---

### 六、技术实现方案

#### 架构

```
被统计网站                白泽 Baize（Docker Compose 一键起）
┌──────────┐   HTTPS POST /api/collect (批量, gzip, sendBeacon)   ┌─────────────────┐
│tracker.js│ ──────────────────────────────────────────────────▶ │ 采集网关 (Fastify) │
└──────────┘                                                      │  - 签名校验/限流  │
                                                                  │  - 可信IP提取    │──▶ PG events表明细
                                                                  │  - 机器人/内网过滤│    (脱敏事件,同事务
                                                                  │  - 内存地域解析+HMAC│    持久化写入)
                                                                  │  (原始IP不出请求内存)         │
                                                                  └─────────────────┘         ▼
                                                                                    ┌─────────────────┐
                                                                                    │ 消费聚合 Worker  │
                                                                                    │ - 会话归因      │
                                                                                    │ - 预聚合 rollup │──▶ 预聚合表 (hourly/daily,
                                                                                    │ - HLL/t-digest  │    含HLL/t-digest摘要)
                                                                                    └─────────────────┘
                                                                                              │
                                                              ┌─────────────────┐               │ 查询只读聚合表，
                                                              │ 看板前端         │ ◀─────────────┘ 快；实时查明细近 N 分钟
                                                              │ React+Vite+TS   │
                                                              │ + ECharts       │──▶ SSE 实时推送
                                                              └─────────────────┘
```

#### 关键设计决策

0. **技术栈（2026-10-10 用户授权按"适合产品、提高质量"选定）**：**TypeScript 全栈 —— Fastify API + React/Vite 管理后台 + PostgreSQL + Redis，tracker 用 TS 编写、编译为原生 JS**，`packages/contracts` 共享事件 schema 与类型。选型理由（只讲产品）：① **减少 schema 漂移**：统计产品的核心质量是口径不出错，事件 schema 在 tracker↔采集网关↔Worker↔看板之间共享同一套 TS 类型 + zod 运行时校验，比跨语言手写两套校验少一类 bug。但类型共享**不是**数据正确性的全部——旧版 tracker、伪造请求、手工构造的 JSON 不会因为后端用了 TS 就自动安全，因此仍需：Fastify 路由级 zod 校验、协议版本号与旧版本兼容窗、统一指标测试样例（fixtures，人算一遍对一遍）；② **采集模型匹配**：采集网关是高并发小请求模型，Node 事件循环为此而生；③ **赛道语言**：Umami/Rybbit/OpenPanel 是 TS（Plausible 后端为 Elixir，属例外），本项目要走开源社区化路线（§十一），TS 的贡献者池和可比性是实在的资产；④ 分析重活由 PG（预聚合/HLL/t-digest）承担，不依赖 Python 数据生态。**自我纠正**：上一版我选了 FastAPI，理由是"已有项目沉淀、我交付快"——那是图自己省事，用户已纠正（"不一定要用 FastAPI，要用适合产品的"），按产品质量标准重判为 TS。在这一点上 Codex 的推荐是对的。
1. **采集与查询分离**：采集网关在**请求内存内**完成全部脱敏流水线——签名校验/限流 → 可信 IP 提取（清洗 Forwarded/X-Forwarded-*，仅信任登记的反代）→ 机器人/内部 IP 过滤 → **内存中地域解析**（mmdb）→ 隐私模式 HMAC → 脱敏事件**同事务写 PG events 表**（持久化，默认可靠路径），返回 202。**原始 IP 不出请求内存**：不进 events 表、不进日志/错误追踪。Worker 只消费脱敏事件，做会话归因与预聚合 rollup。Redis Stream 仅为 P2 规模化可选项，不做默认路径。
2. **存储分阶段**：MVP 用 PostgreSQL（`events` 明细表 + 预聚合表），设计目标是单机支撑日均百万事件（待压测验证）；规模化（P2）明细迁 ClickHouse，PG 只留元数据。不用 SQLite（高并发写瓶颈）。
3. **会话归因**：服务端按 `visitor_id + 30 分钟无活动超时` 划分，不依赖客户端。
4. **访客标识**：第一方 Cookie `_uid`（2 年，由 tracker.js 在第一方上下文读写）；用户主动删除后不自动恢复；隐私模式用 `HMAC(IP+UA, 每日盐)`。见 F-02。
5. **查询加速**：看板 95% 查询走预聚合表；实时与明细下钻查原始表（限近 N 分钟/分页）。借鉴：Matomo 日级归档上卷、Rybbit 物化视图+Redis 缓存。
6. **事件属性**：抄 Umami EAV 设计（data_key + string/number/date 三列 + data_type），自定义属性无需改表。
7. **脚本体积**：原生 JS，gzip < 5KB，`async/defer` 不阻塞渲染；配置全走 `data-*` 属性（抄 Umami）。
8. **实时看板**：SSE 推送，比 WebSocket 轻，比轮询省。
9. **AI 问数**：走 MCP 只读语义工具路线（Umami/OpenPanel/Rybbit/OpenGSC 四家一致的选择），不直连 Text-to-SQL。

#### 数据模型（核心表）

`sites`（站点：域名、时区、隐私配置）、`site_members`（成员角色）、`events`（明细：site_id, ts, visitor_id, session_id, type, path, referrer, utm_*, device/browser/os, country/city, event_name, props, revenue）、`event_data`（自定义事件属性 EAV：event_id, data_key, string/number/date_value, data_type）、`sessions`（entry/exit page, duration, bounced）、`identity_map`（visitor_id↔user_id 缝合）、`visitor_first_seen`（首访日，留存用）、`stats_hourly/daily`（预聚合）、`page_stats`（页面停留/读完率）、`page_vitals`（Web Vitals t-digest 摘要/日/页）、`path_stats`（路径转移矩阵）、`funnel_stats`、`retention`、`goal_stats`、`goals`、`funnels`、`alerts`、`reports`（报表 DSL）、`share_links`（分享 token/密码/有效期）、`notification_logs`、`audit_logs`、`api_tokens`、`ga_import`（GA4 导入历史）、`gsc_stats`（GSC 日数据）、`rank_history`（关键词排名）。

#### 部署

`docker compose up -d` 一条命令：app + postgres + redis；最低 1C2G 云服务器（估算，待压测验证）。`install.sh` 全自动安装；首次运行向导；GeoIP 自动下载；镜像发 GHCR，tag 发版 + `upgrade.sh` 自动迁移；Windows 本地开发用 `run.bat`；生产建议 Linux；每日 pg_dump 备份。

---

### 七、分期路线

| 阶段 | 内容 | 目标 |
|---|---|---|
| **P0 · MVP**（约 3–4 周） | tracker.js（PV/UV/会话/自动事件/UTM/设备/地域）+ 多站点 + 总览/实时/来源/页面/受众看板 + 自定义事件 + 转化目标 + 无 Cookie 模式 + CSV 导出 + 公开分享链接 + **开源基建（一键安装脚本、首次运行向导、AGPL-3.0 协议、中英 README/docs）** + Docker 部署 | 替换 Umami 基础版，先给自己的站用起来，仓库可公开 |
| **P1**（约 3 周） | 漏斗/留存/路径桑基图、Web Vitals 看板、告警（异常/目标达成/掉线检测）、定时报表（邮件/企微/Server酱）、团队角色、GA4 历史聚合报表导入、MCP 只读 server、**SEO 三件套（GSC+百度[接口待核验]+站内健康检查）、AI 模块（BYOK：日报解读/异常归因/优化建议/建议复检闭环）、AI 引荐（GEO）渠道单列** | 达到 Plausible 付费版 + 部分 PostHog 能力，差异化是统计→诊断→建议→复检的证据链组合（待对照验证） |
| **P2**（按需） | 明细迁 ClickHouse、会话回放/热力图（隐私评审后，仍免费）、A/B 实验归因、微信小程序 SDK、WordPress 插件、SSO（企业微信扫码登录）、多语言、Ollama 本地模型 | 后续增强，全部免费 |

> 以上排期（约 3–4 周 / 约 3 周）均为**估算**，不是已验证保证；实际以垂直样例校准后的工作量为准。

**P0 明确不做**：会话回放/热力图（重；Umami Cloud 回放为付费档能力——这是**云套餐边界**，不代表其开源自托管版；自托管回放见官方回放文档，需自配存储。事件模型预留字段即可）；PostHog 式全家桶（特性开关/实验/问卷/CDP）；多语言 UI（P0 只简体中文 + 英文 README）。

---

### 八、差异化总结（为什么不直接部署 Umami/Plausible）

1. 中文 UI 与中文文档优先，国产 IP 库省市粒度更好
2. 通知渠道贴国内：企业微信/Server酱/Webhook
3. GA4 历史聚合报表导入（聚合级，见 F-48 边界说明）——Umami/Rybbit/PostHog 都没有（仅 Plausible/Matomo/Pirsch 有）
4. AGPL 主体 + tracker 单独 MIT：AGPL 允许合规商用，要求网络服务公开源码；tracker 单独 MIT 让站长嵌入无顾虑
5. 一键安装 + 开箱即用做到极致："复制一条命令，三分钟看到自己网站的数据"
6. **SEO + AI 是相对空白区（海外开源圈）**：13 家海外竞品中 Matomo/Plausible/Rybbit 只有零散 SEO 布局，AI 多为 MCP 或简单问数；我们把"统计 → 诊断 → 给建议 → 复检"做进同一个产品，差异化是**证据链闭环这个具体功能组合**（OpenGSC 有先行先例，不宣称"首个"），优势待对照验证（国内 51.la 已有，见§二）
7. **对国内 SaaS 的降维差**：51.la/百度统计/U-Web 是闭源 SaaS（数据在其服务器、有额度限制、无 SLA）；神策/GrowingIO 的私有化又贵又重。白泽 = 开源自托管 + 数据自主 + 无产品额度限制 + 一键安装（目标 3 分钟，待验证），占的是"它们够不着、51.la 给不了"的中间地带

---

### 九、决策记录

| 日期 | 事项 | 决定 |
|---|---|---|
| 2026-10-10 | 产品定位 | 开源、自托管、一键安装开箱即用 |
| 2026-10-10 | 开源协议 | 主体 AGPL-3.0；tracker.js 单独 MIT |
| 2026-10-10 | 产品名/仓库 | 白泽 Baize；`bocmiao/baize-analytics`（待建） |
| 2026-10-10 | SEO + AI | 加入，P1；AI 走后台 BYOK（OpenAI 兼容 Key，加密存储） |
| 2026-10-10 | 是否写代码 | 用户叫停："先不要写代码，我只要报告"——当前以本报告为准，开工待确认 |
| 2026-10-10 | 国内竞品纳入报告 | 51.la/百度统计/友盟U-Web/神策/GrowingIO 调研完成并入§二；"SEO+AI空白"修正为仅海外开源圈成立；白泽对国内竞品的差异化定为"开源自托管+数据自主+无额度+一键装" |
| 2026-10-10 | 功能详细设计 | 66 项功能（F-01~F-66）逐项实现分析并入§十 |
| 2026-10-10 | 报告审计补充 | 用户要求检查报告：补上 66 项 P0/P1/P2 标注（写入时丢失）、修正 install.sh 占位 URL、F-12 改 P1（与§七分期一致）、补全数据模型表、新增§十一风险与应对+P2 展望、附录移至文末并补充国内竞品来源 |
| 2026-10-10 | 免费策略 | **永久免费**：不设任何收费功能门槛；SSO/审计/回放/热力图/AI 高级能力全部免费，按需开关只管理资源、隐私与外部配置（删除此前的 open-core 设想） |
| 2026-10-10 | 技术栈 | 用户授权按"适合产品、提高质量"选择（明确不一定用 FastAPI）：**TypeScript 全栈（Fastify + React/Vite + PostgreSQL + Redis，tracker 用 TS 编译为原生 JS，contracts 共享包）**；理由：端到端类型防 schema 漂移（统计口径正确性）、采集高并发模型匹配 Node、赛道语言利于开源社区化。上一版曾误选 FastAPI（图已有沉淀），经用户纠正后重判 |
| 2026-10-10 | 第三方审计修正（Codex） | 采纳 Codex 纠错：F-02/F-04/F-18/F-20/F-46/F-48/F-66 重写、F-12 官方库、SSRF 防护、技术栈 TS 推荐、竞品事实勘误（Simple AI、PostHog 资源、Umami 回放）、成本算术与营销措辞收紧；反驳点：tracker MIT 被写成"待审建议"（用户早已拍板，文档过时）、Rybbit Web Vitals 被标 Cloud only 与官方 FAQ（自托管可启用）不符、51.la 回放为官网宣称待实测 |
| 2026-10-10 | 独立开发 | **用户已定**：独立平台 + 复用组件，不 fork 任何整平台；可复用零件：rrweb（回放）、Google web-vitals（性能采集）、Lighthouse/Unlighthouse（SEO 审计）、UA 解析等，均为 MIT/Apache 许可，列入 SBOM 并做版本审计 |
| 2026-10-10 | v3 收尾 + 实现层规格 | 修完复核第 2 轮 4 点：GeoIP 统一到网关请求内存内脱敏流水线（架构图+§六同步）；F-46 补 tombstone 独立保留/恢复重放/缓存失效/HLL 重建说明；F-56 主密钥改安全隔离要求（不强制物理分盘）；清 4 处旧结论（§二/§四"空白"表述、"升级不翻车"卖点、决策记录独立开发记为已定）。随后停止扩写报告，产出 4 份实现层规格：事件协议 v1、数据库结构 v1、任务处理流程 v1、指标测试样例 v1（8 组手工期望值 fixture） |
| 2026-10-10 | v3 全文一致性修订（外部复核） | 13 点全部验真并修：TS 统一（F-53→undici+cheerio、F-61/F-66→编号 SQL 迁移、F-56→AES-256-GCM+Ollama 受控例外；纠正"Plausible 全是 TS"，其后端为 Elixir）；TS 类型共享降调（+zod 运行时校验/协议版本/fixtures）；隐私双模式口径（每日轮换模式不支持跨日去重与留存）；F-12 改存 t-digest 摘要；采集默认可靠路径定为 PG outbox；删除"迁移零成本"/"开源阵营首个"/"Umami $200/月"表述；BYOK 与本地推理的数据边界拆开；GSC 去掉索引覆盖率承诺、百度标待核验；F-59 补建议复检闭环；F-37 改 CSP frame-ancestors；F-46 补 tombstone+备份重放；F-11 改内存解析后丢弃；1C2G 与排期标估算 |

---

### 十、功能详细设计：逐项实现分析

> 编号 F-01 起，按模块分组，标注 P0/P1/P2。每项含：做什么、怎么实现（采集端/服务端/存储/查询）、注意点。P0 = MVP 必备，P1 = 约 3 周，P2 = 按需。

#### 模块 A：数据采集（tracker.js + POST /api/collect）

**F-01 页面浏览（PV）追踪【P0】**
- 做什么：记录每一次页面访问，是全部统计的地基。
- 采集端：脚本加载后立即发一次 pageview；SPA 监听 history.pushState/replaceState + popstate + hashchange，路由变化去抖 100ms 后再发（防重复）。
- 服务端：POST /api/collect 收批量 payload `[{type:'pageview',...}]`；校验 website_id；按站点 Redis 滑动窗口限流（如每站点每分钟 10 万次）。
- 存储：events 明细表（type='pageview'）。
- 注意：prerender 预渲染不上报；iframe 嵌套默认不上报（data-allow-iframe 开启才报）。

**F-02 访客标识【P0】**
- 做什么：跨访问识别同一访客，算 UV 的基础。
- 采集端：tracker.js 运行在被统计网站的第一方上下文中，由 JS 自己通过 `document.cookie` 读写第一方 Cookie `_baize_uid`（2 年，SameSite=Lax）。**注意**：采集接口在跨域时通过响应 `Set-Cookie` 无法为被统计网站设置第一方 Cookie（只会成为第三方 Cookie，默认被浏览器拦截），因此 uid 必须由采集端 JS 生成与维护，服务端只做校验与兜底。
- 服务端：收到无 uid 的事件时生成 UUIDv7 并在**同域**场景下可 Set-Cookie；隐私模式（站点级开关）：服务端算 HMAC_SHA256(IP + UA + 当日 salt)，salt 每日轮换、旧 salt 保留 1 天，原始 IP 不入库。
- 注意：用户主动删除 Cookie 后，**不得**从 localStorage 自动恢复旧标识（evercookie 式行为属暗模式）。
- **两种标识模式，口径严格对应**（本站点级二选一，不可混用）：
  - **标准模式**：稳定的 `_baize_uid`（2 年 Cookie）→ 支持跨日 UV 去重（HLL）、留存/同期群（F-30）、回访识别。
  - **隐私模式**（每日轮换 salt 的 HMAC）：访客标识每天更换，昨天和今天的两个哈希**无法确认为同一人** → 仅提供"每日去重访客"口径；**跨日 UV 去重、留存/同期群、回访分析在此模式下不支持**，看板对应模块明确标注"该模式不支持"，不强行估算。文档诚实说明（抄 Mallard PRIVACY.md 写法）。

**F-03 会话划分【P0】**
- 做什么：把 pageview 串成会话，算会话数/跳出率/平均停留。
- 实现：Worker 消费队列时按 (site_id, visitor_id) 在 Redis 维护"最后活动时间"；距上次事件 > 30 分钟（可配置）则开新 session（UUIDv7）；sessions 表存 entry_page/exit_page/page_count/duration/bounced（单页且 <10s 记跳出）。
- 查询：会话指标全部走预聚合表，不扫明细。

**F-04 停留时长【P0】**
- 做什么：页面前台可见时长累计（秒）。不称为"真实阅读时长"——我们只能证明页面可见，不能证明人在阅读。
- 采集端：每 15s 发心跳，**每个心跳只覆盖其前 15s 内页面可见的子区间**（用 visibilitychange 时间戳切片）；页面卸载用 sendBeacon 补发最后一段。
- 服务端：heartbeat 只更新会话 last_active；页面停留 = 各可见子区间求和，写入 page_stats。首段（首个心跳前）按"页面可见且不足 15s"计入，不做外推。
- 注意：切后台/最小化/锁屏的时间不计入；心跳丢失的区间不估算、记为未知。

**F-05 滚动深度【P0】**
- 做什么：25%/50%/75%/100% 四档，衡量内容消费。
- 采集端：scroll 监听（节流 200ms），计算 (scrollY+innerHeight)/docHeight，首次达到各档位发一次（props.depth=50）。
- 服务端：存为事件；聚合"读完率" = 100% 档 PV / 总 PV。
- 注意：无限滚动页以初始视口为准，文档注明口径。

**F-06 出站链接点击【P0】**
- 做什么：自动记录跳往外部域名的点击。
- 采集端：click 捕获阶段找最近 <a>；hostname 不同则 sendBeacon 发 click 事件（props 含 url、链接文字前 50 字）；不阻止跳转、不延迟。
- 注意：data-baize-ignore 可排除特定链接。

**F-07 文件下载【P0】**
- 做什么：pdf/zip/doc/xlsx/mp4 等后缀点击自动记为下载。
- 采集端：同 F-06 逻辑，正则匹配后缀（data-download-exts 可自定义）；事件名 'download'。
- 看板："内容分析"单列下载 Top。

**F-08 404 追踪【P0】**
- 做什么：发现死链与错误引流。
- 采集端：document.title 匹配 /404|not found|页面不存在/i，或 <body data-baize-404> 标记，pageview 带 props.status=404。
- 看板：单独"404 页面"报表（URL × 来源 × 次数），可导出修链清单。

**F-09 UTM/Referrer/渠道【P0】**
- 采集端：上报 document.referrer + location.search 的 utm_*（campaign/source/medium/term/content）+ gclid/fbclid（标记广告点击）。
- 服务端：渠道分组规则（可配置，默认）：搜索引擎（google/bing/baidu/so/360/sm 等域名匹配）、社交（微信/微博/知乎/抖音/小红书/twitter/facebook…）、直接（空 referrer）、外链、邮件（utm_medium=email）。
- 存储：events 表 utm_* 列 + channel 列（建索引）。

**F-10 终端信息采集【P0】**
- 采集端：navigator.userAgent 发给服务端；另采 screen 宽高、devicePixelRatio、navigator.language。
- 服务端：ua-parser 解析 browser/os/device；device_type 按 UA+屏幕宽度综合判 mobile/tablet/desktop；解析失败记 unknown 不丢事件。

**F-11 地理位置【P0】**
- 实现：服务端收到事件后，**仅在内存中用原始 IP 查离线 mmdb**（MaxMind GeoLite2-City）得国家/城市，随后按策略丢弃或截断 IP 入库；**原始 IP 不进日志、不进错误追踪**。注意：截断后的 IP 不再用于二次定位（截断可能改变定位结果）；查不到记 unknown。
- 部署：需 MAXMIND_LICENSE_KEY（免费注册），启动时下载 + sha256 校验；无 key 降级 unknown，看板横幅提示配置方法。

**F-12 Web Vitals【P1】**
- 采集端：**优先采用 Google 官方 `web-vitals` 库**（attribution 构建），指标就绪或页面卸载时上报 vitals 事件；不要为凑 tracker 体积手写简化算法。Web Vitals 采集做成**按需加载的独立模块**，默认脚本不包含（保 F-19 体积目标）。
- 服务端：page_vitals 表按（站点、页面、日）存 **t-digest 分位摘要**（不是只存一个 p75 数字）；看板 p75/p90 从摘要实时计算，按 Google 阈值三色展示（好/需改进/差）。
- 注意：采样率可配（默认 100%，大流量站可降到 10%）；跨周期分位数**不能按日 p75 直接平均**——月 p75 通过**合并多日的 t-digest 摘要**重算。只存每日 p75 数字的方案无法恢复月分布，已废弃。

**F-13 自定义事件【P0】**
- API：`baize.track('signup', { plan:'pro'})`；支持 `data-baize-event="signup"` 声明式点击自动发。
- 存储：抄 Umami EAV：event_data 表（event_id, data_key, string_value/number_value/date_value, data_type），单事件属性 ≤20 个防爆。
- 查询：事件列表 + 按属性分组 Top；时间范围限 ≤90 天。

**F-14 收入事件【P0】**
- `baize.trackRevenue(99.0, { currency:'CNY', order_id})`；服务端汇总 revenue。
- 看板：收入趋势、按渠道/页面的末次点击收入归因。
- 注意：前端上报的金额是**业务方自述数据**，不能直接当作已支付事实；对账口径以业务系统为准，文档明确。

**F-15 用户标识 identify【P0】**
- `baize.identify('user_123')`（登录后调用）；服务端 identity_map（visitor_id↔user_id），历史会话缝合到 user_id（抄 Umami session_link）。
- 看板：登录用户行为路径、注册→付费转化。

**F-16 表单提交【P0】**
- 采集端：form submit 监听（data-baize-form 开启才生效）；只记 form id/action，不记字段值。默认关闭，文档强调隐私。

**F-17 机器人过滤【P0】**
- 服务端：UA 匹配自维护爬虫库；行为规则（1s 内 >20 请求等）记 bot；bot 流量单独计数、不计入正式指标。
- 采集端：navigator.webdriver 为 true 直接不上报。
- AI 爬虫（GPTBot 等）单独标记，供 P1 的 GEO 渠道用。

**F-18 IP 匿名化 / DNT / Consent【P0】**
- IP：入库前 IPv4 置零末段、IPv6 取 /64，原始 IP 永不落盘。
- DNT：navigator.doNotTrack==='1' 则整站不上报。
- Consent：data-consent-required 模式下，**未调用 baize.grantConsent() 前：不生成/不发送追踪标识，不采集、不缓存任何行为记录**（"未同意不采集"字面执行）。用户撤回同意时：停止采集、清空内存队列中未发送的事件。同意状态变更记审计日志。

**F-19 脚本自托管与体积【P0】**
- 构建：单文件 IIFE 零依赖；多变体（完整版/极简版）；PR 自动检查 gzip 体积（预算 5KB）。
- 自托管：文档给 nginx 配置片段，站长可放自己域名/CDN 下绕过广告拦截。
- 配置全走 data-* 属性（data-website-id 必填）；data-before-send 钩子允许清洗 payload（如砍 query 参数）。

**F-20 批量上报与可靠性【P0】**
- 采集端：事件入内存队列，2s 或满 10 条批量发；每条事件带客户端生成的固定 `event_id`（UUIDv7）；sendBeacon 优先（页面卸载场景），失败回退 fetch keepalive；后端不可达指数退避重试 3 次后丢弃（console.debug，绝不抛错影响宿主站）。
- 服务端：**持久化接收（默认可靠路径）**——/api/collect 校验后**同事务写 PG outbox 表**再返回 202；以 `event_id` 做幂等去重（重复投递直接返回已接受，去重窗口 ≥ 最大重试窗）；Worker 用短事务 SKIP LOCKED 认领，失败进死信队列，人工可查可重放。确认语义：202 = 已持久化，可恢复；内存只做有界削峰缓冲，不做可靠性承诺。P2 规模化时 outbox 可迁 Redis Stream，语义不变。
- 注意：sendBeacon 返回 true 只代表浏览器接受排队，**不代表服务端已保存**；文档明确写清该语义，不承诺"必达"。

#### 模块 B：看板与分析

**F-21 总览 Dashboard【P0】**
- 指标卡：PV/UV/会话/跳出率/平均停留/转化数（选定周期）；趋势图（ECharts，按小时/天自动粒度）；对比模式（本周 vs 上周，同环比 %）。
- 查询：全部走 stats_daily/hourly 预聚合；对比 = 两次聚合查询。
- 注意：**日 UV 不能直接相加为月 UV**（标准模式下跨天去重用 HLL 草图估算；隐私每日轮换模式下跨日去重不支持，见 F-02）；一句话洞察：规则模板生成（P1 换 AI 版）。

**F-22 实时看板【P0】**
- 当前在线（近 5 分钟有心跳的去重访客）；30 分钟事件流（SSE 推送：时间/页面/来源/地域/设备）；实时 Top 页面/来源。
- 实现：SSE 端点 /api/realtime/stream；明细查询限定近 30 分钟 + Redis 在线集合。

**F-23 来源分析【P0】**
- 引荐域名 Top、UTM campaign/source/medium 效果表、渠道分组；支持"渠道 × 落地页"交叉。
- 实现：预聚合表按 channel/referrer/utm 建维度。

**F-24 页面分析【P0】**
- Top 页面（PV/UV/平均停留/跳出率）、入口页、出口页；单页面详情（趋势+来源+设备分布）。
- 入口 = 会话首个 pageview，出口 = 末个（sessions 表直接有）。

**F-25 路径分析（桑基图）【P1】**
- 用户 A→B 页面流向 Top 20，ECharts sankey。
- 实现：基于会话 pageview 序列，抽样 10% 会话离线算转移矩阵（定时任务），存 path_stats。

**F-26 受众分析【P0】**
- 设备/浏览器/OS/屏幕/语言分布；地域：中国地图下钻到省（ECharts + 内置 china.json）。
- 实现：预聚合维度查询。

**F-27 自定义事件报表【P0】**
- 事件列表（触发次数/人数/趋势）；按属性分组 Top（如 signup 按 plan）。
- 查询：events 明细按 event_name + 时间过滤，属性走 event_data join；限 90 天。

**F-28 转化目标【P0】**
- 三种：事件型（event_name=xxx）、页面型（到达 /thank-you）、时长型（会话 > N 分钟）；转化数/转化率趋势；按渠道分组。
- 实现：goals 表存定义；每小时定时任务算 goal_stats（避免实时扫明细）。

**F-29 漏斗分析【P1】**
- 多步骤（如 首页→商品页→下单→支付），每步转化率/流失数/流失用户特征（Top 来源/设备）。
- 实现：按会话 pageview/event 序列有序匹配；支持严格/宽松顺序；抽样 + 预计算 funnel_stats 日表。

**F-30 留存/同期群【P1】**
- 按首访日 Cohort 的 N 日回访率热力表。
- 实现：visitor_first_seen 表 × 回访标记，日任务算 retention 表。
- 注意：仅标准标识模式可用；隐私每日轮换模式下不支持（见 F-02），UI 明确标注。

**F-31 搜索关键词【P0/P1】**
- P0：referrer 解析到的少量关键词 + 搜索引擎维度。
- P1：GSC API 接入后升级为"查询词 × 点击 × 排名 × 落地页"报表。

**F-32 AI 引荐（GEO）渠道【P1】**
- 来源分析单列"AI 搜索/助手"：识别 ChatGPT/Claude/豆包/文心等 referrer 与 UA 特征；AI 爬虫单独标记。
- 实现：ai_sources 规则表（F-17 机器人库子集）；文档诚实说明识别率上限（Fathom 70% 无 referrer 流量只能记 Direct 的教训）。

#### 模块 C：报表、分享与告警

**F-33 自定义报表保存【P0】**
- 当前筛选（站点/时间/渠道/页面）存为模板一键重看；reports 表存查询 DSL（JSON）。

**F-34 定时推送【P1】**
- 日/周/月报 → 邮件（SMTP 自配）/企业微信 webhook/Server酱/Webhook；服务端模板渲染 HTML（指标卡 + Top 变化）。
- 实现：定时任务（BullMQ/Redis 队列，替代 APScheduler 方案）；失败重试 3 次；notification_logs 存发送记录。

**F-35 CSV 导出【P0】**
- 明细与汇总都可导；大导出走后台任务生成文件 + 下载链接（防超时）；单次上限 10 万行。

**F-36 公开分享链接【P0】**
- 只读看板链接：token（随机 32 位）+ 可选密码 + 有效期；share_links 表；可随时吊销；分享页不暴露站点配置与原始明细。

**F-37 iframe 嵌入【P1】**
- 单图表嵌入自家后台：/embed/chart?type=top-pages&token=只读token；嵌入域名白名单用 **CSP `frame-ancestors`** 实现（X-Frame-Options 只有 DENY/SAMEORIGIN，做不了任意域名白名单）。

**F-38 流量异常告警【P1】**
- 规则：当前小时 PV/UV vs 过去 28 天同小时均值，偏离 ±50%（可配）触发；连续 2 小时异常才发（防抖）；通知渠道同 F-34；支持一键静默。
- 实现：每小时任务算 z-score。

**F-39 目标达成/漏斗骤降告警【P1】**
- 目标转化数达阈值通知；漏斗某步转化率单日跌超 30% 通知。

**F-40 脚本掉线检测【P1】**
- 站点 24h 无新事件 → 提醒"检查追踪代码是否被删"；实现：定时扫描 sites.last_event_at。

#### 模块 D：多站点、团队与治理

**F-41 多站点管理 + 分组【P0】**
- sites 表（name/domain/timezone/privacy_config）；分组 tags；每站点独立 website_id（UUID）与追踪代码片段生成页。

**F-42 成员与角色【P0/P1】**
- P1：邮箱邀请链接 + 角色（管理员/分析师/只读），site_members 行级权限。

**F-43 审计日志【P1】**
- 谁何时导出数据/删站点/改配置：audit_logs 表，保留 180 天。

**F-44 API【P0/P1】**
- 统计查询 API（/api/v1/stats/*，Token 鉴权 + 限流）；管理 API（站点/目标 CRUD）；Token 可吊销、设过期。
- P1 加 MCP 只读 server（给 AI 助手的语义工具，抄 Rybbit/OpenGSC）。

**F-45 用量统计 + 保留策略【P0】**
- 每站点事件数/存储占用看板；明细默认保留 365 天（可配）后自动删、只留聚合；定时清理任务。

**F-46 一键删除访客数据【P0】**
- GDPR 被遗忘权：输入 visitor_id/user_id → 删除其 events/sessions 明细，**以及** event_data（其事件的属性）、identity_map（其缝合关系）、visitor_first_seen（其首访记录）；聚合表处理：**UV、漏斗、留存、分位数不能按比例扣减**——可重算的聚合（计数类）触发重算任务，不可精确重算的（如 HLL 基数、t-digest 分位数）在文档中明确标注受影响范围与近似处理方式。
- **防重建**：删除期间，被删标识进入 tombstone 表；Worker 处理到该标识的新事件/重算任务时直接丢弃，不再写回派生结果。
- **删除记录的独立保留与恢复重放**：tombstone 表**每日导出到数据库备份之外的 append-only 存储**（本地受限文件，随备份策略异地一份）；从旧备份恢复数据库后，按固定流程：① 重放 tombstone 删除记录（重新删除"复活"的数据）② 清相关缓存（Redis/物化视图）③ 旧任务按 generation 失效（过期 worker 不能覆盖）④ 再重新开放查询与聚合任务。恢复演练必须覆盖该流程。
- **重算说明**："HLL/t-digest 不能直接扣除成员"不等于"不能重算"——在原始明细保留期内的，重建聚合（从 events 重放建 HLL/t-digest）；超过保留期的，在文档/UI 明确标注近似处理边界。原始明细超过保留期已删除的，仅能删除剩余可识别数据，边界在 UI 明确告知。操作记审计。

**F-47 排除内部 IP【P0】**
- 站点级 IP 段黑名单（支持 CIDR）；服务端过滤丢弃。

**F-48 GA4 历史聚合报表导入【P1】**
- 用户授权 Google 账号 → GA4 Data API 拉历史**聚合报表**（按日/周的 PV/UV/会话/来源 Top）→ ga_import 表；看板"历史对比"叠加虚线。
- 边界（诚实说明）：Data API 只能读到聚合报表，**不能还原完整事件流、访客身份与漏斗历史**；因此这是"历史聚合报表导入"，不是"迁移零成本"。导入器必须说明来源、覆盖时间、丢失字段与可用分析范围。
- 价值：仍是获客钩子（Plausible/Matomo/Pirsch 有，Umami/Rybbit/PostHog 无）。

**F-49 整站数据导出【P1】**
- JSON/CSV 全量导出（明细+聚合+配置）；防锁定卖点。

**F-50 Cookie 同意横幅【P2】**
- 可选轻量横幅组件（配合 F-18 Consent Mode）；P0 文档先写清楚，P2 再做。

#### 模块 E：SEO（P1）

**F-51 GSC 集成【P1】**
- OAuth 接 Google → 拉 Search Analytics（查询词/点击/展示/排名/落地页）→ gsc_stats 日表；看板"搜索"页。
- 注意：GSC 数据延迟 2–3 天，UI 明确标注；**GSC 查询词是聚合数据，不能关联到具体访客或订单**，与站内转化的打通只做聚合口径（如"某落地页的搜索点击 vs 其转化数"），不伪造因果。

**F-52 百度搜索资源平台【P1】**
- 官方 API（需站点验证）拉流量与关键词数据；国内独一份（13 家海外全无）。
- 注意：本轮未找到可直接引用的官方 API 接口文档，"流量/关键词 API"的具体端点与配额**待核验**，P1 立项前先做接口可行性验证。

**F-53 站内 SEO 健康检查【P1】**
- 自研轻量爬虫（定时，尊重 robots.txt）：缺 title/description、重复 title、缺 h1、图片缺 alt、缺 canonical、缺 OG/视口；输出问题清单 + 修复优先级。
- 实现：独立 worker，undici 抓 HTML + cheerio 解析；大站限速（1 req/2s）防被封；爬虫只抓用户授权的域名，**SSRF 防护**（内网地址、云元数据端点拦截，重定向跟踪限制）。

**F-54 关键词排名监控【P1】**
- 用户自填 SERP API Key（SerpAPI/DataForSEO，抄 SerpBear 的多源抽象层 + 自备代理）；核心词每日查排名 → rank_history；大波动告警。
- 注意：Google 封爬虫是常态，数据源必须可插拔；费用用户自理，文档写清。

**F-55 SEO→转化打通【P1】**
- 自然搜索流量 → 落地页 → 目标转化一条链路；报表直接回答"SEO 带来了多少注册/订单"。

#### 模块 F：AI（P1，BYOK）

**F-56 BYOK 设置【P1】**
- 后台设置页填 OpenAI 兼容 Key（OpenAI/DeepSeek/通义/自建网关）；Key 经 HTTPS 提交后只在服务端用 **AES-256-GCM（node:crypto）** 加密存 DB，随机 nonce + key_version；主密钥由安装器生成、存**独立受限文件**（0600，仅 app 用户可读）。安全隔离要求：主密钥**不写入数据库、不进镜像/日志/错误追踪**、与数据库备份**分开保护**（独立密封备份）；支持轮换（key_version 递增）与灾难恢复（需人工介入解密恢复包）。单机一键部署**不强制物理分盘**，分盘可作加强选项。
- 安全：自定义模型 URL 只允许管理员配置，请求前做 **SSRF 防护**（默认禁止内网 IP/元数据地址、DNS 重绑定校验、超时与大小限制）。**受控例外**：本地模型（如 Ollama）需管理员在后台**明确登记**目标地址与窄网段例外，该例外仅用于模型调用，不复用于站内爬虫等其他出口。

**F-57 智能日报解读【P1】**
- 定时任务把聚合指标喂给模型 → 生成中文解读（"UV 环比+23%，增量 8 成来自微信；支付页转化掉 12%，建议优先检查"）；只发聚合数据，不含原始 IP/明细。

**F-58 异常归因【P1】**
- F-38 触发后自动下钻（渠道×页面×设备）找最大变化维度 → AI 生成可能原因说明。

**F-59 优化建议引擎【P1】**
- 输入：漏斗流失点、慢页面（Web Vitals 差）、高跳出入口页、SEO 问题清单 → 输出可执行整改清单（按预期收益排序）。每条建议带：evidence_id（关联事实快照）、可能原因与**置信度**（证据不足时明确说"证据不足"，不硬给结论）。
- **建议实施后验证（复检闭环）**：建议状态机 = 新发现 → 已接受 → 处理中 → 已修复待复检 → 已验证 / 误报；记录实施日期；SEO 类建议触发复扫（F-53）；效果对比 = 实施前后同口径指标对照，并**注明干扰因素**（流量波动、季节性、同期其他改动）；不能仅凭前后变化宣布"优化有效"。
- 价值：回答"改了以后有没有用"，这是与 OpenGSC/51.la 拉开差距的具体功能点（待对照验证）。

**F-60 自然语言问数【P1】**
- "上周微信来的 iOS 用户转化率多少？"→ 走 MCP 只读工具（F-44）→ 模型组装查询 → 返回数字+图表；guardrail：只能查有权限站点、只读聚合。

#### 模块 G：开源基建与体验

**F-61 一键安装【P0】**
- install.sh：检查 Docker → 生成随机密钥 → docker compose pull → 初始化 DB（`pnpm db:migrate`，编号 SQL 迁移）→ 打印地址；幂等可重跑。

**F-62 首次运行向导【P0】**
- /setup：建管理员 → 加第一个站点 → 复制追踪代码 → 可选一键导入演示数据；完成后锁定 setup（防重复）。

**F-63 GeoIP 自动下载【P0】**
- 启动任务用 MAXMIND_LICENSE_KEY 下载 GeoLite2-City.mmdb + sha256 校验；失败降级 unknown，看板横幅提示配置方法。

**F-64 产品落地页【P0】**
- `/` 默认产品落地页（Hero+功能+三步上手+CTA）；登录/注册只做导航入口（既定规则：不许打开就是登录页）。

**F-65 中英 README/docs【P0】**
- README：截图/GIF 占位、一键安装、5 分钟上手、架构图、功能矩阵；docs/：部署、反代、升级、迁移、API、二次开发。

**F-66 upgrade.sh【P0】**
- 流程：升级前自动创建恢复点（DB 快照 + 卷备份）→ 拉新镜像 → 执行编号 SQL 迁移（`pnpm db:migrate`，**迁移锁**防多实例并发）→ 健康检查 → 失败按**恢复步骤**回滚（恢复 DB 快照 + 切回旧镜像）。
- 注意：数据库结构变化后旧程序可能无法读取新数据，**"换回旧镜像"不等于回滚**；必须有兼容矩阵（哪个 APP 版本兼容哪个 schema 版本）、升级前演练文档。"升级不翻车"是目标不是保证，README 如实写（Umami v3 翻车是反面教材）。

> **P2 展望（未逐项设计，见§七）**：明细迁 ClickHouse、会话回放/热力图（需隐私评审）、A/B 实验归因、微信小程序 SDK、WordPress 插件、SSO（企业微信扫码登录）、多语言 UI、Ollama 本地模型。启动 P2 时再逐项拆 F 编号。

---

### 十一、风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 广告拦截/隐私插件屏蔽 tracker | 数据丢失 10–20%（行业常态） | 脚本自托管到第一方域名（F-19）；文档诚实说明口径，不承诺 100% |
| GeoIP 需自备 MaxMind Key | 新手卡在地域功能 | 向导内给注册链接 + 一键填入；无 key 降级 unknown（F-63） |
| GSC/百度 API 授权与配额 | P1 排期风险 | 单独发版，文档写清前置条件（F-51/F-52） |
| SERP 排名监控费用 | 用户预期差 | BYOK + 多源抽象，文档明示"费用自理"（F-54） |
| AGPL 法务顾虑 | 部分企业用户绕道 | tracker 单独 MIT；README 写清协议边界 |
| 升级翻车（Umami v3 教训） | 口碑崩盘 | upgrade.sh 自动迁移 + 发版前回归测试 + changelog |
| 数据量增长撑爆单机 | 性能/成本 | 保留策略默认 365 天（F-45）+ 存储水位告警；P2 迁 ClickHouse |
| 单人维护可持续性 | 长期迭代乏力 | 开源社区化：CONTRIBUTING + issue 模板 + 插件机制预留 |

**运营成本估算（自托管，约数，2026-10-10 汇率口径）**：1C2G 云服务器约 ¥60–100/月，即约 **¥720–1200/年**；域名另计（Let's Encrypt 证书免费，但域名本身不免费）；GeoIP/GSC 免费（SERP 按量自费）。对比同等量级 Plausible 云版 $9–$99/月（约 ¥64–¥700/月）。**诚实结论**：自托管赢在**控制权**（数据自主、无产品配额、无功能阉割），不必然更便宜——1C2G ¥60–100/月其实和 Plausible 最低档差不多，省的是被额度绑架和功能阉割的隐性成本，不是绝对价格。打动站长的硬数字是"无额度限制 + 数据自主"，不是"更便宜"。

---

### 附录：数据来源说明

- 查询日期统一为 2026-10-10；star 数为当日 GitHub 仓库页数值，报告中均按"约数、截至 2026-10"表述。
- 一手来源：各产品官网（umami.is、plausible.io、matomo.org、posthog.com、rybbit.com、openpanel.dev、fathomanalytics.com、simpleanalytics.com、pirsch.io）pricing/features/docs 页；GitHub 仓库 README、releases、schema.prisma、tracker/ARCHITECTURE.md、DPA 文档。
- 国内竞品来源：51.la 官网（v6.51.la 产品定价页/隐私政策）、百度统计帮助文档、友盟官网、神策/GrowingIO 官网及行业媒体（CSDN/IT之家/中关村在线）。
- 二手交叉：plerdy.com（2026-10）、dev.to（2026-09）、rybbit 官方博客对比页、openpanel 官方对比文章、HN、G2/TrustRadius 用户评价。
- 未核实项已在正文中标注"未查到"。特别勘误：SerpBear 仓库实际协议为 **MIT**（部分 awesome 榜单误标 GPL-3.0），以仓库 LICENSE 页为准。

---

## 第二部分：事件协议 v1

> 配套第一部分（立项报告）§六。TS 全栈：`packages/contracts` 为唯一事实源（JSON Schema + TS 类型 + zod 校验器），tracker / 网关 / Worker 共用。**本文件是设计文档，不是代码。**

### 1. 采集端点

```
POST /api/collect
Content-Type: application/json
Content-Encoding: gzip            # 可选，>1KB 建议启用
```

#### 1.1 请求 envelope

```json
{
  "protocol_version": 1,
  "site_id": "a1b2c3d4",
  "sdk": "tracker.js/1.0.0",
  "sent_at": 1729000000000,
  "events": [ { /* 见 §2 */ } ]   // 1..50 条
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| protocol_version | int | 协议版本。网关只接受已知版本；未知版本 → 400 `{error:"unsupported_protocol_version", supported:[1]}`，不静默丢弃 |
| site_id | string | 公开站点标识（非密钥）。服务端事件另用签名，见 §5 |
| sdk | string | `tracker.js/<semver>`，用于兼容窗判断 |
| sent_at | int | 客户端毫秒时间戳；与服务端时间差 >24h 的批次记 `clock_skew` 告警但仍接收 |
| events | array | 批量事件，单条失败不影响其他（见 §4） |

#### 1.2 tracker 配置（`data-*` 属性）

```html
<script async defer src="https://stats.example.com/tracker.js"
  data-site-id="a1b2c3d4"
  data-api-host="https://stats.example.com"
  data-consent-required="true"
  data-sample-rate="1.0"></script>
```

- `data-consent-required="true"` 时，未调用 `baize.grantConsent()` 前：**不生成标识、不采集、不缓存**（F-18）。
- 采样率仅影响 vitals/replay 类高成本采集，不影响 PV/UV 基础事件。

### 2. 事件 schema

#### 2.1 公共字段（所有 type 必带）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| event_id | string(uuidv7) | ✅ | 客户端生成，**幂等键**。重试必须原样重发，不得重新生成 |
| type | enum | ✅ | `pageview` \| `event` \| `heartbeat` \| `vitals` \| `revenue` |
| ts | int | ✅ | 客户端事件毫秒时间戳 |
| visitor_id | string\|null | ✅ | 第一方 Cookie `_baize_uid`；无 Cookie/隐私模式下为 null，由网关 HMAC 补 |
| url | string | ✅ | 完整 URL（敏感查询参数在采集端按站点配置清洗后发送） |
| path | string | ✅ | URL path，供聚合维度 |
| referrer | string | - | 为空记 direct |
| title | string | - | document.title |
| utm_source/medium/campaign | string | - | |

#### 2.2 按 type 扩展字段

**pageview**：公共字段即可。SPA 路由切换由 tracker 监听后发新的 pageview（`type=pageview`, `ts` 为切换时刻）。

**event**（自定义事件 F-13）：`event_name: string` + `props: Record<string, string|number|boolean>`。props 进 `event_data` EAV 表；键名限制 64 字符，单事件 ≤20 个属性。

**heartbeat**（停留时长 F-04）：`visible_ms: int`——**本心跳覆盖的前台可见毫秒数**（tracker 用 visibilitychange 时间戳切片，见 F-04）。服务端只做加法，不估算丢失区间。

**vitals**（F-12，按需加载模块）：`vitals: { lcp?: number, inp?: number, cls?: number, fcp?: number, ttfb?: number }`，单位 ms（cls 除外）。必须来自官方 `web-vitals` 库，不接受手写值。

**revenue**（F-14）：`revenue: number, currency: string(3), order_id: string`。服务端仅做汇总，**金额视为业务方自述**，不对账。

#### 2.3 服务端补全字段（网关在请求内存内生成，不信任客户端）

`country, city`（mmdb 内存查）、`device, browser, os`（UA 解析）、`ip_truncated`（v4 末段置零 / v6 取 /64，隐私模式可为 null）、`is_bot`（命中则整批丢弃，不入库）。

### 3. 网关处理流水线（请求内，内存中）

```
1. zod 校验 envelope + 单条 event（失败 → §4）
2. 协议版本检查 → 限流（site_id+IP 维度，可配，默认 100 req/min/IP）
3. 可信 IP 提取：清洗 Forwarded/X-Forwarded-*，仅信任登记的反代/CIDR
4. 机器人过滤（UA + IP 名单）：命中 → 204 直接丢弃
5. 内部 IP 过滤（F-47）：命中 → 204 丢弃（可配）
6. 地域解析：mmdb 内存查 → country/city
7. 标识：visitor_id 为空 → 隐私模式 HMAC(IP+UA+当日salt)；标准模式 → 生成 UUIDv7（同域可 Set-Cookie）
8. 同事务写 events 表（脱敏后）→ 202
```

**原始 IP 在第 8 步之前已丢弃**：不出请求内存、不进 events、不进日志/错误追踪（F-11）。

### 4. 响应语义

- `202 Accepted`：`{ accepted: n, rejected: [{ index, event_id, reason }] }`。单条校验失败只影响该条。
- `400`：envelope 非法 / 协议版本不支持（带 `supported`）。
- `401`：服务端事件签名无效（见 §5）。
- `429`：限流，带 `Retry-After`。
- **202 = 已持久化**（同事务写 events），可恢复；不是"已聚合"（聚合由 Worker 异步做）。

### 5. 服务端事件签名（可选，P1）

服务端对服务端调用（如订单系统补发 revenue）用独立写密钥：`Authorization: Bearer <site_write_key>` + 请求体 HMAC。浏览器 tracker **不用**该密钥（site_id 公开 + 限流 + 机器人过滤即可）。

### 6. 版本兼容

- `protocol_version` 递增时：旧版本进入 6 个月兼容窗（网关保留转换路径），到期后返回 400 并给出诊断信息。
- tracker 大版本与网关大版本分别版本化（见报告 F-19）；指标口径变更走 `schema_version`，历史报表不静默重定义。

---

## 第三部分：数据库结构 v1

> 配套第一部分（立项报告）§六。PostgreSQL。迁移：`db/migrations/NNNN_名称.sql` 编号递增，`pnpm db:migrate` 执行（PG advisory lock 单 leader）。**设计文档，不是代码。**

### 0. 约定

- 主键默认 `uuid`（`gen_random_uuid()`），时间字段 `timestamptz`。
- 分区表按月 RANGE 分区（`ts`/`day`），保留期默认 365 天（`sites.retention_days`），过期分区由定时任务 detach+drop。
- 分区表的唯一约束必须包含分区键。

### 1. 账户与站点

```sql
users(id uuid PK, email text UNIQUE, password_hash text, name text, created_at)
sites(id text PK,                    -- nanoid 公开站点标识
      name text, domain text, timezone text DEFAULT 'Asia/Shanghai',
      privacy_mode text DEFAULT 'standard',   -- standard | daily_salt（F-02 双模式）
      salt_current text, salt_prev text, salt_rotated_at timestamptz,
      retention_days int DEFAULT 365, created_at timestamptz)
site_members(site_id, user_id, role text, PK(site_id, user_id))
      -- role: owner | admin | analyst | viewer
```

### 2. 事件明细（热路径写入）

```sql
events(                         -- PARTITION BY RANGE (ts)，按月
  id uuid, ts timestamptz, PK(id, ts),
  site_id text NOT NULL,
  event_id uuid NOT NULL,       -- 幂等键
  UNIQUE(site_id, event_id, ts),
  visitor_id text,              -- 脱敏后标识（HMAC 或 UUID）
  type text NOT NULL,           -- pageview|event|heartbeat|vitals|revenue
  path text NOT NULL, url_hash text,
  referrer text, title text,
  utm_source text, utm_medium text, utm_campaign text,
  country char(2), city text,
  device text, browser text, os text,
  event_name text,              -- type=event
  revenue numeric, currency char(3), order_id text,   -- type=revenue
  visible_ms int,               -- type=heartbeat（可见毫秒，只加法）
  vitals jsonb,                 -- type=vitals {lcp,inp,cls,fcp,ttfb}
  ip_truncated text,            -- v4 末段置零 / v6 /64；隐私模式可 null
  agg_done boolean DEFAULT false)
CREATE INDEX ON events(site_id, ts);
CREATE INDEX ON events(site_id, visitor_id, ts) WHERE agg_done = false;
```

`event_data`（自定义属性 EAV，按月分区，`ts` 与 events 对齐）：
```sql
event_data(event_id uuid, site_id text, ts timestamptz,
  data_key text, string_value text, number_value numeric,
  date_value timestamptz, data_type char(1),   -- 's'|'n'|'d'
  PK(event_id, data_key))
```

### 3. 会话与身份

```sql
sessions(id uuid PK, site_id text, visitor_id text,
  started_at timestamptz, last_active timestamptz,
  entry_path text, exit_path text, pageviews int DEFAULT 0,
  duration_s int DEFAULT 0, bounced boolean DEFAULT true,
  utm_source text, utm_medium text, utm_campaign text)
CREATE INDEX ON sessions(site_id, visitor_id, last_active);
CREATE INDEX ON sessions(site_id, started_at);

identity_map(site_id text, visitor_id text, user_id text,
  created_at timestamptz, PK(site_id, visitor_id))
visitor_first_seen(site_id text, visitor_id text, first_date date,
  PK(site_id, visitor_id))       -- 留存 cohort 用；仅标准模式
```

### 4. 预聚合（Worker 事务替换写，带 generation）

```sql
stats_hourly(site_id text, hour timestamptz, path text DEFAULT '',
  pv bigint, uv_hll bytea, sessions int, bounces int,
  total_dwell_s bigint, generation bigint, PK(site_id, hour, path))
stats_daily (同上，day date)
page_stats(site_id text, day date, path text,
  pv bigint, uv_hll bytea, avg_dwell_s numeric, bounce_rate numeric,
  generation bigint, PK(site_id, day, path))
page_vitals(site_id text, day date, path text, metric text,
  tdigest bytea, sample_count int, PK(site_id, day, path, metric))
  -- t-digest 摘要（F-12）：p75/p90 从摘要算；跨月合并摘要重算
path_stats(site_id text, day date, from_path text, to_path text,
  transitions bigint, uv_hll bytea, PK(site_id, day, from_path, to_path))
funnel_stats(site_id text, day date, funnel_id uuid, step int,
  visitors_hll bytea, PK(site_id, day, funnel_id, step))
retention(site_id text, cohort_date date, day_n int,
  cohort_size int, returned int, PK(site_id, cohort_date, day_n))
goal_stats(site_id text, day date, goal_id uuid,
  conversions bigint, revenue numeric, PK(site_id, day, goal_id))
```

`uv_hll` 用 `postgresql-hll` 扩展（备选：bytea 自管 sketch，扩展不可用时降级）。rollup 写入语义：同一 `(site_id, 周期)` 在事务内 DELETE+INSERT，`generation` 递增；过期 worker 的旧 generation 写入被拒绝（见任务流程）。

### 5. 定义表

```sql
funnels(id uuid PK, site_id text, name text, steps jsonb, created_at)
goals(id uuid PK, site_id text, name text, type text, config jsonb)
alerts(id uuid PK, site_id text, name text, rule jsonb, cooldown_s int,
  last_fired_at timestamptz, enabled boolean)
reports(id uuid PK, site_id text, dsl jsonb, schedule text, channel text)
share_links(id uuid PK, site_id text, token text UNIQUE,
  password_hash text, expires_at timestamptz, config jsonb)
api_tokens(id uuid PK, site_id text, name text, token_hash text,
  scopes text[], expires_at timestamptz, revoked boolean)
```

### 6. SEO / AI

```sql
gsc_stats(site_id text, day date, query text, page text,
  clicks int, impressions int, ctr numeric, position numeric,
  PK(site_id, day, query, page))
rank_history(site_id text, day date, keyword text, engine text,
  rank int, url text, PK(site_id, day, keyword, engine))
seo_issues(id uuid PK, site_id text, page_url text, check_type text,
  severity text, status text, first_seen timestamptz,
  last_seen timestamptz, evidence_id uuid)
evidence_snapshots(id uuid PK, site_id text, source_type text,
  observed_at timestamptz, window_start timestamptz, window_end timestamptz,
  metric text, schema_version text, query_hash text,
  watermark timestamptz, coverage numeric, content_hash text, payload jsonb)
ai_suggestions(id uuid PK, site_id text, evidence_id uuid,
  category text, title text, detail text, confidence text,
  status text DEFAULT 'new',        -- new|accepted|doing|pending_verify|verified|false_positive
  implemented_at timestamptz, verified_at timestamptz, created_at timestamptz)
```

### 7. 运维与合规

```sql
tombstones(id bigserial PK, site_id text, visitor_id text, user_id text,
  deleted_at timestamptz DEFAULT now(), source text)
  -- 每日导出到 DB 备份之外的 append-only 存储；恢复后先重放（F-46）
audit_logs(id bigserial PK, site_id text, actor_id uuid, action text,
  target text, created_at timestamptz DEFAULT now())
notification_logs(id bigserial PK, site_id text, channel text, target text,
  status text, attempts int, created_at timestamptz)
schema_migrations(version int PK, applied_at timestamptz DEFAULT now())
```

### 8. 量级估算（供部署参考，非承诺）

单事件行约 300–500 字节（含索引）；日 100 万事件、保留 30 天 → events 约 9–15GB（未计 WAL/备份）。预聚合表与明细量级无关（按站点×周期×路径数）。

---

## 第四部分：任务处理流程 v1

> 配套第一部分（立项报告）§六、F-20/F-46/F-66。默认部署：app（含 Fastify + worker）+ PostgreSQL + Redis。**设计文档，不是代码。**

### 1. 采集写入（热路径，请求内完成）

```
tracker 批量 POST /api/collect
  → Fastify: zod 校验 → 协议版本 → 限流 → 可信IP提取 → 机器人/内网过滤
  → 内存地域解析(mmdb) → 隐私模式HMAC → 同事务 INSERT events → 202
```

- 单条事件失败只影响该条（202 + rejected 明细），不整体 400。
- 202 = 已持久化（事务提交），**不是**已聚合。聚合延迟目标 <5 分钟（P0），看板标注数据水位。
- `UNIQUE(site_id, event_id, ts)` 保证重试幂等；重复投递返回 accepted（去重计数）。

### 2. 聚合 Worker 主循环

```
loop forever:
  batch = SELECT id FROM events
          WHERE agg_done = false
          ORDER BY site_id, ts
          LIMIT 2000
          FOR UPDATE SKIP LOCKED        -- 多 worker 安全认领
  group by site_id:
    会话归因（见 §3）
    更新 stats_hourly/daily、page_stats、path_stats（事务内 DELETE+INSERT+generation+1）
    更新 page_vitals t-digest（合并当日摘要）、funnel/retention/goal 相关表
    UPDATE events SET agg_done = true WHERE id IN (...)
  commit; sleep(2s)
```

- 认领带租约：`claimed_at + lease(60s)`；worker 崩溃后租约过期，其他 worker 接管（at-least-once + 幂等写入 = 安全）。
- rollup 写入带 `generation`：过期 worker 的旧 generation 事务提交时被拒绝，不覆盖新结果。
- Redis 只做水位/缓存，不做可靠性承诺（LISTEN/NOTIFY 仅作唤醒信号，重启后轮询）。

### 3. 会话归因算法

```
open = SELECT * FROM sessions WHERE site_id=? AND visitor_id=?
       AND last_active > now() - interval '30 min' ORDER BY last_active DESC LIMIT 1
for event in batch (按 ts 排序):
  if open 为空 或 event.ts - open.last_active > 30min:
    open = 新建 session(entry_path=event.path, bounced=true)
  open.last_active = event.ts; open.exit_path = event.path
  open.pageviews += (event.type='pageview')
  open.duration_s = last_active - started_at
  if open.pageviews > 1: open.bounced = false
```

- heartbeat 只更新 `last_active`，不增加 pageviews，不单独存明细。
- 隐私每日轮换模式：visitor_id 每日变化 → 会话天然按日切断，**不跨日缝合**（F-02）。

### 4. 定时任务

| 任务 | 周期 | 说明 |
|---|---|---|
| rollup_hourly | 每 5min | 补算未完成的小时聚合 |
| rollup_daily | 每日 00:30（站点时区） | 日聚合 + 留存 cohort 计算 |
| retention_cleanup | 每日 01:00 | detach+drop 超保留期分区；清 tombstone 导出外的过期数据 |
| salt_rotation | 每日 00:05 | 隐私模式 salt 轮换（current→prev，新 salt 生效） |
| gsc_sync | 每日 02:00 | 拉前 3 天 Search Analytics（GSC 延迟 2–3 天） |
| rank_check | 每日 | SerpAPI/DataForSEO（用户自填 Key，按量） |
| seo_crawl | 可配（默认每周） | 站内健康检查爬虫（undici+cheerio，限速，SSRF 防护） |
| ai_daily | 每日 | 日报解读/异常归因（BYOK，有预算预留） |
| backup | 每日 | pg_dump + tombstone 导出（分开保护） |
| geoip_update | 每周 | MaxMind mmdb 更新 + sha256 校验 |

任务状态机：`queued → running → (retry_waiting) → success | failed | paused | cancelled`；同一计划用 run key 防多副本重复调度；认证失败等永久错误进 DLQ 人工处理。

### 5. 删除流程（F-46）

```
输入 visitor_id/user_id
1. 写 tombstones（事务1）
2. DELETE events/event_data（按分区）→ DELETE sessions/identity_map/visitor_first_seen
3. generation+1，触发受影响周期重算（原始明细保留期内：从 events 重放建 HLL/t-digest；
   超保留期：标注近似边界）
4. 清相关缓存；导出 tombstone 到 append-only 存储
5. 记审计
Worker 遇到 tombstone 中的标识：直接丢弃，不写回。
```

### 6. 备份恢复流程

```
恢复前：确认备份集（DB 快照 + tombstone 独立导出 + 密钥恢复包）
1. 恢复 DB 到新实例（不直接覆盖生产）
2. 重放 tombstone 删除记录（删"复活"数据）
3. 旧任务 generation 失效；清缓存
4. 对账（行数/水位抽查）→ 切流量 → 重新开放查询与任务
```

### 7. 升级流程（F-66）

```
1. 自动创建恢复点（DB 快照 + 卷备份）
2. 拉新镜像 → pnpm db:migrate（advisory lock，单 leader）
3. 健康检查（/healthz + 首条查询冒烟）
4. 失败 → 按恢复步骤回滚（恢复快照 + 切回旧镜像 + 重放期间 tombstone）
注意：换回旧镜像 ≠ 回滚；兼容矩阵（APP 版本 × schema 版本）在 docs/compatibility.md 维护。
```

---

## 第五部分：指标测试样例 v1

> 配套第一部分（立项报告）§六。每个样例 = 输入事件（按事件协议 v1）+ **手工计算的期望值** + 口径说明。实现时先跑通这些样例，再谈优化。**设计文档，不是代码。**

### Fixture A：PV / UV / 会话 / 跳出率

输入（标准模式，同一天）：

| # | visitor | ts | type | path |
|---|---|---|---|---|
| 1 | V1 | 10:00 | pageview | /a |
| 2 | V1 | 10:05 | pageview | /b |
| 3 | V2 | 10:02 | pageview | /a |
| 4 | V1 | 11:00 | pageview | /c |

期望值：

| 指标 | 期望 | 口径 |
|---|---|---|
| PV | 4 | pageview 事件数 |
| UV（日） | 2 | 去重 visitor_id |
| 会话数 | 3 | V1 两段（10:00–10:05 一段，11:00 与上段间隔 55min>30min 切分），V2 一段 |
| 跳出会话 | 2 | V1 第二段（单页）、V2（单页）；V1 第一段 2 页不算跳出 |
| 跳出率 | 66.7% | 2/3 |

### Fixture B：跨天 UV 与隐私模式边界

输入（标准模式）：V1 在 day1、day2 各 1 个 pageview。

| 口径 | 期望 |
|---|---|
| day1 UV / day2 UV | 1 / 1 |
| 2 天区间 UV | **1**（HLL 跨天去重，不得 1+1=2） |

隐私每日轮换模式：同一输入下，day1/day2 的访客哈希不同。**该模式不支持跨天去重**：区间 UV 查询必须返回 `unsupported_in_this_mode`，看板对应模块标注"该模式不支持"，**不得**用 1+1=2 糊弄（F-02）。

### Fixture C：停留时长（可见区间求和）

输入：pageview /a (t=0)；heartbeat：`visible_ms=15000` (t=15s)、`visible_ms=15000` (t=30s)、`visible_ms=8000` (t=50s，中间切后台 20s 不计入）、卸载 beacon `visible_ms=5000`。

期望：页面停留 = 15000+15000+8000+5000 = **43000ms = 43s**。丢失的心跳区间不估算、不外推。

### Fixture D：漏斗（步骤 /a → /b → /c，严格顺序）

| visitor | 路径 |
|---|---|
| V1 | /a, /b, /c |
| V2 | /a, /b |
| V3 | /a |
| V4 | /b, /c（未从 /a 进入） |

期望：step1=3，step2=2，step3=1；step1→step3 转化率 **33.3%**；V4 不计入（严格模式要求从第 1 步进入）。

### Fixture E：留存（同期群）

cohort 2026-10-01 首访：V1, V2, V3。V1 在 10-02 回访，V2 在 10-03 回访。

期望：`retention(2026-10-01, n=1) = 1/3 = 33.3%`，`n=2 → 33.3%`。回访定义：cohort_date 之后任一天有 pageview 即算当日回访。

### Fixture F：幂等（重复投递）

同一 `event_id` 的 pageview 发送两次（第二次为网络重试，payload 完全一致）。

期望：PV 只计 **1**；第二次返回 202 且标记为重复（`accepted` 不重复累加）；`UNIQUE(site_id, event_id, ts)` 生效。

### Fixture G：删除（GDPR）

V1 有 10 个 pageview（2 天），聚合已生成。执行删除 V1：

期望：
1. `events`/`event_data` 中 V1 行数为 0；`identity_map`/`visitor_first_seen` 中 V1 记录删除。
2. `tombstones` 有 1 条记录；tombstone 导出文件新增 1 行。
3. 重算后日 UV 不再含 V1（HLL 从保留明细重建，非"扣减"）。
4. 删除后新到的 V1 事件 → 被 Worker 丢弃（tombstone 命中），不写回任何表。

### Fixture H：Web Vitals 分位数（t-digest 合并）

- day1 某页面 LCP 样本：[100, 200, 300]ms → 当日 p50 ≈ 200（容差 ±5%）。
- day2 样本：[400, 500, 600]ms → 当日 p50 ≈ 500。
- 合并两日摘要求区间 p50：≈ 350（容差 ±10%），**不得**用 (200+500)/2 糊弄——必须走摘要合并。

### 通用断言

- 所有聚合查询返回 `watermark`（数据水位时间）与 `coverage`（覆盖率）；未完成聚合的周期明确标注，不 silently 当 0。
- 时区：按站点 `timezone` 切天，跨时区 fixture 另补。