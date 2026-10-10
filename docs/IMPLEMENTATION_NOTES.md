# 白泽首轮实现修正

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

## 当前交付状态

更新时间：2026-10-10。本文件最初“仅初始化、尚无应用”的阶段已结束；该陈述作为早期阶段历史，不代表当前交付状态。当前已有TypeScript/Fastify/React/Vite/PG/Redis应用、独立MIT tracker、应用单元/真实PG/CH/Redis集成与Chromium浏览器流程、构建和私有CI配置，以及实际本地Docker安装/备份/独立卷恢复/升级/失败回滚证据。仓库仍私有，未向外网部署。

最近已记录的第五不可变应用阶段为272测试（80单元+192集成）、19检查（17实际浏览器+2日期）；第五Docker c61030b4生命周期EXIT0。第六pre-deletefix为84单元+205集成=289，20检查（18实际浏览器+2日期），不含随后AI删除hooks等改动，不与第五数字相加。详见[主验收](VALIDATION_MAIN.md)和[逐项清单](IMPLEMENTATION_CHECKLIST.md)。

第七第二冻结阶段已实际执行：84单元；234集成中228通过、6失败，原始gzip/MIME失败记录保存在docs/test-evidence/seventh-gzip-mime*。根线程已做nativeHTTP修复及定向检查，新的完整冻结验收仍待执行/汇总；这里不预写最终main/镜像通过数量。新标准MCP已默认注册并有官方SDK真实HTTP/PG4项定向通过；AI trace/chart与派生失效已接当前生产路径；G2治理与规范事实、canonical adapter/回放索引等是定向开发切片，不能替代第七全量结果。

全部F01–F66/P2仍按逐项证据判定：canonical activation仍关闭，混合回放记录物理删除/恢复已有C4三项真实PG/CH定向验证，但原生canonical浏览器、完整迁移集成与规模SLO仍有明确剩余；真实Google/企业微信/付费SERP/MaxMind账号、模型质量、Windows/小程序设备等未实测项单列。README/API/中英运行手册已更新，不能把计划、模拟provider或本地环境smoke标成真实外部验收。

第七后续结果：root冻结源分阶段84unit+234integration=318通过，correctenv freshschema20E2E（18browser+2date）通过50.8s，compiled/build/type/lint通过。原路径缺失及未export测试DB失败记录保留，不能写单次sharedregular EXIT0。该阶段含030/031/032与标准MCP，033/034/035及C4/物理回放保留仍属下一批定向工作树，不提前标作当前main全量验收。
