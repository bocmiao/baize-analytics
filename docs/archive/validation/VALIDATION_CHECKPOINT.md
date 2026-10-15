# 审计修复里程碑验收（2026-10-10）

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

此记录针对 `feat/baize-platform` 的本轮审计修复提交，不代表全部 F01–F66/P2 已完成。逐项状态及剩余工作见 [IMPLEMENTATION_CHECKLIST](../../IMPLEMENTATION_CHECKLIST.md)。测试数据由实际接口或测试事务写入隔离数据库，截图不是生产流量。

| 实际执行 | 结果与覆盖 |
|---|---|
| `npm ci --cache /tmp/baize-npm-cache --no-audit --no-fund` | 通过；首次默认缓存目录 `/home/agent/.npm` 不可写导致 ENOENT，改用已允许的临时目录后重新安装成功，无网络/权限配置变更 |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev REDIS_URL=redis://127.0.0.1:6379 npm test -- --exclude '**/content-analytics.test.ts' --exclude '**/tracker-hooks.test.ts' --reporter=json --outputFile=/tmp/baize-tests-checkpoint.json` | **101 通过，0 失败，0 跳过**；19 文件，42 单元、59 集成测试。逐个测试名称见 [机器记录](../../test-evidence/local-tests.json) |
| `npm run build` | 通过；tracker gzip 3831 B。Vite 图表块超过 500 kB 的警告仍存在 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e` | **12 通过**；其中 10 项实际页面/浏览器链路、2 项日期/时区算法。早期 stale API、headless UA 机器人过滤、限流及 SSE 在线刷新失败已分别定位和修复/隔离后完整复跑 |
| `bash scripts/ops-lifecycle-test.sh` | 本地真实 Docker 完整生命周期退出 0；管理员/采集/导出、独立日志、全新 DB/数据与密钥卷恢复、升级及 schema 提交后 503 回滚。镜像 `cf9ba00b6794`；该镜像之后的身份/GeoIP等变更尚未重建验收，详见 [运维记录](../../validation-ops.md) |

真实 PostgreSQL 覆盖采集/EAV布尔属性、事件幂等/冲突、事件时间会话、持续写入聚合水位、epoch/fencing、乱序/心跳、保留/分区、身份切换精确删除与恢复重放、每日盐存量迁移和导出、订单/币种/归因、权限及审计、定时报告/告警、导出磁盘清理、外部任务重试、SSO/密钥轮换。Redis 专项测试验证实际缓存 TTL、统计缓存和删除失效；Chromium 专项验证 tracker 和回放/热图。外部账号调用用安全连接器的模拟传输，不把它写成真实账号验收。

已覆盖审计问题：原型键毒事件、每日盐身份字段、身份 A→B→删除 A→旧重试、持续采集水位前进、最新日志缺失/重置拒绝恢复、独立新卷文件恢复、导出文件可靠删除、AI base URL 与共享建议状态、SEO 新扫描复检、币种独立与订单幂等及末次点击、实时 SSE/在线数、统一日报隐私/水位口径，以及真实 `/api/collect` 小写 `lcp` → 聚合 → 优化建议回归。

远端 CI **未运行应用步骤**。GitHub Actions run `38027616519` 因账户付款失败/额度限制在任何步骤前被托管平台阻断，不能记为代码失败或通过；未改计费，未反复重跑。现有 PR #1 保持 draft，仅推送既有功能分支，不发布、不部署、不合并。

未实测：真实 Google/MaxMind/SERP/商业 AI/企业 SSO/通知账号、真实 Ollama 推理、真实微信设备/WordPress运行、Windows入口、百万事件 PG/Redis 全链路负载。ClickHouse 适配器的真实容器验证不代表完整应用迁移已实现。未完成功能按逐项清单保留，不以 mock 或环境 smoke 代替应用验收。

本次提交仅包含已验收批次。内容分析与 tracker 交互的新独立文件尚未提交，故从提交验收命令排除；此前工作区含这些新文件的扫描为 104 项、103 通过、1 失败（未完成的 tracker 表单/导航专项），不计作提交的应用测试通过。下一批继续修复并纳入全套。
