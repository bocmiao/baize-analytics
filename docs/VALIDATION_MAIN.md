# main 开发里程碑验收（保留历史结果）

## 当前验收入口（本地ce42c9f / d67应用源）

| 源/阶段 | 实际证据 |
|---|---|
| d67后端 |217单元+428真实集成=645PASS，实际后端执行|
| ce42c9f浏览器 |30检查（28真实Chromium+2日期）PASS、EXIT0；与d67 src/db/packages/sdk/scripts EMPTYdiff，不称后端重跑|
| d67镜像 |实际EXIT0：55DDL/391manifest/严格独立恢复；瞬时可用盘低62MiB风险已归档，不隐去|
| d67固定1000/5000 |实际EXIT1结束：1000PASS4.537660079秒；5000整体FAIL4700accepted/6unsent/38delayed/queryfail0，但draintrue、六final断言PASS，finalHTTP23.714184648秒；Node峰714698752B不含DB。性能仍欠，不称5000/SLO通过|
| Git/托管 |remotee441已核、push blocked，不再认证尝试；checkpoint manifest /workspace/baize-checkpoints/CHECKPOINT_MANIFEST.json、e441..87e六commit bundleverify0，仅Git对象/已跟踪source不含runtime keys。不称收工，不触发CI|

原661ENOSPC及d67首轮29/30整体EXIT1按原SHA证据保留在历史节。

1240 source文件前后不变、4项cleanup全true。当前无负载运行；末段可用盘观察1.5GiB→结束2.0GiB，不是minimum也不据此作因果解释。其后仅获批10个旧构建缓存精确ID清理，观测可用空间2485452800→9281884160B；完整清理证据另存，不触及最新镜像、共享依赖或卷。

容量探索87e（应用同d67）：PG/strict各20×50/5秒短时1000均EXIT0、0未发送/延迟/查询失败；仅有限探索，不替代原5000、日均百万或SLO验收，旧FAIL保留，见round2/CAPACITY_EXPLORATION.md。

## 历史SHA阶段记录与原契约

**当前66150be测试窄修**：完整type/lint/215单元实际EXIT0，src/db/packages与0a相同；19真实precommit专项仍只证明此前摘要绑定源码，不是完整全轮。0a正式入口实际EXIT2（TS2749），unit/int/browser/image未运行；随后测试WIP首次213/215单元通过、2FAIL，类型与event-capable mock窄修后215PASS。先type后追加测试导致旧报告外推的失误已记录，不掩盖。661新full/image/load待；bd未捕获错误、0a类型FAIL、测试WIP2FAIL及1c负载FAIL原证据保留。

当前更新a9b49e7：bd3f51f三批候选7单元/21真实专项PASS，但新完整入口实际EXIT1：213单元PASS，集成424检查中423PASS/1skip，并有uncaught PG25P04 error1；浏览器NOT RUN。旧1c30浏览器及镜像通过仅绑定旧source，不外推候选。skip来自runner漏env，已改用仓库validate-local-final.sh正式入口；C idlefatal修复已保存0a0c171：precommit WIP摘要绑定第四轮19真实专项PASS/0skip/0uncaught，10单元/type/lint通过；新0a全量/镜像/负载尚待。所有FAIL保留，托管不触发。

### 历史bb6阶段状态表

证据归档已随bb6a20c保存；下表按实际源码与执行阶段区分，不累加历史计数。

| 源与阶段 | 当前实际结果 |
|---|---|
| c890后端 | 211单元+421真实集成=632 PASS/0skip，已实际执行 |
| 1c1cb65浏览器 | 30检查=28真实Chromium+2日期全部PASS/0skip，92.6437秒，EXIT0/cleanup |
| 两阶段源码关联 | src/db/packages与c890一致已核；不声称1c重跑后端 |
| 1c1cb65新镜像 | 实际EXIT0；a5d495d6…，55DDL/054两个索引、391源码与镜像一致、运行budget probe、独立目标latest journal删A保B/源不变、故障拒绝及cleanup通过；证据main-1c1cb65-image-* |
| 最终固定1000/5000负载 | 1000 PASS（最终HTTP5120ms）；5000 FAIL（4900accepted/2unsent/39delayed、120秒排空deadline、最终断言未执行），仍有本地性能欠项 |
| 托管/外部边界 | 不触发托管；真实外部账号、设备及模型未测边界保留 |

日期标记和累计SELECT次数/decoded bytes/deadline预算两项有限缺口已有本地证明；预算不保证scan/heap或性能改善。以下各SHA原文为历史时点，不作为另一个“当前/最新”入口；所有FAIL、执行时间与原证据保持。

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

新增真实PG不等样本分位合并缺陷（25×100 + 1×10000的p75曾错误5430）已按加权Type7修复，真实collector→worker→stats及单元尾部/6点350专项3文件23测试通过；该历史阶段当时工作区增量，非b56b7e9快照，root全集待跑。

历史第三里程碑ClickHouse增量进展（该历史阶段工作区，非b56b7e9索引）：实际PG/CH/Redis完整脱敏schema可靠镜像与analytics/content/geo选择性读取已有14集成+3单元通过，后续lease/deadline/cache/views合测22项通过；root全应用启动/隐私故障验收另在执行。高水位/epoch/count不符明示PGfallback；多数worker/rollups/governance/identity/realtime及事件属性仍PG。PG仅元数据、增量partition、全面读切换、历史迁移、CH集群备份与大容量仍未验收，详见ACCEPTANCE_CLICKHOUSE.md。


## 第三里程碑：当前源码与新镜像整体验收

精确索引导出快照（独立 fresh PG、真实 Redis/ClickHouse）最终 lint、typecheck、build 全部 EXIT0；45 文件 **180 测试通过，0失败/0跳过**，其中64单元、116集成。实际PG/CH副本切换、启动隐私失败关闭、独立恢复副本隔离、注册→付费身份段、25:1不等样本分位、真实Chromium回放热图均执行。fresh管理员向导→站点→复制代码后 **15 E2E通过**（13浏览器工作流、2时间函数）；其中新两项使用真实SDK收入/身份/实验而非手写演示数据。原始结构化报告和CLI日志见 `test-evidence/third-main-*`。SDK协议及独立删除日志两条CI脚本亦实际EXIT0。

复检曾179通过/1热图失败，失败报告保留。定位为页面后台的真实scroll事件异步尚未送达，测试改为确认前台/真实布局后等待实际POST与PG精确四档；不放宽统计断言、不改产品采集实现，专项连续两次通过后完整180再次通过。

新Docker镜像 `f8dc7f94dcd5fc86dfedfc841f8af64d528f54de798115e59307b311434f8e90` 全安装/备份/新卷恢复/真实worker失败/升级回滚矩阵 **EXIT0**。170条source/image SHA一致，真实应用25条迁移，包含024及本批CH/收入身份/回放热图/多语言。新镜像此前两轮实际EXIT1分别为Node JSON导入属性和非root读取公开配置权限，均已修复并保留日志及镜像SHA；未用旧6c66镜像替代。此Docker矩阵没有额外重复Chromium；浏览器结果来自同源fresh应用快照。

功能清单已纠正WordPress真实验收及F50/P2-10一致状态。F29流失特征新独立模块在制，尚未注册主路由；CH目前可靠镜像与选择性读取，PG仅元数据的全面迁移、增量大规模复制/CH备份仍未完成。不可变提交上的持续后台/集中单站性能测试尚待执行。GSC/GA4/企业微信/付费SERP/真实模型账户未实测；远端GitHub托管CI仍因账号计费阻断未运行，不重跑或修改计费。

该历史阶段当时工作区新增root全应用真实CH启动/隐私故障2项、外部错误契约1项通过；英文24个稳定外部错误映射已实现，浏览器验收仍待执行。此批状态至此冻结，后续全集结果由root补第三里程碑。


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

19d97af 完整原始日志：`/tmp/baize-19d97af-local-final.log`；完整报告目录：`/tmp/baize-final-local.5Mr38r`，持久 evidence/photos 由负责人保存。不把191+404应用计数与30检查混成浏览器数量，不将历史专项加到595。19d97af镜像已实际EXIT0；该源1000 PASS、5000因9批未发送FAIL；后续ac86cd3新1000已PASS、5000实际FAIL，browser仍在运行，ac最新镜像未运行，托管保持不触发；旧性能FAIL保留，完整性通过不等于SLO。

## 19d97af 镜像与负载后续证据

19d97af 新镜像真实生命周期 EXIT0，证据已随 `0eb5e0c` 入仓：[镜像结果](test-evidence/main-19d97af-image-result.json)。55条 DDL、054两个索引安装、独立 signed restore、source unchanged 与 owned cleanup 均实际验证。该镜像只证明19d97af，不包括后续 TEMP 投影源码。

19d97af 独立严格1000总体PASS，最终完整查询 **6.058秒**；严格5000总体 **FAIL**：计划100批中9批未发送，仅4550 accepted（91批HTTP202），不能称5000完成。已接受事件六项strict完整性断言与全部排空通过，最终查询 **25.626秒**；这是4550可靠处理证据，不是5000/SLO达标。原 [5000 JSON](test-evidence/main-19d97af-independent-strict-5000.json) 与 [总结](test-evidence/main-19d97af-independent-summary.md) 随 `4a05fa2` 保留，旧负载FAIL不删除。

后续 `ac86cd3` TEMP投影有源码摘要绑定的14真实集成+2单元专项PASS；19d97af的191/404/30完整计数与镜像不外推为ac全轮或ac镜像通过。该句为当时历史状态；ac随后1000实际PASS5.316秒、5000实际FAIL（4800accepted/4unsent/42delayed/drain超时/final断言失败），当前ac browser专项30检查已PASS。真实外部未测及托管不触发规则保持，本段不新增功能范围。

## 历史0f14源码与ac投影边界

当前验收按各不可变源码分别记录，不将后续提交自动视为同源通过。最新已完成完整冻结仍为19d97af：191单元+404真实集成=595 PASS，30检查（28真实Chromium+2日期）全PASS；其生产镜像55条DDL、054两个索引、独立signed restore/source unchanged/cleanup实际EXIT0。此证据不外推后续源码。ac86cd3 TEMP投影只有源码摘要绑定14真实集成+2单元专项PASS；其独立1000 PASS、最终HTTP5.316秒，5000总体FAIL：4800accepted、4unsent、42delayed、drain超时且final断言失败。ac源码浏览器实际30检查（28Chromium+2日期）PASS/0skip，96.441秒、EXIT0，不称ac完整整轮或镜像通过。旧FAIL和外部未测保留，托管不触发。

现有保护为单请求timeout、完整EOF、正文caps、每批100行精确归属oracle及站点/删除fences。B/C整操作SELECT次数、decoded bytes、deadline预算及服务器/适配器失败关闭已实作，并由de专项13真实+17单元验证；最新完整整轮和镜像尚未运行。预算限制不等于性能改善，该自主欠项不需要新增凭据，不归类为外部账号阻塞。

人工日期标注趋势切片已保存aea2ece、4单元通过，真实浏览器待新冻结，属于自主验收待完成，不是外部凭据阻塞。GSC不扩第二stage；Ollama未测原因是官方工具下载网络阻断，Windows是执行器启动错误，Google/SERP/商业模型等另为真实外部账号/服务未测，三类原因不混合。

冻结补记：ac86cd3浏览器30检查（28真实Chromium+2日期）实际PASS/0skip，96.441秒、EXIT0；其191/404完整后端全轮未复验，不叠加旧19计数。当前4384后续预算切片尚未全量通过；该当时服务器行为3项是历史专项；后续de整操作/服务器/适配器真实13项已通过，完整新冻结仍待。aea2ece日期标记4单元PASS、浏览器未跑。预算口径为SELECT次数/decoded bytes/deadline，不承诺scan或heap限制。原FAIL全部保留。

## 历史de7222e有限代码缺口实施状态

当前main已推 `de7222edfd6baa7478a4e32e22f6b5399fc34daf`：整操作预算及显式SELECT失败关闭已实作，真实专项13项（9 PG/CH+4服务器/适配器）PASS/0skip，单元17项PASS；root16项是其子集，不重复累加。预算限制SELECT次数、decoded bytes与deadline，不保证扫描行数、heap峰值或性能提升。aea2ece人工日期标记已接趋势、4单元PASS，浏览器仍待新冻结。de新完整空库/浏览器/镜像正在准备，不能称已过；19与ac历史证据及所有旧FAIL保留，托管不触发。

当前de完整冻结验收已开始：209单元PASS；集成仍运行，已知 `clickhouse.test.ts:145` 旧mirror统计source回归失败，最终集成summary待负责人提供。原断言不降低，C按既定同client mirror/hybrid统计scope修复、A独立max1回归；不是扩新功能。此前13真实定向及17单元通过不抵消本轮真实失败。浏览器/镜像阶段尚未到达，不记全轮PASS，旧失败证据保持。

### de原冻结实际结束（84979，失败保留）

原完整冻结已EXIT1并完成Compose cleanup：54文件209单元PASS；154集成文件中153文件PASS/1文件FAIL，417检查中415PASS/2FAIL。两项均为clickhouse统计来源回归：首项过滤读取来源应全CH的断言失败，另项Redis来源期望CH却得到PG；同新增stats snapshot regression范围。浏览器与镜像NOT RUN。此前13定向通过不覆盖原失败，F保留原报告。C同client mirror/hybrid stats scope窄修、A新增4项及原文件实际回归正在运行；后续正常提交及新不可变全轮尚待，不提前改写这次EXIT1。

统计来源窄修定向实际通过：新增max1 stats-replica4项+原完整clickhouse.test16项=20 PASS/0FAIL/0SKIP，Redis启用，原55/153来源断言未改。precommit WIP摘要见 `docs/test-evidence/stats-replica-validation-record.json`（相对仓库根）。这20项不冲销de原209单元/415集成通过/2FAIL，也不累加全球计数；新不可变完整空库/浏览器/镜像仍待。文档当前冻结回交，旧FAIL报告保留。

当前c890冻结已结束，完整入口EXIT1、cleanup完成：55文件211单元+155文件421真实集成全部PASS/0skip=632应用通过；30浏览器检查29PASS/1FAIL（27真实Chromium+2日期通过），operations Chromium因固定x58画布点击点未命中失败，UI证明不完整。原FAIL保留，不能称全轮通过。root仅测试夹具1c1cb65按实际趋势/canvas几何窄修，焦点、PV、时区断言未降低；下一步同应用源码定向浏览器复验，不重复已过后端。新1c（含Compose预算配置前向传递）的镜像及性能仍待，不将632加旧源计数，托管不触发。

## 历史c890/1c分阶段记录（当前结果见顶栏）

| 源/阶段 | 实际结果 | 边界 |
|---|---|---|
| c890后端冻结 | 55文件211单元+155文件421真实集成=632 PASS/0skip | 已实际执行；不称1c重跑后端 |
| c890首轮浏览器 | 30检查29PASS/1FAIL，整轮EXIT1/cleanup | 原画布固定点失败保留 |
| 1c1cb65浏览器复验 | 30检查=28真实Chromium+2日期全部PASS/0skip，92.6437秒、EXIT0/cleanup | src/db/packages与c890应用源码一致已核；operations单项1PASS10.333秒是子集，不累计 |

有限两项实现缺口已本地闭合：日期标记真实canvas/键盘/时区/权限及PV1断言通过；累计SELECT次数/decoded bytes/deadline预算已由13定向（9PGCH+4服务器/适配器）及同应用632后端证明。限制预算不保证scan/heap或性能SLO。de417中的2FAIL及c890首轮浏览器1FAIL原记录保留，不改写历史EXIT1。

最新1c应用镜像（含cdbenvforward）与独立负载仍待，负责人下一步串行镜像验收；19镜像与ac负载证据不外推此源。托管不触发，真实外部未测边界保持。

1c最终固定负载：1000 PASS、最终HTTP5120ms；5000总体FAIL：4900accepted、2unsent、39delayed、queryfail0，drainReached=false且120秒deadline，剩余积压1350/最大3250。最终查询25.389秒FAIL、assertionsExecuted=[]，不得声称六完整性断言已过。Node峰730509312字节不含数据库，source unchanged且4项cleanup全true；没有预算拒绝。已通过代码功能/浏览器/镜像不等于关闭此本地性能欠项，不据此称提速/SLO。归档证据为 docs/test-evidence/main-1c1cb65-independent-strict-5000.json 及配套record；原FAIL保留。

0a0c171包含三批候选及idlefatal修复。第四轮实际19/19 PASS（11budget+4server+3triple+1strictrestore）、0skip/0uncaught，另10单元/type/lint通过；这是提交前源码摘要绑定定向证明，不是新全局计数。原前三轮FAIL及bd完整EXIT1全部保留。0a新完整空库、镜像和固定负载正在准备，不预写通过；旧c890632、1c30/image、1c1000PASS/5000FAIL各按原源码阶段保留，不外推0a。

## 历史前次状态入口（原记录保留）

## 当前验收入口（唯一当前表）

最新本地主干d67bb8a已保存，正常Git push权限当前不可用，不创建token。只在同run effects/vitals均为complete CH时省identity TEMP写，混源保持原路径；type/lint、新2+旧18=20受影响真实集成及217单元PASS/0skip。20是部分集成，不与旧426累加；217首次215PASS/2旧mockFAIL保留，随后仅修形状不降断言。d67新whole/image/load等待串行验收，最新已过完整全轮仍是661641+30；不推断提速。原镜像ENOSPC FAIL及精确自有旧cache清理/targethealthy EXIT0仅诊断恢复，native未跑，不称镜像生命周期通过。
d67整轮实际EXIT1/cleanup：645后端（217单元+428集成）ALL PASS；浏览器29PASS/1FAIL，protected share只读提示未找到、实际HTTP503“统计快照已改变请重试”，D正在诊断竞态，不称全passed。新完整镜像/负载待。父已核远端e441；local e441..d67 Gitbundle及tracked-source tar保存在/workspace/baize-checkpoints，bundleverify0且排runtime，不创建新凭据。

| 源/阶段 | 实际证据与边界 |
|---|---|
| 66150be正式全轮 | actualEXIT0/cleanup：55文件215单元+156文件426真实集成=641PASS/0skip/0unhandled；30E2E（28真实Chromium+2日期）全部PASS，约1.5分钟；lint/type/SDK/journal/build/migrate/compiledentry全部PASS |
| 66150be固定负载 | 1000PASS，finalHTTP5.047623651秒；5000整体FAIL：4350accepted/13unsent/35delayed、drainfalse120秒；已接受4350最终PV4350/coverage1/sourceCH，六完整性断言PASS，finalHTTP21.102973929秒；不是5000或SLO通过 |
| 最新镜像/远端状态 | 新镜像尚未完成；本地HEAD e441存在，HTTPS认证失败导致push尚未确认，不操作Git或托管 |
| 66150be独立静态/单元 | type/lint/215单元PASS，不代替正式全轮结果 |
| 0a提交前摘要绑定专项 | 19真实定向PASS，仅对应precommit源码摘要，不是全局计数 |
| c890后端（历史源） | 211单元+421真实集成=632PASS，未外推661 |
| 1c1cb65浏览器/镜像（历史源） | 30检查=28Chromium+2日期PASS；镜像EXIT0，均绑定1c非661 |
| 1c1cb65固定负载（历史源） | 1000PASS，5000FAIL，不称SLO达标或661结果 |

托管不触发。以下更新段全部是明确SHA对应的历史阶段原文：其中“当前/最新”仅指各历史时点，不构成另一个当前入口。bd未捕错误、0a类型FAIL、测试WIP两FAIL、1c负载FAIL及所有原来源完整保留。
