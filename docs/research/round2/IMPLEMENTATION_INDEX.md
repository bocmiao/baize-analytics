# 第二轮研究落实索引

## 当前验收入口（本地ce42c9f / d67应用源）

| 源/阶段 | 实际证据 |
|---|---|
| d67后端 |217单元+428真实集成=645PASS，实际后端执行|
| ce42c9f浏览器 |30检查（28真实Chromium+2日期）PASS、EXIT0；与d67 src/db/packages/sdk/scripts EMPTYdiff，不称后端重跑|
| d67镜像 |实际EXIT0：55DDL/391manifest/严格独立恢复；瞬时可用盘低62MiB风险已归档，不隐去|
| d67固定1000/5000 |实际EXIT1结束：1000PASS4.537660079秒；5000整体FAIL4700accepted/6unsent/38delayed/queryfail0，但draintrue、六final断言PASS，finalHTTP23.714184648秒；Node峰714698752B不含DB。性能仍欠，不称5000/SLO通过|
| Git/托管 |remotee441已核、push blocked，不再认证尝试；checkpoint manifest /workspace/baize-checkpoints/CHECKPOINT_MANIFEST.json、e441..f91五commit bundleverify0，仅Git对象/已跟踪source不含runtime keys。不称收工，不触发CI|

原661ENOSPC及d67首轮29/30整体EXIT1按原SHA证据保留在历史节。

1240 source文件前后不变、4项cleanup全true。当前无负载运行；末段可用盘观察1.5GiB→结束2.0GiB，不是minimum也不据此作因果解释。其后仅获批10个旧构建缓存精确ID清理，观测可用空间2485452800→9281884160B；完整清理证据另存，不触及最新镜像、共享依赖或卷。

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

记录时间：2026-10-10 UTC。三份研究正文按上传文件第一个 Markdown 标题起逐字节保存；仅移除标题前交接说明，原始附件留作对照；基线均为 f4dbbcc，研究不是已验收实现。没有授权新的外部账户、网络、计费、部署或托管流水线操作。

## 研究正文完整性

| 原文 | 字节数 | SHA256 |
|---|---:|---|
| [技术研究](technical-research.md) | 31366 | `e7ed9a8ef2b1124b83eacc8a36aa2085599c37eef45727c739e7848ebd166ace` |
| [产品研究](product-research.md) | 29602 | `0aed701efdbcf88711beaae9b13aca9d53d1c5bde551ddae70b61d909d3ed533` |
| [UI 研究](ui-research.md) | 30482 | `040a594fb4ce38ae7babc4cfe66c0daf5188fd28f9f1f8c1eb3b0e1c766dd9b3` |

## 去重后的封闭实施范围

| 结论 | 已有实现 / 本批增量 | 当前状态与负责人 |
|---|---|---|
| 100 行精确归属批量 | b4000d4 已实现；b7 的真实 PG/CH 集成通过 | b7 严格1000完整性PASS，query p95 9.137秒/lag p95 63.527秒，没有显著性能达标证据；A analytics |
| CH 命令完整响应 | 600a4da 已补六适配器 command 有界正常 EOF | 15 单元/HTTP模拟、43 真实PG/CH回归通过；A analytics；累计查询预算另待 |
| TEMP ANALYZE | 无 hydrate 后统计分析 | 隔离合成前后计划/精确对账/清理通过，但计入自身成本无净收益，生产接线有证据暂缓；不是产品提速证明 |
| 独立负载与阶段成本 | 保留 7f 串行 5000 的实际失败 | ce6ebcc 独立严格1000完整窗口已执行且完整性通过，排空/最终查询仍慢；b0be327 同口径完整性已PASS、最终HTTP7009.640ms仍慢；root 协调 |
| SEO 规则 v2 与原目标复测 | 已有扫描/复测，缺 HTTP 头、结构化 unknown 与定点状态 | 局部契约与真实本地fixture已实现并纳10eb冻结；真实外部账号边界保留；B external |
| GSC 覆盖契约 | 已有 25k 分页和失败事务保护 | 窗口/维度/PT/提供商不保证完整、本地导入与展示截断分开；B external |
| 首次接入状态 | 050 同采集事务记录接收时间/代次，独立 intake-status API 与 IntakeStatus 卡片已接入 | E 私有 7ace 变体真实 PG 专项 1 PASS；root 新 observer 专项 1 PASS。只读观察/待聚合/可用，不访问用户站点、不制造 PV、不认证安装；对应卡片已纳10eb完整浏览器冻结验收，19d97af新全轮595应用/30检查已PASS |
| Bot 理由统计 | 050 固定 reason/ruleVersion 按站点日统计，BotReasons 卡片已接入 | 同一 E 真实 PG 专项覆盖分类、声明事件数量与 legacy_unknown；请求不等于有效 PV，不持久化 IP/UA/正文。对应卡片已纳10eb完整浏览器冻结验收，19d97af新全轮595应用/30检查已PASS；E governance |
| 完整七筛选保存与编辑 | b7 真实集成已通过 | 不重复实施；原浏览器定位失败保留；07f9ada两例定向真实复验PASS，不冒称新全套 |
| 人工日期标注 | 053 站点/真实日期 CRUD，持久化创建或编辑时站点时区快照；Annotations 卡片已接入 | E 真实 PG 专项验证时区变更保留原备注快照、viewer 写权限拒绝；不输入 AI 测量或因果证据。对应卡片已纳10eb完整浏览器冻结验收，19d97af新全轮595应用/30检查已PASS；E governance |
| 管理员自托管诊断 | self-host-diagnostics 白名单只读摘要/下载与 SelfHostDiagnostics 卡片已接入 | E 真实 PG 专项验证管理员权限、敏感值排除、max1 无借池等待；备份元数据不冒充恢复验证，未验证与失败分开。对应卡片已纳10eb完整浏览器冻结验收，19d97af新全轮595应用/30检查已PASS；E governance |
| 分组导航与 URL 恢复 | 分组真链接、白名单 URL/历史与移动抽屉已接入 | ce6ebcc workspace 真实浏览器专项通过；ce6ebcc当时全29未复验，原FAIL保留；D web |
| 总览与筛选层级 | 已有真实趋势、维度、币种分离 | 已接入并纳19d97af浏览器冻结：纵向总览→筛选→明细→返回；不捏造零/因果 |
| 响应式/可访问 | b7 已有容器观察、回放缩放、静态对比和部分真实检查 | 新回放例选站窄修已定向真实PASS；五视口/200%文本及 ce6ebcc 回放焦点专项已实际通过，代表性 computed contrast 有证据；不称全面认证/全29通过；D web |
| 状态语义与设置分层 | b7 新连接设置已通过真实浏览器；保存不称连通 | 已接入并纳19d97af浏览器冻结：loading/error/empty/partial 分开、已配置 AI 先问数 |

本执行器安装技能盘点没有 React/UI 专项技能；不宣称使用不存在的技能，不盲装外部风格。已有品牌、数据表与地图 select 保留。

## 验收与阶段边界

b7a0a5f 冻结源本地全新 Compose：114 单元、395 集成通过；27 浏览器检查中 25 通过、2 失败（含 2 个日期函数，23 个真实 Chromium 通过）。失败为新增报表/成员、响应式回放；完整日志已保留，不能称全集通过。独立 CH 原生完整恢复另有 EXIT0 专项，不加入测试总数。新镜像及性能重测仍待。

7ace27e 首次第二轮后端冻结结果：146 单元通过；36 集成中 34 通过、2 失败。原始失败保持有效记录，不改写为整轮通过。E 首个失败是站点创建公开契约为 201、测试旧期望为 200；B 另一失败单独修复、验收。

E 从 `/tmp/baize-main-7ace27e.xtw3kxyl` 复制独立变体，仅覆盖 `operations-observations.test.ts` 的 201 期望、临时 keys 子目录与启动失败清理。实际单文件命令 EXIT0：1 PASS、0 FAIL、0 skip，完整接入→采集→worker、Bot、标注时区、诊断脱敏和权限断言保留。证据 `/tmp/baize-operations-7ace-first.json` 与同名 `.log`；隔离 `operations_%` schema 剩余 0，应用和临时目录已清理，测试未开启 HTTP listener。root 随后新 observer 定向专项亦 1 PASS。两次定向结果不累加为新的全量计数，也不代表新卡片浏览器通过。IntakeStatus 原型键安全回退及 owned fixture lint EXIT0；UI 定向、第二轮完整冻结与镜像仍待。

第二轮新代码需独立冻结、真实 PG/CH/浏览器及最终镜像本地验收。无 CNB 同步或任何托管触发；全部自主开发收工后只由父线程统一手动验收。真实外部账号、Windows 执行器、Ollama 官方下载、跨宿主集群等未测边界保持，不将仍可自主实施的本轮代码归为外部阻塞。

## ce6ebcc 定向复验与完整窗口基准

本段最初记录ce6ebcc；随后b0be327同口径完整窗口已实际通过，最终HTTP7009.640ms仍慢。以下已完成证据只绑定 `ce6ebcc0a2a54f2881418b21781b6aa31543605c`，不外推到 b0be327。

ce6ebcc 回放焦点与 workspace 导航两个真实 Chromium 专项均 PASS、0 skip，EXIT0：[浏览器证据](../../test-evidence/main-ce6ebcc-focus-workspace-browser.json)。覆盖真实回放多视口键盘操作、URL/历史恢复、移动抽屉及代表性 computed contrast；不代表ce6ebcc该历史SHA全29项浏览器复验通过，也不宣称全面可访问性认证。1e39942 的 28/29、回放 focus FAIL 和此前 4eead97 的 25/29 记录保留为历史失败。完整七筛选保存/编辑已有实现，不重复列为缺口。

ce6ebcc 不可变 Git archive 的独立严格单站基准完整性 PASS：[完整窗口证据](../../test-evidence/main-ce6ebcc-independent-strict-1000.json)。20 计划/20 发送/20 HTTP202，1000 接受，零拒绝、失败、延迟批次或未发送；只用生产后台 worker，未手动聚合。最终新 HTTP PV1000、coverage1、source clickhouse；认证正文 PV1001/UV21（含初始化 1 PV），九类 PG 正文表均零，outbox1001 全部 done、queued0，水位追平。934 个 Git blob 前后摘要一致；应用、CH namespace、PG schema、临时目录 cleanup 全 true。

采集窗口 2 次查询、排空窗口 4 次查询均成功；排空查询 P95 **7726.857ms**，最终完整 HTTP 查询 **8825.490ms**，排空 **49.151 秒**。最大积压650，最终0；同一 Node 应用与 harness 进程峰值 **642490368 字节**，不含 PG/CH/Redis。性能仍慢，不是实时 SLO、1C2G 或5000规模达标证据，不能用早期两次轻查询替代最终窗口。阶段计时可能嵌套/并行，不相加为 CPU 比例。

[有界读取与完整查询窗口](PREFETCH_VALIDATION.md) 记录后续044最多并发2次、单请求16MiB/总在途32MiB、有序100行和完整认证约束，以及受影响13项定向通过；b0be327完整窗口已实测，不从单次运行推断通用提速。下一步为19d97af最新同源完整浏览器/后端、后续同口径负载及最终镜像验证；历史失败和托管暂停规则不变。

## 历史19d冻结边界

历史10eb88a完整本地整轮实际EXIT0/cleanup：180单元+402真实集成全PASS，30检查=28真实Chromium+2日期全PASS/0skip。当前19d97af冻结全轮实际EXIT0：51文件191单元+152文件404真实集成=595 PASS，30检查（28真实Chromium+2日期）全PASS/0fail/0skip，浏览器1.6分钟；lint/type/SDK/build/migrate/compiledapp/Compose cleanup均0。最终最新镜像、新负载及托管仍待。所有旧FAIL/专项计数保留，不叠加到全轮。完整七筛选已实现；本轮不新增外部账号验证。托管暂停，不因文档更新触发。

19d97af 完整原始日志：`/tmp/baize-19d97af-local-final.log`；完整报告目录：`/tmp/baize-final-local.5Mr38r`，持久 evidence/photos 由负责人保存。不把191+404应用计数与30检查混成浏览器数量，不将历史专项加到595。19d97af镜像已实际EXIT0；该源1000 PASS、5000因9批未发送FAIL；后续ac86cd3新1000已PASS、5000实际FAIL，browser仍在运行，ac最新镜像未运行，托管保持不触发；旧性能FAIL保留，完整性通过不等于SLO。

## 19d97af 镜像与负载后续证据

19d97af 新镜像真实生命周期 EXIT0，证据已随 `0eb5e0c` 入仓：[镜像结果](../../test-evidence/main-19d97af-image-result.json)。55条 DDL、054两个索引安装、独立 signed restore、source unchanged 与 owned cleanup 均实际验证。该镜像只证明19d97af，不包括后续 TEMP 投影源码。

19d97af 独立严格1000总体PASS，最终完整查询 **6.058秒**；严格5000总体 **FAIL**：计划100批中9批未发送，仅4550 accepted（91批HTTP202），不能称5000完成。已接受事件六项strict完整性断言与全部排空通过，最终查询 **25.626秒**；这是4550可靠处理证据，不是5000/SLO达标。原 [5000 JSON](../../test-evidence/main-19d97af-independent-strict-5000.json) 与 [总结](../../test-evidence/main-19d97af-independent-summary.md) 随 `4a05fa2` 保留，旧负载FAIL不删除。

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
