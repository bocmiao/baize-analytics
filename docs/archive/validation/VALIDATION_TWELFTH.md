# 第十二批本地联合验收

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

冻结提交 ef55e12ce545dfc8c12e0ec09da2dd4bae00b850，Git archive独立目录 /tmp/baize-final-round2-i2pj2opo。实际命令 bash scripts/validate-local-final.sh，EXIT0。新卷PG17/CH25.8/Redis7；168单元、150文件400真实集成，零失败零跳过；29浏览器检查（27真实Chromium+2日期函数）全部通过。lint、类型、SDK、tracker与应用构建、迁移、compiled生产入口健康及共享regular CI本地等价命令通过。owned Compose清理后仅原三个开发服务存在。

覆盖此前be95373两项夹具失败、4ee浏览器四失败、1e回放focus失败的当前完整轮；旧FAIL报告保留，不把修复后的定向结果加到本轮计数。完整输出和两JSON在 docs/test-evidence/main-ef55e12-*。外部Google/模型transport明确模拟，PG/CH和Chromium真实；不冒充外部账号验收。

本轮包含050–053、两批正文有界预取、第二轮SEO/GSC契约、导航与语言可访问性修复。之后用户要求紧凑数据口径的UI改动、比较期共享读取和新卡片浏览器专项尚未纳入该冻结，另行验证；新镜像尚未执行。GitHubActions禁用、CNB不触发。

ce6ebcc/b0be327单站strict1000完整性通过不代表性能达标：最新排空P95 6.44秒、最终HTTP7.01秒、Node app+harness峰665MB（不含存储）。阶段总量混合初始化/采集/排空/最终，inclusive不相加当CPU；HTTP侧CH1496次18.301秒/185.8MB，认证1428次7.732秒，TEMP2517次6.893秒，SQL166次0.909秒。主要待查正文读/认证/TEMP频次，不能用预算提前失败伪装性能改善。

## 紧凑UI首轮（保留失败）

b6bb4f96a0cd10072b1a39950135b4a7c6efb671 新空Compose/实际compiled UI，30检查中28通过、2失败、零跳过，EXIT1，资源清理完成。原29中27通过；新AI截图阶段中文日期定位错误超时、新operations接入卡刷新后折叠导致locator不可见。已准备窄fixture修复，不改变产品/隐私/权限/状态断言；实际重跑尚待。SEO中文1440/390、紧凑总览与可访问workspace已产出真实截图，当前没有AI最终图，不提前勾全绿。证据main-b6bb4f9-browser-failed.json保留。

516ce9d四浏览器专项2PASS/2FAIL（总览和SEO截图通过）。AI附加截图受到真实预算429保护；时区更新后旧事实受到503保护，background:false fixture未重算。窄修只配置模拟模型测试站点预算及真实worker重算，不削产品guard；旧失败保留 main-516ce9d-four-browser-failed.json。

比较期读取复用专项：新增同一站点事务共享已认证事实SQL TEMP，严格等长当前/上一窗口与相同path过滤各自计算；只normalized比较，legacy与单范围保持原行为。真实HTTP route/PG/CH1项+2单元通过，max1无借池等待；删除epoch变化与物理丢失正文仍拒绝。该定向结果不加到ef55e12全轮568计数；不声称普通查询提速。证据comparison-shared-snapshot-real.json。

2bf840d 最新整套浏览器30/30 PASS（28真实Chromium+2日期），97.83秒、0 skip，EXIT0。包含预算429不增加provider调用、模拟fixture预算明确调整后真实1PV/0÷1图表、时区修改后真实worker重算，再完成原备注/诊断/权限断言。owned Compose清理验证。证据main-2bf840d-browser.json。

实际图像复核发现AI调用记录仍早于问数，本次下一切片进一步前置问数、后置技术记录；存储固定枚举计时标签也在下一冻结，均尚未被2bf浏览器或ef全轮覆盖。观察标签轻量13单位通过、types/lint通过；首次类型参数错误保留，不改变EOF/SQL/超时/池行为。

## 08eab82 最终同源本地全轮

完整冻结 `08eab82853ab1d625c35371085f10f136477b8b5`，实际 `bash scripts/validate-local-final.sh` EXIT0。46文件173单元、151文件401真实集成全部PASS，0失败0跳过；30检查=28真实Chromium+2日期函数全部PASS、0跳过（runner显示1.6分钟）。lint/types/SDK/tracker及应用构建、全新PG/CH/Redis卷、compiled Node、真实native operational恢复与owned cleanup均通过。原始日志/JSON/source摘要见 `test-evidence/main-08eab82-*`，阶段计数不累加，所有先前FAIL保持。

最终中文workspace、SEO、AI各1440/390和总览/回放1440/375实截图位于 `screenshots/08eab82/`，图像SHA记录在最终报告。模型/Google运输明确模拟；本地数据库、HTTP、浏览器和PG dump/restore是真实。截图不证明付费API或真实OAuth账号已测。最新全部源码生产镜像、跨物理宿主灾备及托管CI仍未在本轮执行；不把f4镜像或b7 native通过冒称该新镜像通过。

## 0c3ca6a AI窄范围后续（失败保留）

新冻结 `0c3ca6ac06c459c824f0a1a5fc1a13497d4328d4` 的AI语言浏览器专项实际EXIT1：0PASS/1FAIL/0skip，95.975秒，中文“用途”selectOption超时；测试预算90秒内模拟provider已请求10次。web正在诊断，尚无修复通过结果。本次仅定向AI，不改写08eab82完整全轮PASS，也不能称新源浏览器回归通过。原始两日志及summary保存为 `test-evidence/main-0c3ca6a-ai-*-failed.*`；浏览器/本地应用真实，模型运输模拟。

后续c7ccdea AI scope窄修真实复验EXIT0：完整SHA `c7ccdeae1616a9e6d9c9e040c5ce42e7a05fbbd0`，1真实Chromium PASS/0FAIL/0skip，17.786秒。原始reporter及两日志见 `test-evidence/main-c7ccdea-ai-*`。最新AI中文1440/390图位于 `screenshots/c7ccdea-current-ai/`，独立标注源码，不替换08eab82总览/SEO等完整轮截图。0c失败仍保留；该定向PASS不是最新源全浏览器或性能改善证明，模型运输仍模拟。

## 10eb88a 完整本地全轮

完整冻结 `10eb88a2d16cab2f22d079a9c128cbb37900448a` 实际EXIT0：180单元、402真实PG/CH/Redis集成全部PASS/0FAIL/0skip；30检查=28真实Chromium+2日期函数全PASS/0skip（runner1.7分钟）。lint/types/SDK/build、新隔离数据库卷、compiled应用、真实native PG dump/restore及owned cleanup均通过。原始报告与source摘要 `test-evidence/main-10eb88a-*`。所有旧FAIL保留；不累加其他阶段数量，不把下一b65候选或新镜像提前记通过。

当前短范围中文workspace总览、SEO、AI1440/390实截图在 `screenshots/10eb88a/`；另存响应式overview1440/375，375不改名冒称390。图像hash入summary，旧08/c7图保留。Google/GSC及模型transport仍模拟，本地PGCHRedis/HTTP/Chromium真实。新生产镜像、托管及跨宿主DR仍待。

后续不可变b65aefa959066a45444b668f02614ce1568c5dbe事实pair真实PG/CH专项3文件13检查实际12PASS/1FAIL/0skip、EXIT1。Unicode正文真实往返通过，但新rollback留下2行CH orphan，旧sweep断言expected1实际3；analytics正在按own run物理清理，不降低旧断言。证据 `test-evidence/main-b65aefa-fact-pair-failed*` 保留；不能称全部pair已通过，不改写10eb完整全轮结果。

## 19d97af 054与bulk完整本地全轮

完整冻结 `19d97afcd6ad4c7adf08437bf82c1124d4057f8d` 实际EXIT0。51文件191单元、152文件404真实集成，共595应用检查全部PASS/0FAIL/0skip；30检查=28真实Chromium+2日期函数全PASS/0skip（runner1.6分钟）。lint/types/SDK/build、55文件实际迁移、全新PG/CH/Redis卷、compiled入口及owned Compose cleanup通过。原始JSON、日志、source摘要见 `test-evidence/main-19d97af-*`；不将其他定向或负载数量加到全轮。

最新中文workspace总览/SEO/AI桌面1440与手机390，以及独立overview1440/375实截图保存 `screenshots/19d97af/`，hash和完整源码归属记录在summary；旧图/旧FAIL仍保留。真实本地数据库/HTTP/Chrome，Google/GSC及模型运输模拟。原生恢复真实证据不等于最新生产镜像通过；新镜像、托管、跨宿主灾备均未在本轮执行，独立1000/5000负载另由root记录，不提前标绿。

## 19d97af 最新生产镜像与受影响运维路径

root实际唯一串行镜像runner EXIT0。新镜像 `sha256:760e1bb3c1ce31da32f32c7c3ea91f72d6971c764db081c31ac7f8ca87e5a80f` 对应不可变 `19d97afcd6ad4c7adf08437bf82c1124d4057f8d`；387项source/image逐文件一致，源码manifest SHA256 `3a8370eaa1d28bb7125cba281c295aa58997d560e5f6284d878aeb96fa6f9fb2`。真实安装/build、compiled Node健康与HTTP采集通过，55个迁移文件实际应用，054 receipt为1、两个准确nonunique lookup索引安装/valid/ready断言为2。

完整AGPL/MIT notice实际镜像检查通过；tracker core gzip5087B符合5KiB但超过十进制5000B，min4506B均符合，不混用口径。真实PG快照与签名原生恢复覆盖非空36/43/44/47/48、049receipt与050–053五表metadata；最新journal精准A删B留、7→90前向保留期与canonical/028回放物理裁剪、缺失/tamper/future/非空目标拒绝、worker真SQL失败拒绝及恢复均通过。独立目标CH服务器和卷无发布端口，源正文/epoch/history保持；仍为同物理宿主，不是跨宿主灾备。owned应用/PG/Redis/目标CH及卷网络已清理。

安全摘要及manifest/native/notices/index/cleanup证据见 `test-evidence/main-19d97af-image-*`；不复制state/env/密钥或原始service日志。旧f4基础升级/故障回滚矩阵EXIT0单独沿用，未在本轮无限重跑，也不把旧FAIL抹掉。托管CI/同步未执行。

ac86cd322ef3d89d791c62f3c50cfc269cf66755完整浏览器套件实际EXIT0：30检查=28真实Chromium+2日期全PASS/0FAIL/0skip，fresh本地Compose/build/migrate/compiled入口及cleanup。原始reporter与日志见 `test-evidence/main-ac86cd3-browser-*`。此为浏览器范围，不能继承19d97af的191/404单元集成计数，ac新镜像未执行；新预算/标记仍待最终冻结。Google/模型transport模拟，托管未触发，旧FAIL保留。

## de7222e 预算联合全轮（失败保留）

完整不可变 `de7222edfd6baa7478a4e32e22f6b5399fc34daf` 本地全轮实际EXIT1，owned Compose cleanup完成。54文件209单元PASS/0FAIL/0skip；154集成文件153PASS/1FAIL，417检查415PASS/2FAIL/0skip，两失败均CH stats source回归。浏览器与新镜像**未运行**，不能记新预算完整回归通过。原始unit/integration JSON、1112tracked blob源码归属、source摘要及原日志hash保存在 `test-evidence/main-de7222e-*`；不复制raw service/密钥内容，旧FAIL均保留。C/A窄修另在新源码验收，不改写本冻结失败。

c890be3c2a458d9a7934cd1d8133fbe3ec2032bd完整本地runner实际EXIT1/cleanup：55文件211单元与155文件421真实集成，共632后端检查全PASS/0skip；浏览器30中29PASS/1FAIL/0skip（27真实Chrome+2日期通过，1真实Chrome失败）。失败是operations canvas固定x58未命中真实渲染bin的夹具坐标，后端source并未失败，但不能称完整全轮PASS。image未运行。原JSON/失败日志hash/1127blob绑定见 `test-evidence/main-c890be3-*`，后续fixture修复的browser独立新源复验不重写本失败。

1c1cb6570a3f093ff9b2e46e8e4b501ed8d81340 operations定向真实Chromium1PASS/0skip、EXIT0、10.333秒。按真实bin中心点击验证日期标记与键盘双向焦点、PV/时区/权限，reporter含生成annotation附件记录；后续全轮重置test-results前未能复制专项原图，最终图待全轮另存，不伪造hash。证据 `test-evidence/main-1c1cb65-operations-browser-*`，1128trackedblob绑定（不是11128）。本定向通过不能称同源全30通过；完整套件尚在root运行，旧c890失败保留。

同源1c1cb6570a3f093ff9b2e46e8e4b501ed8d81340完整浏览器30/30 PASS、0skip、EXIT0、92.644秒，28真实Chromium+2日期，fresh Compose/compiled app/cleanup。最终中文workspace/SEO/AI1440/390、overview1440/375及真实英文annotation键盘交互截图已立即保存 `screenshots/1c1cb65-final/`；实际像素/viewport口径、hash及annotation metadata/source在 `test-evidence/main-1c1cb65-browser-*`。不能把英文annotation标中文，不能把375改称390。632后端检查仅c890实际通过，应用源码相同已blob/diff验证，未在1c重跑。新image尚未执行，旧FAIL保留。

## 1c1cb65 最新生产镜像实际通过

完整源码 `1c1cb6570a3f093ff9b2e46e8e4b501ed8d81340` 的新镜像 `sha256:a5d495d6cc78a419963dc43a0aa8549577ede1876c39d8b32377f38966c21c1b` 实际runner EXIT0。391项source/image逐文件相同，源码manifest `12e5223805f77c0497c0729cf15dc8943d7c29ba73fa2f7f92d82e7678768bde`；安装/compiled Node健康与真实HTTP采集通过，55迁移文件应用，054准确两个nonunique索引valid/ready断言通过。compiled `configuredStatsReadLimits()` 实际读取Compose转发默认120000ms/20000 SELECT/2147483648 decoded bytes，安全probe只输出三数值。

实物完整AGPL/MIT notices通过；core tracker gzip5087B≤5KiB但>5000B，min4506B双口径符合。真实签名原生独立CH服务器恢复覆盖非空carry/header/fact/remaining/cache和最新metadata；源正文/epoch/history不变、最新journal A删B留、retention前向与物理回放裁剪、真实worker故障拒绝/恢复、缺失/tamper/未知schema/非空目标拒绝均通过。目标同物理宿主第二服务器独立卷、无hostports，不是跨宿主DR。owned stack/volumes/network清理完成。

安全summary/manifest/native/index/probe/notices/HTTP/cleanup证据 `test-evidence/main-1c1cb65-image-*`；不复制state、env/keys或raw services。旧FAIL保留，旧f4未变化故障矩阵单列不重数。托管未运行；root同源固定负载另行记录，镜像通过不能代替性能达标。

bd3f51fc1f7dba84a1fdbde75edfcdbecfcf24e8完整本地runner实际EXIT1/cleanup。213单元PASS；424集成423PASS/0断言失败/1skip，另有uncaught PG FATAL25P04（idle transaction终止）使实际失败，不能以JSON success=true或0断言失败记全绿。strict-identity-restore因runner缺BAIZE_OPS_POSTGRES_CONTAINER跳过；浏览器/image未跑。lint/types/SDK/build已过。安全原report结构（client/credential脱敏）、原loghash及实际summary在 `test-evidence/main-bd3f51f-*`，不复制serialized PGclient或service原始日志；旧FAIL保留。下一tempfullrunner使用原validate-local-final.sh明确ownPGcontainer变量，不改产品skip条件。

0a0c171fc17e647fecf38dd55d4bc8e0f0144fbb正式全轮实际EXIT2/owned cleanup。lint通过，typecheck在stats-read-budget.test.ts13/14因EventEmitter value/type TS2749失败；unit/integration/browser/image均未运行，不把此前19定向或10单元计作本全轮。1191blob归属、实际命令/失败日志/原hash见 `test-evidence/main-0a0c171-*`。root下一test-only InstanceType修复尚需新冻结验证，原源码失败不改写；服务原始日志/秘密未复制。

0a之后test-type修复WIP首轮完整单元实际EXIT1：215中213PASS/2FAIL，snapshot fake PGclient缺.on事件接口；type/lint通过。sourceCommit=null，基于0a并有未提交测试修复，不能冒某提交完整验收。reporter与summary `test-evidence/idle-testtype-unit-first-failed*` 保存，后续test-only EventEmitter mock修复第二轮尚在跑，不预称通过。

## 66150be 完整空库本地全轮

完整不可变 `66150be474e9988d0410256cde005d153e021680` 实际EXIT0/owned cleanup。55文件215单元、156文件426真实集成，共641应用检查PASS/0FAIL/0skip/0unhandled；30E2E=28真实Chromium+2日期全PASS/0skip。lint/types/SDK/build、55迁移、compiled入口、真实native operational恢复及fresh PG/CH/Redis通过。报告经敏感字段检查/脱敏，原loghash/source1198blob归属与summary见 `test-evidence/main-66150be-*`。浏览器本轮list-only日志，无reporterJSON则不伪造。

最终中文workspace/SEO/AI1440/390、overview1440/375和annotation实图立即存 `screenshots/66150be/`，实际PNG像素、语言及hash入summary；annotation原case英文1280视口，不标中文390，metadata仅保存实际输出，不伪造附件。Google/模型运输模拟；所有旧FAIL不改写。661新image和当前fixedload完成尚未记录，托管/跨宿主DR未执行，不把完整性通过冒称性能达标。

66150be新镜像首轮实际EXIT1：build/install/compiled健康、source-image一致、55DDL/0542索引/三budget默认/完整notice/真实HTTP已过，但owned目标CH启动退出233，实际filesystem报ENOSPC于preprocessed_configs；native独立签名恢复未运行，不称该新镜像完整运维PASS。cleanup后3.1GiB可用/inodes43%不能证明启动时峰值；没有线程失败证据，不改limit。安全先过阶段文件与目标错误摘录/原日志hash见 `test-evidence/main-66150be-image-first-failed-*`，不复制原services/state/keys；旧FAIL全部保留。

d67bb8aeda34652010125e889019392aaa0788f8正式全轮实际EXIT1/owned cleanup。217单元+428真实集成=645全部PASS/0skip；浏览器29PASS/1FAIL，中文分享readonly提示5秒未找到，仍由D诊断，不能称整轮PASS。新image未运行。实际list日志/后端JSON/source1240blob/hash/全部实际截图保存 `test-evidence/main-d67bb8a-*` 与 `screenshots/d67bb8a-failed-full/`，无JSONreporter则不伪造；旧FAIL保留。

d67bb8a新生产镜像实际session25352 EXIT0。image `sha256:1c0bba1c48802e42cca295e2a2d4a20723760945b03ddbfce7ae347e3d393de7`，391项source/image完全一致，manifest `1dab3fdf1a7d6c93c3061255dd44d9ec1bfed7a0742ec99b0c1f327d331a32b7`。真实compiled安装/HTTP、55DDL/0542索引、budget120000/20000/2147483648与完整notice通过；签名独立CH服务器恢复、最新journal精准A删B留、来源正文/epoch/history不变、worker真实故障拒绝/恢复及全部negative guards通过。目标同物理宿主/nohostports，不是跨机DR，owned cleanup后仅原3服务。安全证据 `test-evidence/main-d67bb8a-image-*`，旧661 ENOSPC FAIL与旧f4故障回滚scope保留。

资源观测必须保留：阶段可用磁盘曾低至62MiB，cleanup后恢复3.7GiB。前置2GiB gate未降低，但只能限制阶段开始，不能保证build/卷/恢复峰值；本次成功不抹去容量风险或证明资源SLO。根尝试终止ownrunner时PID已消失，测试未被中断或重跑。新固定负载和最终browser另行验收，镜像通过不替代二者。

ce42c9f6a43a8110e002c71880112b1aa7fa4261独立完整浏览器实际EXIT0：30PASS/0FAIL/0skip（28真实Chromium+2日期），95.953秒，owned cleanup后仅原3服务。完整list+JSON、source1240blob、真实九图/像素/hash/viewport/annotation附件metadata已保存 `test-evidence/main-ce42c9f-*` 和 `screenshots/ce42c9f/`。中文workspace/SEO/AI1440/390，独立overview1440/375，annotation实际英文1280，未重标或造metadata。

ce42仅测试发布等待修正，src/db/packages/sdk/scripts对d67真实emptydiff；645后端与新镜像EXIT0实际归属d67，不宣称ce42重跑或重建。旧d67分享失败仍保留。模型/Google运输模拟，最新固定负载仍root另行运行，浏览器通过不代替性能达标。
