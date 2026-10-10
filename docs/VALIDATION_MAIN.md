# main 开发里程碑验收（保留历史结果）

当前已完成整轮为10eb88a：180单元+402真实集成、30检查（28真实Chromium+2日期）全部PASS/0skip，fresh local EXIT0/cleanup。当前19d97af冻结全轮实际EXIT0：51文件191单元+152文件404真实集成=595 PASS；30检查（28真实Chromium+2日期）全PASS/0fail/0skip，浏览器1.6分钟，lint/type/SDK/build/migrate/compiledapp/Compose cleanup均0；最新生产镜像、新同口径负载与最终托管不预称通过，托管暂停不触发。完整七筛选已经实现。

以下所有旧阶段正文是历史时点记录，旧“在制/未注册/guard false/镜像待”只描述当时源码，不能用来否定后续已完成实现；旧失败与计数原样保留，不相加。严格CH主体、隐私/恢复、多语言、F29和身份收入已由后续7f/10eb对应冻结验收，不新增真实外部账号通过声明。b56b7e9 为历史第二批；第八377/20见 [VALIDATION_EIGHTH.md](VALIDATION_EIGHTH.md)，第七318/20见 [VALIDATION_SEVENTH.md](VALIDATION_SEVENTH.md)，7f494/22见 [VALIDATION_TENTH.md](VALIDATION_TENTH.md)。

b56b7e9 当时结果：最新独立索引快照实际通过 36 文件、148 应用测试（59 单元/89 集成）和 13 Playwright 用例（11 浏览器流程/2 日期纯函数检查），均 0 失败、0 跳过。精确日志见 `test-evidence/second-main-tests.json`、`test-evidence/second-main-e2e.txt`。真实 WordPress 本地运行栈已验收通过，不能再列为未验收。以下首批结果为历史记录，不能代表所有后续在制修改。

历史第二批当时在制：ClickHouse 全应用切换/隐私故障验证、多语言外部错误语义、身份收入专项界面及新的最终镜像矩阵，均须单独记录后续结果。100k与1M真实完整管线均已通过。1M的1,000,000条/20,000批真实HTTP全部202（687.65秒），worker416.703秒，outbox全done，40站点dirty/uncovered/attempts均0，SQL/queryStats一致PV1M/UV2万/会话2万、coverage1，CLI EXIT0，独立schema已清除。证据full-pipeline-1000000.json/validation-scale.md；启动cb72a7e+当时WIP，非精确最新SHA，PG-only且CH关闭，RSS2,180,997,120byte，不能证明1C2G/持续混合写删/5分钟延迟保证。真实 GSC/GA4/MaxMind/SERP/商业模型/企业微信账号仍未实测。

## 首个 main 里程碑（历史快照）

远端 main 与原功能分支均为 ebf3b71b4db4a8a1bdcba7a3d230fd7423c85294 后，本地正常切换 main 跟踪 origin/main；没有 force、reset 或 PR 合并。切换前184个在制文件保存至 /workspace/baize-preservation/20261010T061430Z，恢复后逐文件 SHA256 一致；保全 stash 保留。

## 实际执行

- `npm run lint`、`npm run typecheck`、`npm run build`：通过。构建仍有 ECharts chunk >500kB 提示。
- 全量应用测试（无排除）：31文件134通过、0失败、0跳过；52单元、82集成。命令及逐例结果见 test-evidence/main-tests.json。真实 PostgreSQL17、Redis7 与 /usr/bin/chromium；不是环境smoke。
- 首次全量133通过1失败：恢复旧实验投影会绕过日志重放。补查贡献/outbox/event_keys后全量134通过；没有禁用失败用例。
- 恢复重建5项真实PG：false不能代表完成，临时失败重试、SQL42P01死信、仍持有租约均不能报告 restored:true。
- daily_salt统一MIT共享字段清洗规则；customer_id/device_id/uuid/contact/page_id等别名直接API、EAV、JSON/CSV导出与历史迁移实际PG回归通过。
- 实际Chromium共享浏览器身份实验：删除A贡献而保留B；回灌旧A实验贡献后journal重放仍删除A，不复活转化。
- 完整看板Playwright与当前镜像Docker安装/升级/备份/新卷恢复/故障注入矩阵：仍执行中，不以旧镜像结果代替当前批次通过。

## 范围与未完成

新内容/目标/漏斗报表、完整UTM过滤、可配置渠道/AI域名、官方Apache2地图资产、通知驱动AI归因、实验贡献和统一告警口径已加入真实测试。完整F01–F66/P2仍未全部完成，以 IMPLEMENTATION_CHECKLIST.md 逐项边界为准；首批当时浏览器UI、ClickHouse全应用可靠双写/切换、百万日吞吐与真实WordPress运行栈尚未验收；WordPress与后续浏览器结果现已在第二批记录通过，ClickHouse仍在制，1M现已完成独立实际验收（边界见本文开头）。

真实外部GSC/GA/MaxMind/SERP/商业模型/SSO账户未实测；不购买API或创建生产凭据。GitHub托管CI run38027616519因账号付款/额度在步骤执行前阻断，远端CI未运行；不改计费，不重跑。无外网部署、可见性或网络安全配置变更。

## 第二个 main 里程碑（独立索引快照）

- 未提交的CH模块不混入此版本；导出的精确Git索引运行lint/typecheck/build及全量测试，36文件148通过、0失败、0跳过（59单元、89集成），见second-main-tests.json。
- 全新隔离真实PG应用与Redis，真实浏览器globalSetup执行管理员/首站/追踪代码向导；随后13 Playwright用例全部通过（36.4秒），其中11浏览器流程、2日期纯函数检查。准确日志second-main-e2e.txt。初次新库11通过2失败，定位聚合尚未完成与测试准备消耗登录额度；修复聚合水位验收、自动刷新/过期响应保护及可复用真实会话，不改生产限流。
- 新024前向迁移实际PG回归：014执行后写别名并真实聚合，明细过期后升级，历史统计和实际完整JSON/CSV导出不含已知身份别名；合法历史计数保留，standard站点不清洗。020/021未改。
- F17机器人行为过滤、真实Redis故障降级/分钟历史保留、F10 UA/CSS屏幕/DPR及F09仅广告来源标记已验收；tracker core gzip4015byte。
- WordPress6.9.4/PHP8.3.31真实安装/插件上传启停/匿名同意与撤销/真实tracker→PG→worker验收EXIT0，报告wordpress-actual-runtime.json。测试资源已清理。
- Docker故障场景最新实际矩阵EXIT0及先前磁盘满失败记录见docker-lifecycle-main.json/txt；镜像6c66明确早于024及后续UA/bot，不能宣称它验证后续新镜像。
- 100k与1M真实HTTP全链路已通过，1M结果属于启动cb72a7e+WIP的独立运行，非此第二批精确索引快照。ClickHouse镜像在制另有真实测试，未在此提交中宣称完整P2迁移。全部F/P2仍未完成，剩余状态继续见逐项清单；远端CI仍未运行。

新增真实PG不等样本分位合并缺陷（25×100 + 1×10000的p75曾错误5430）已按加权Type7修复，真实collector→worker→stats及单元尾部/6点350专项3文件23测试通过；当前工作区增量，非b56b7e9快照，root全集待跑。

ClickHouse增量进展（当前工作区，非b56b7e9索引）：实际PG/CH/Redis完整脱敏schema可靠镜像与analytics/content/geo选择性读取已有14集成+3单元通过，后续lease/deadline/cache/views合测22项通过；root全应用启动/隐私故障验收另在执行。高水位/epoch/count不符明示PGfallback；多数worker/rollups/governance/identity/realtime及事件属性仍PG。PG仅元数据、增量partition、全面读切换、历史迁移、CH集群备份与大容量仍未验收，详见ACCEPTANCE_CLICKHOUSE.md。


## 第三里程碑：当前源码与新镜像整体验收

精确索引导出快照（独立 fresh PG、真实 Redis/ClickHouse）最终 lint、typecheck、build 全部 EXIT0；45 文件 **180 测试通过，0失败/0跳过**，其中64单元、116集成。实际PG/CH副本切换、启动隐私失败关闭、独立恢复副本隔离、注册→付费身份段、25:1不等样本分位、真实Chromium回放热图均执行。fresh管理员向导→站点→复制代码后 **15 E2E通过**（13浏览器工作流、2时间函数）；其中新两项使用真实SDK收入/身份/实验而非手写演示数据。原始结构化报告和CLI日志见 `test-evidence/third-main-*`。SDK协议及独立删除日志两条CI脚本亦实际EXIT0。

复检曾179通过/1热图失败，失败报告保留。定位为页面后台的真实scroll事件异步尚未送达，测试改为确认前台/真实布局后等待实际POST与PG精确四档；不放宽统计断言、不改产品采集实现，专项连续两次通过后完整180再次通过。

新Docker镜像 `f8dc7f94dcd5fc86dfedfc841f8af64d528f54de798115e59307b311434f8e90` 全安装/备份/新卷恢复/真实worker失败/升级回滚矩阵 **EXIT0**。170条source/image SHA一致，真实应用25条迁移，包含024及本批CH/收入身份/回放热图/多语言。新镜像此前两轮实际EXIT1分别为Node JSON导入属性和非root读取公开配置权限，均已修复并保留日志及镜像SHA；未用旧6c66镜像替代。此Docker矩阵没有额外重复Chromium；浏览器结果来自同源fresh应用快照。

功能清单已纠正WordPress真实验收及F50/P2-10一致状态。F29流失特征新独立模块在制，尚未注册主路由；CH目前可靠镜像与选择性读取，PG仅元数据的全面迁移、增量大规模复制/CH备份仍未完成。不可变提交上的持续后台/集中单站性能测试尚待执行。GSC/GA4/企业微信/付费SERP/真实模型账户未实测；远端GitHub托管CI仍因账号计费阻断未运行，不重跑或修改计费。

当前工作区新增root全应用真实CH启动/隐私故障2项、外部错误契约1项通过；英文24个稳定外部错误映射已实现，浏览器验收仍待执行。此批状态至此冻结，后续全集结果由root补第三里程碑。


## 第四里程碑：共享本地CI组件与fresh浏览器

冻结应用索引快照实际lint/typecheck/build、SDK协议与独立journal命令通过；17单元文件76项、49真实服务集成文件161项，共66文件237测试通过、0失败/0跳过。集成使用独立PG17/CH25.8/Redis7容器，fresh编译生产入口+真实PG独立schema/Redis14+Chromium管理员向导后18E2E通过（42.4秒，16浏览器流程、2日期函数）。F29 typed流失属性、F30成熟留存、F22完整Top及自动更新、跨子域撤回、完整安全38表导出和中英稳定错误均有实际覆盖。证据fourth-main-components.json/fourth-shared-ci-components.txt/fourth-fresh-e2e-passed.txt。

共享脚本首轮76单元/160集成通过、1旧升级fixture失败：014历史schema故意没有027调度字段，fixture改为真实rebuildSite使用旧lease合约；产品未兼容伪造旧新混合schema。第二轮237应用测试通过，但18E2E有1旧文案selector失败；error-context中真实新事件和在线1已显示，测试保留精确baseline+1、改为新UI句子，fresh完整18通过。两轮原始EXIT1日志保留fourth-shared-ci-first-failed.txt/fourth-shared-ci-e2e-first-failed.txt。组件最终通过，尚未把失败的整脚本说成EXIT0。

新bf77镜像 `bf77b54e1ca7db572cccc4e77ec8e937550157d67b2a5bdb5dd2b4afbad93140` 新build与完整Docker生命周期均EXIT0，真实PG28条迁移，189条source/image SHA一致含025/026/027。逐文件对b3eee85核验187条一致，仅两份后续CNB同步脚本不同（不属于本应用核心验收）；应用/package/sdk/全部迁移与该main一致。compiledNode、真实采集导出、新卷恢复、worker故障拒绝假成功和两类完整升级回滚通过，证据docker-fourth-main.json/docker-fourth-build.txt/docker-fourth-matrix.txt及docs/validation/docker-fourth-*。此源码快照不包含下一批单连接错误路径/邀请原子audit修复与028历史模块；这些工作树专项通过不是本快照237测试证据。

CNB配置4386ec2已直接main，GitHub私有main权威，父线程确认私有空仓；真实本地file-only7分支同步测试通过，空仓bootstrap为显式确认空refs后普通push。CNB_TOKEN兼容输入不保证权限，官方schema/密钥引用/调度和远端run未实测。GitHub账号级托管CI阻断继续单列，不改计费、不重跑。完整F/P2仍未完成，不能把可靠镜像称PG-only、将顺序百万称实时或1C2G承诺。

补充 main 040b27e：worker/export失败分支复用已持client，邀请register/accept审计与业务原子同事务。旧真实max1连接池超时与旧register500证据保存；独立索引7文件37相关回归全部通过、lint/typecheck/build通过，fresh编译入口管理员向导→invited viewer专项1/1通过。不能将37与前批237相加为独立总数，也不能称bf77已覆盖这些新源码；下一批新镜像仍需实测。


## 第五里程碑：历史快照闭环与GA4精确窗口

冻结应用快照实际共享脚本 EXIT0：19单元文件80项+55真实PG/CH/Redis集成文件192项，共74文件272测试，0失败/0跳过；fresh独立PG schema、Redis14、真实管理员向导和compiled Node后19 Chromium检查通过（51.4秒，17浏览器流程、2日期函数）。lint/type/build/SDK/journal通过。仅复用已安装锁定依赖和系统Chromium，安装步骤未重跑，不称容器化/CNB整轮通过。见fifth-main-validation.json/fifth-shared-local-passed.txt。

028新增历史snapshot/cursor/hash和签名备份，应用启动/删除/journal/privacy/权限/保留/失败清理/隔离恢复闭环；PG仍权威，不能称全部PG-only迁移完成。029 GA4五独立报告精确窗口与独立whole-period用户数、质量/timezone/分页/原子导入/定时opt-in/39表安全导出和中英文真实浏览器均通过；Google传输为明确注入模拟，真实Google账号未测。此前040错误路径、9c7 F06文字隐私也纳入本轮完整应用测试。下一生产新镜像矩阵正在执行，bf77不替代新源码证明。

本地验证最初错误把URL-level search_path加入通用数据库URL，覆盖各fixture的Pool.options，发生12测试失败/2跳过，不能说产品journal缺陷。两轮主动中止EXIT143、第三轮EXIT1原日志保留。修共享脚本仅在集成结束后应用CI_APPLICATION_DATABASE_URL，再迁移/启动fresh app，最终原产品断言完整通过。没有关闭journal安全检查或弱化测试。

CNB main 885e4e8修同daemon网络，223e887提供main-only web_trigger按钮；静态/9本地Git分支通过，实际CNB首轮ECONNREFUSED和cron精确事件鉴权失败保留。本地容器安装DNS EAI_AGAIN后主动停止143，0应用测试；托管适配仍待父执行。父已确认c1fa2e4归档无新增Actionsrun，永不enable/rerun/dispatch。F60工具证据和bounded-session planner仅独立工作区小模块，尚未接生产，不纳本轮272/19或Docker。全计划未完成。

父页面后续确认CNB223e887实际托管CI成功：cnb-bnd-1k4igl82q，regular7分31秒EXIT0、真实集成/compiled入口/18E2E与清理通过。owner-page来源记录cnb-hosted-223e887-owner-confirmed.json；完整下载日志尚未提供，不推算应用总数，也不把该旧源证明当8b61fc0的272/19。cron已注册但授权待用户确认，未验收定时。

第五新production Docker c61030b4已实际build+完整生命周期EXIT0，201source/image SHA严格一致且与main8b61fc0对照0差异，真实PG30迁移含028/029。独立新库新文件卷/最新journal/worker SQL故障拒绝/升级/missing-image与schema+503真回滚通过，owned栈已清理。docker-fifth-main.json及hash/log记录边界；后续030/AI/语言与4ed81compose变更不在该快照，可选CH history模式未另在Docker开启，不能扩大为全部P2验收。

19d97af 完整原始日志：`/tmp/baize-19d97af-local-final.log`；完整报告目录：`/tmp/baize-final-local.5Mr38r`，持久 evidence/photos 由负责人保存。不把191+404应用计数与30检查混成浏览器数量，不将历史专项加到595。本轮新1000→5000负载正在运行、结果待，最终最新镜像未运行，托管保持不触发；旧性能FAIL保留，完整性通过不等于SLO。
