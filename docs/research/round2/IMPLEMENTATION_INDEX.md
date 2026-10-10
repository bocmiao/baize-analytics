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
| 独立负载与阶段成本 | 保留 7f 串行 5000 的实际失败 | ce6ebcc 独立严格1000完整窗口已执行且完整性通过，排空/最终查询仍慢；b0be327 同口径新优化结果待；root 协调 |
| SEO 规则 v2 与原目标复测 | 已有扫描/复测，缺 HTTP 头、结构化 unknown 与定点状态 | 下一批局部契约和真实本地 fixture；B external |
| GSC 覆盖契约 | 已有 25k 分页和失败事务保护 | 窗口/维度/PT/提供商不保证完整、本地导入与展示截断分开；B external |
| 首次接入状态 | 050 同采集事务记录接收时间/代次，独立 intake-status API 与 IntakeStatus 卡片已接入 | E 私有 7ace 变体真实 PG 专项 1 PASS；root 新 observer 专项 1 PASS。只读观察/待聚合/可用，不访问用户站点、不制造 PV、不认证安装；新 UI 验收未跑 |
| Bot 理由统计 | 050 固定 reason/ruleVersion 按站点日统计，BotReasons 卡片已接入 | 同一 E 真实 PG 专项覆盖分类、声明事件数量与 legacy_unknown；请求不等于有效 PV，不持久化 IP/UA/正文。新 UI 验收未跑；E governance |
| 完整七筛选保存与编辑 | b7 真实集成已通过 | 不重复实施；原浏览器定位失败保留；07f9ada两例定向真实复验PASS，不冒称新全套 |
| 人工日期标注 | 053 站点/真实日期 CRUD，持久化创建或编辑时站点时区快照；Annotations 卡片已接入 | E 真实 PG 专项验证时区变更保留原备注快照、viewer 写权限拒绝；不输入 AI 测量或因果证据。新 UI 验收未跑；E governance |
| 管理员自托管诊断 | self-host-diagnostics 白名单只读摘要/下载与 SelfHostDiagnostics 卡片已接入 | E 真实 PG 专项验证管理员权限、敏感值排除、max1 无借池等待；备份元数据不冒充恢复验证，未验证与失败分开。新 UI 验收未跑；E governance |
| 分组导航与 URL 恢复 | 分组真链接、白名单 URL/历史与移动抽屉已接入 | ce6ebcc workspace 真实浏览器专项通过；全29未复验，原FAIL保留；D web |
| 总览与筛选层级 | 已有真实趋势、维度、币种分离 | 下一批 D web，先纵向总览→筛选→明细→返回；不捏造零/因果 |
| 响应式/可访问 | b7 已有容器观察、回放缩放、静态对比和部分真实检查 | 新回放例选站窄修已定向真实PASS；五视口/200%文本及 ce6ebcc 回放焦点专项已实际通过，代表性 computed contrast 有证据；不称全面认证/全29通过；D web |
| 状态语义与设置分层 | b7 新连接设置已通过真实浏览器；保存不称连通 | 下一批 D/B 分工，loading/error/empty/partial 分开、已配置 AI 先问数 |

本执行器安装技能盘点没有 React/UI 专项技能；不宣称使用不存在的技能，不盲装外部风格。已有品牌、数据表与地图 select 保留。

## 验收与阶段边界

b7a0a5f 冻结源本地全新 Compose：114 单元、395 集成通过；27 浏览器检查中 25 通过、2 失败（含 2 个日期函数，23 个真实 Chromium 通过）。失败为新增报表/成员、响应式回放；完整日志已保留，不能称全集通过。独立 CH 原生完整恢复另有 EXIT0 专项，不加入测试总数。新镜像及性能重测仍待。

7ace27e 首次第二轮后端冻结结果：146 单元通过；36 集成中 34 通过、2 失败。原始失败保持有效记录，不改写为整轮通过。E 首个失败是站点创建公开契约为 201、测试旧期望为 200；B 另一失败单独修复、验收。

E 从 `/tmp/baize-main-7ace27e.xtw3kxyl` 复制独立变体，仅覆盖 `operations-observations.test.ts` 的 201 期望、临时 keys 子目录与启动失败清理。实际单文件命令 EXIT0：1 PASS、0 FAIL、0 skip，完整接入→采集→worker、Bot、标注时区、诊断脱敏和权限断言保留。证据 `/tmp/baize-operations-7ace-first.json` 与同名 `.log`；隔离 `operations_%` schema 剩余 0，应用和临时目录已清理，测试未开启 HTTP listener。root 随后新 observer 定向专项亦 1 PASS。两次定向结果不累加为新的全量计数，也不代表新卡片浏览器通过。IntakeStatus 原型键安全回退及 owned fixture lint EXIT0；UI 定向、第二轮完整冻结与镜像仍待。

第二轮新代码需独立冻结、真实 PG/CH/浏览器及最终镜像本地验收。无 CNB 同步或任何托管触发；全部自主开发收工后只由父线程统一手动验收。真实外部账号、Windows 执行器、Ollama 官方下载、跨宿主集群等未测边界保持，不将仍可自主实施的本轮代码归为外部阻塞。

## ce6ebcc 定向复验与完整窗口基准

当前 main 已推送 b0be327；该提交的新优化同口径测试正在进行，尚无结果。以下已完成证据只绑定 `ce6ebcc0a2a54f2881418b21781b6aa31543605c`，不外推到 b0be327。

ce6ebcc 回放焦点与 workspace 导航两个真实 Chromium 专项均 PASS、0 skip，EXIT0：[浏览器证据](../../test-evidence/main-ce6ebcc-focus-workspace-browser.json)。覆盖真实回放多视口键盘操作、URL/历史恢复、移动抽屉及代表性 computed contrast；不代表该 SHA 全 29 项浏览器复验通过，也不宣称全面可访问性认证。1e39942 的 28/29、回放 focus FAIL 和此前 4eead97 的 25/29 记录保留为历史失败。完整七筛选保存/编辑已有实现，不重复列为缺口。

ce6ebcc 不可变 Git archive 的独立严格单站基准完整性 PASS：[完整窗口证据](../../test-evidence/main-ce6ebcc-independent-strict-1000.json)。20 计划/20 发送/20 HTTP202，1000 接受，零拒绝、失败、延迟批次或未发送；只用生产后台 worker，未手动聚合。最终新 HTTP PV1000、coverage1、source clickhouse；认证正文 PV1001/UV21（含初始化 1 PV），九类 PG 正文表均零，outbox1001 全部 done、queued0，水位追平。934 个 Git blob 前后摘要一致；应用、CH namespace、PG schema、临时目录 cleanup 全 true。

采集窗口 2 次查询、排空窗口 4 次查询均成功；排空查询 P95 **7726.857ms**，最终完整 HTTP 查询 **8825.490ms**，排空 **49.151 秒**。最大积压650，最终0；同一 Node 应用与 harness 进程峰值 **642490368 字节**，不含 PG/CH/Redis。性能仍慢，不是实时 SLO、1C2G 或5000规模达标证据，不能用早期两次轻查询替代最终窗口。阶段计时可能嵌套/并行，不相加为 CPU 比例。

[有界读取与完整查询窗口](PREFETCH_VALIDATION.md) 记录后续044最多并发2次、单请求16MiB/总在途32MiB、有序100行和完整认证约束，以及受影响13项定向通过；新优化性能对比尚无结果。下一步仍为 b0be327 同口径负载结果、最新同源完整浏览器/后端及最终镜像验证；历史失败和托管暂停规则不变。
