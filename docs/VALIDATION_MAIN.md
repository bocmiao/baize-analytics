# main 开发里程碑验收（2026-10-09 America/Los_Angeles）

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

新内容/目标/漏斗报表、完整UTM过滤、可配置渠道/AI域名、官方Apache2地图资产、通知驱动AI归因、实验贡献和统一告警口径已加入真实测试。完整F01–F66/P2仍未全部完成，以 IMPLEMENTATION_CHECKLIST.md 逐项边界为准；浏览器UI本批仍在验收，ClickHouse全应用可靠双写/切换及百万日吞吐、真实WordPress运行栈仍未验收。

真实外部GSC/GA/MaxMind/SERP/商业模型/SSO账户未实测；不购买API或创建生产凭据。GitHub托管CI run38027616519因账号付款/额度在步骤执行前阻断，远端CI未运行；不改计费，不重跑。无外网部署、可见性或网络安全配置变更。

## 第二个 main 里程碑（独立索引快照）

- 未提交的CH模块不混入此版本；导出的精确Git索引运行lint/typecheck/build及全量测试，36文件148通过、0失败、0跳过（59单元、89集成），见second-main-tests.json。
- 全新隔离真实PG应用与Redis，真实浏览器globalSetup执行管理员/首站/追踪代码向导；随后13 Playwright用例全部通过（36.4秒），其中11浏览器流程、2日期纯函数检查。准确日志second-main-e2e.txt。初次新库11通过2失败，定位聚合尚未完成与测试准备消耗登录额度；修复聚合水位验收、自动刷新/过期响应保护及可复用真实会话，不改生产限流。
- 新024前向迁移实际PG回归：014执行后写别名并真实聚合，明细过期后升级，历史统计和实际完整JSON/CSV导出不含已知身份别名；合法历史计数保留，standard站点不清洗。020/021未改。
- F17机器人行为过滤、真实Redis故障降级/分钟历史保留、F10 UA/CSS屏幕/DPR及F09仅广告来源标记已验收；tracker core gzip4015byte。
- WordPress6.9.4/PHP8.3.31真实安装/插件上传启停/匿名同意与撤销/真实tracker→PG→worker验收EXIT0，报告wordpress-actual-runtime.json。测试资源已清理。
- Docker故障场景最新实际矩阵EXIT0及先前磁盘满失败记录见docker-lifecycle-main.json/txt；镜像6c66明确早于024及后续UA/bot，不能宣称它验证后续新镜像。
- 100k真实HTTP全链路已通过；1M仍运行中，不计完成。ClickHouse镜像在制另有真实测试，未在此提交中宣称完整P2迁移。全部F/P2仍未完成，剩余状态继续见逐项清单；远端CI仍未运行。
