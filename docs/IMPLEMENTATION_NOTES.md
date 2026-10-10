# 白泽首轮实现修正

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

日期：2026-10-10

本文件记录对 PROJECT_SPEC.md 中伪代码与示意数据模型的实施修正。原始报告保留，不能把示意 SQL 视为已验证迁移，也不能把本文件视为功能已实现。

## 许可实施决策（覆盖原稿待定项）

主体明确采用 `AGPL-3.0-only`，独立 `packages/tracker` 采用 MIT。该决策覆盖 `PROJECT_SPEC.md` 第24行仍保留的 only/or-later 待定措辞；原调研稿不改写。以根 `LICENSE`、根 `package.json` 及 tracker `LICENSE` 为实施入口。独立 MIT 源码的公共 wire 类型位于 tracker 自身边界，没有运行时或类型路径指向 AGPL server/contracts。仓库与 tracker manifest 的 `private:true` 表示未向 npm 发布；本地分发产物不等于公开发行或完成法律审计。

## 已确认边界

- 仓库保持私有，未经用户另行授权不公开或部署。
- 独立开发，TypeScript 全栈；Fastify、React/Vite、PostgreSQL。主体 AGPLv3，独立 tracker MIT。主体已定为 AGPL-3.0-only；原稿待定措辞由上方许可实施决策覆盖。
- 所有产品功能免费；外部模型、SERP、服务器等成本由部署者承担。

## 首轮必须落地的修正

1. 聚合：不得用当前批次替换整个周期的数据。使用完整受影响桶重算与同桶互斥，或事务化幂等增量；generation 必须有实际比较和拒绝旧写入机制。测试双 Worker、跨批次、崩溃重试。
2. 会话：按事件时间归因而非 now()；明确迟到、乱序、跨日和多标签页规则。统一跳出口径，并为 SPA/心跳加入页面实例关联。保留可重算的脱敏可见时长数据。
3. 删除：采集事务也要检查删除标记并与删除操作协调，不能先写回明细再仅由 Worker 丢弃。按 user_id 删除前展开 visitor_id 映射。独立删除日志可靠保存后才宣布完成。恢复前重放、重建受影响聚合、清缓存并使旧任务失效。
4. 分区：event_data 的主键应包含分区键 ts 和站点隔离键。多个站点共享分区时，按站点保留期清理记录；只有整个分区均过期时才移除分区。
5. 幂等：明确相同 site_id/event_id 携带不同 ts 或内容的冲突策略；不能仅依赖带 ts 的唯一键表示全局事件幂等。
6. 隐私：网关内存中先提取可信 IP，再限流、过滤、计算 HMAC 和解析地域，随后持久化脱敏结果。原始 IP 不进入日志、持久队列、错误报告或 Redis 明文限流键。每日盐模式不提供跨日访客去重或留存。
7. 协议和模型：补齐 identify 消息、页面实例标识、站点权限隔离，以及来源/设备/地域查询所需维度；事件属性 boolean 与 EAV 类型必须统一。可靠事件/任务的认领、租约、完成和恢复必须对应实际字段与事务。
8. 测试：分位数样例增加不同样本量以识别错误的分位数平均；增加迟到事件、时区午夜、重复心跳、并发删除、恢复后旧 Worker、不同站点保留期测试。示例中的时间区间与可见时长需自洽。

## 历史交付状态与后续阶段记录（SHA/时间按原文）

当前验收按各不可变源码分别记录，不将后续提交自动视为同源通过。最新已完成完整冻结仍为19d97af：191单元+404真实集成=595 PASS，30检查（28真实Chromium+2日期）全PASS；其生产镜像55条DDL、054两个索引、独立signed restore/source unchanged/cleanup实际EXIT0。此证据不外推后续源码。ac86cd3 TEMP投影只有源码摘要绑定14真实集成+2单元专项PASS；其独立1000 PASS、最终HTTP5.316秒，5000总体FAIL：4800accepted、4unsent、42delayed、drain超时且final断言失败。ac源码浏览器实际30检查（28Chromium+2日期）PASS/0skip，96.441秒、EXIT0，不称ac完整整轮或镜像通过。旧FAIL和外部未测保留，托管不触发。

现有保护为单请求timeout、完整EOF、正文caps、每批100行精确归属oracle及站点/删除fences。B/C整操作SELECT次数、decoded bytes、deadline预算及服务器/适配器失败关闭已实作，并由de专项13真实+17单元验证；最新完整整轮和镜像尚未运行。预算限制不等于性能改善，该自主欠项不需要新增凭据，不归类为外部账号阻塞。

### 历史第七实施快照（保留原失败与计数）

更新时间：2026-10-10。本文件最初“仅初始化、尚无应用”的阶段已结束；该陈述作为早期阶段历史，不代表当前交付状态。当前已有TypeScript/Fastify/React/Vite/PG/Redis应用、独立MIT tracker、应用单元/真实PG/CH/Redis集成与Chromium浏览器流程、构建和私有CI配置，以及实际本地Docker安装/备份/独立卷恢复/升级/失败回滚证据。仓库仍私有，未向外网部署。

最近已记录的第五不可变应用阶段为272测试（80单元+192集成）、19检查（17实际浏览器+2日期）；第五Docker c61030b4生命周期EXIT0。第六pre-deletefix为84单元+205集成=289，20检查（18实际浏览器+2日期），不含随后AI删除hooks等改动，不与第五数字相加。详见[主验收](VALIDATION_MAIN.md)和[逐项清单](IMPLEMENTATION_CHECKLIST.md)。

第七第二冻结阶段已实际执行：84单元；234集成中228通过、6失败，原始gzip/MIME失败记录保存在docs/test-evidence/seventh-gzip-mime*。根线程已做nativeHTTP修复及定向检查，新的完整冻结验收仍待执行/汇总；这里不预写最终main/镜像通过数量。新标准MCP已默认注册并有官方SDK真实HTTP/PG4项定向通过；AI trace/chart与派生失效已接当前生产路径；G2治理与规范事实、canonical adapter/回放索引等是定向开发切片，不能替代第七全量结果。

全部F01–F66/P2仍按逐项证据判定：该历史快照的canonical activation仍关闭（当前guard已启用），混合回放记录物理删除/恢复已有C4三项真实PG/CH定向验证，但原生canonical浏览器、完整迁移集成与规模SLO仍有明确剩余；真实Google/企业微信/付费SERP/MaxMind账号、模型质量、Windows/小程序设备等未实测项单列。README/API/中英运行手册已更新，不能把计划、模拟provider或本地环境smoke标成真实外部验收。

第七后续结果：root冻结源分阶段84unit+234integration=318通过，correctenv freshschema20E2E（18browser+2date）通过50.8s，compiled/build/type/lint通过。原路径缺失及未export测试DB失败记录保留，不能写单次sharedregular EXIT0。该阶段含030/031/032与标准MCP，033/034/035及C4/物理回放保留仍属下一批定向工作树，不提前标作当前main全量验收。

第七已保存main里程碑：`fa3e82873d9b9e3cb1b139fbea3db9c742995a48`（root已推送，当前只读git log核验）。对应root上述分阶段318PASS+correctenv20PASS，不表示单次sharedregular EXIT0；037回放保留/proof及033/034/035/036/040等后续工作树切片不提前算入该提交或上述计数。

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
