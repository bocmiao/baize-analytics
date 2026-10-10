# main 开发里程碑验收（最新已推送快照 b56b7e9）

当前已推送 main 为 b56b7e9。最新独立索引快照实际通过 36 文件、148 应用测试（59 单元/89 集成）和 13 Playwright 用例（11 浏览器流程/2 日期纯函数检查），均 0 失败、0 跳过。精确日志见 `test-evidence/second-main-tests.json`、`test-evidence/second-main-e2e.txt`。真实 WordPress 本地运行栈已验收通过，不能再列为未验收。以下首批结果为历史记录，不能代表所有后续在制修改。

当前在制：ClickHouse 全应用切换/隐私故障验证、多语言外部错误语义、身份收入专项界面及新的最终镜像矩阵，均须单独记录后续结果。100k与1M真实完整管线均已通过。1M的1,000,000条/20,000批真实HTTP全部202（687.65秒），worker416.703秒，outbox全done，40站点dirty/uncovered/attempts均0，SQL/queryStats一致PV1M/UV2万/会话2万、coverage1，CLI EXIT0，独立schema已清除。证据full-pipeline-1000000.json/validation-scale.md；启动cb72a7e+当时WIP，非精确最新SHA，PG-only且CH关闭，RSS2,180,997,120byte，不能证明1C2G/持续混合写删/5分钟延迟保证。真实 GSC/GA4/MaxMind/SERP/商业模型/企业微信账号仍未实测。

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

当前新增真实PG统计缺陷：不等样本分位合并（25×100 + 1×10000）p75错误5430，analytics正在修复/复验；不得以此前148通过宣称此专项已通过。

ClickHouse增量进展（当前工作区，非b56b7e9索引）：实际PG/CH/Redis完整脱敏schema可靠镜像与analytics/content/geo选择性读取已有14集成+3单元通过，后续lease/deadline/cache/views合测22项通过；root全应用启动/隐私故障验收另在执行。高水位/epoch/count不符明示PGfallback；多数worker/rollups/governance/identity/realtime及事件属性仍PG。PG仅元数据、增量partition、全面读切换、历史迁移、CH集群备份与大容量仍未验收，详见ACCEPTANCE_CLICKHOUSE.md。


## 第三里程碑：当前源码与新镜像整体验收

精确索引导出快照（独立 fresh PG、真实 Redis/ClickHouse）最终 lint、typecheck、build 全部 EXIT0；45 文件 **180 测试通过，0失败/0跳过**，其中64单元、116集成。实际PG/CH副本切换、启动隐私失败关闭、独立恢复副本隔离、注册→付费身份段、25:1不等样本分位、真实Chromium回放热图均执行。fresh管理员向导→站点→复制代码后 **15 E2E通过**（13浏览器工作流、2时间函数）；其中新两项使用真实SDK收入/身份/实验而非手写演示数据。原始结构化报告和CLI日志见 `test-evidence/third-main-*`。SDK协议及独立删除日志两条CI脚本亦实际EXIT0。

复检曾179通过/1热图失败，失败报告保留。定位为页面后台的真实scroll事件异步尚未送达，测试改为确认前台/真实布局后等待实际POST与PG精确四档；不放宽统计断言、不改产品采集实现，专项连续两次通过后完整180再次通过。

新Docker镜像 `f8dc7f94dcd5fc86dfedfc841f8af64d528f54de798115e59307b311434f8e90` 全安装/备份/新卷恢复/真实worker失败/升级回滚矩阵 **EXIT0**。170条source/image SHA一致，真实应用25条迁移，包含024及本批CH/收入身份/回放热图/多语言。新镜像此前两轮实际EXIT1分别为Node JSON导入属性和非root读取公开配置权限，均已修复并保留日志及镜像SHA；未用旧6c66镜像替代。此Docker矩阵没有额外重复Chromium；浏览器结果来自同源fresh应用快照。

功能清单已纠正WordPress真实验收及F50/P2-10一致状态。F29流失特征新独立模块在制，尚未注册主路由；CH目前可靠镜像与选择性读取，PG仅元数据的全面迁移、增量大规模复制/CH备份仍未完成。不可变提交上的持续后台/集中单站性能测试尚待执行。GSC/GA4/企业微信/付费SERP/真实模型账户未实测；远端GitHub托管CI仍因账号计费阻断未运行，不重跑或修改计费。
