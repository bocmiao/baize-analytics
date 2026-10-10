# 第二轮研究落实索引

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

## 当前冻结边界

历史10eb88a完整本地整轮实际EXIT0/cleanup：180单元+402真实集成全PASS，30检查=28真实Chromium+2日期全PASS/0skip。当前19d97af冻结全轮实际EXIT0：51文件191单元+152文件404真实集成=595 PASS，30检查（28真实Chromium+2日期）全PASS/0fail/0skip，浏览器1.6分钟；lint/type/SDK/build/migrate/compiledapp/Compose cleanup均0。最终最新镜像、新负载及托管仍待。所有旧FAIL/专项计数保留，不叠加到全轮。完整七筛选已实现；本轮不新增外部账号验证。托管暂停，不因文档更新触发。

19d97af 完整原始日志：`/tmp/baize-19d97af-local-final.log`；完整报告目录：`/tmp/baize-final-local.5Mr38r`，持久 evidence/photos 由负责人保存。不把191+404应用计数与30检查混成浏览器数量，不将历史专项加到595。19d97af镜像已实际EXIT0；该源1000 PASS、5000因9批未发送FAIL；后续ac86cd3新1000已PASS、5000实际FAIL，browser仍在运行，ac最新镜像未运行，托管保持不触发；旧性能FAIL保留，完整性通过不等于SLO。

## 19d97af 镜像与负载后续证据

19d97af 新镜像真实生命周期 EXIT0，证据已随 `0eb5e0c` 入仓：[镜像结果](../../test-evidence/main-19d97af-image-result.json)。55条 DDL、054两个索引安装、独立 signed restore、source unchanged 与 owned cleanup 均实际验证。该镜像只证明19d97af，不包括后续 TEMP 投影源码。

19d97af 独立严格1000总体PASS，最终完整查询 **6.058秒**；严格5000总体 **FAIL**：计划100批中9批未发送，仅4550 accepted（91批HTTP202），不能称5000完成。已接受事件六项strict完整性断言与全部排空通过，最终查询 **25.626秒**；这是4550可靠处理证据，不是5000/SLO达标。原 [5000 JSON](../../test-evidence/main-19d97af-independent-strict-5000.json) 与 [总结](../../test-evidence/main-19d97af-independent-summary.md) 随 `4a05fa2` 保留，旧负载FAIL不删除。

后续 `ac86cd3` TEMP投影有源码摘要绑定的14真实集成+2单元专项PASS；19d97af的191/404/30完整计数与镜像不外推为ac全轮或ac镜像通过。该句为当时历史状态；ac随后1000实际PASS5.316秒、5000实际FAIL（4800accepted/4unsent/42delayed/drain超时/final断言失败），当前ac browser专项30检查已PASS。真实外部未测及托管不触发规则保持，本段不新增功能范围。

## 0f14当前源码与ac投影边界

当前验收按各不可变源码分别记录，不将后续提交自动视为同源通过。最新已完成完整冻结仍为19d97af：191单元+404真实集成=595 PASS，30检查（28真实Chromium+2日期）全PASS；其生产镜像55条DDL、054两个索引、独立signed restore/source unchanged/cleanup实际EXIT0。此证据不外推后续源码。ac86cd3 TEMP投影只有源码摘要绑定14真实集成+2单元专项PASS；其独立1000 PASS、最终HTTP5.316秒，5000总体FAIL：4800accepted、4unsent、42delayed、drain超时且final断言失败。ac源码浏览器实际30检查（28Chromium+2日期）PASS/0skip，96.441秒、EXIT0，不称ac完整整轮或镜像通过。旧FAIL和外部未测保留，托管不触发。

现有保护为单请求timeout、完整EOF、正文caps、每批100行精确归属oracle及站点/删除fences。B对应显式SELECT server throw的预算guard首片代码已轻量8单元PASS，真实PG/CH验收未跑；C整操作累计SELECT次数/decoded bytes/deadline整操作预算已获批准开始实作，当前仍在制未实现验收。预算限制不等于性能改善，该自主欠项不需要新增凭据，不归类为外部账号阻塞。

当前人工日期标注后续UI切片由D开始实作，属于自主在制，不是外部凭据阻塞。GSC不扩第二stage；Ollama未测原因是官方工具下载网络阻断，Windows是执行器启动错误，Google/SERP/商业模型等另为真实外部账号/服务未测，三类原因不混合。

冻结补记：ac86cd3浏览器30检查（28真实Chromium+2日期）实际PASS/0skip，96.441秒、EXIT0；其191/404完整后端全轮未复验，不叠加旧19计数。当前4384后续预算切片尚未全量通过；B真实3项仅证明服务器行为，200 exception风险仍待C适配，不能称adapter已验。aea2ece日期标记4单元PASS、浏览器未跑。预算口径为SELECT次数/decoded bytes/deadline，不承诺scan或heap限制。原FAIL全部保留。
