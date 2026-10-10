# 第九批严格权威本地联合验收

不可变源码：`3e052d816c48a701fb82ce137436c30a770cf080`。本轮真实执行 `bash scripts/validate-local-final.sh`，使用全新专属 PostgreSQL 17、ClickHouse 25.8、Redis 7 Compose 空卷，入口 EXIT0，最终清理完成。

- 单元：27 文件，100 PASS。
- 集成：142 文件，391 PASS；包含真实 PG/CH/Redis、原生独立签名恢复和最新删除日志路径。
- 应用测试合计 491，0 FAIL、0 SKIP。
- E2E 目录 22 PASS：20 Chromium 实际浏览器，2 日期函数；0 FAIL、0 SKIP。
- lint、type、隔离 SDK 包、许可分发、日志拒绝场景、构建、全新迁移、编译应用 healthz 均 EXIT0。
- 复用锁文件匹配的已安装依赖和现有 Chromium，本轮没有重新 `npm ci` 或下载浏览器。

证据：[联合摘要](test-evidence/main-3e052d8-local-final.json)、[实际输出](test-evidence/main-3e052d8-local-final.txt)、[单元逐项](test-evidence/main-3e052d8-unit.json)、[集成逐项](test-evidence/main-3e052d8-integration.json)。不将前期失败预检查或其他专项相加为这轮结果。

同源码严格 CH 1000 事件持续采集/查询：真实操作迁移、签名备份、私有证明、strict、最终水位与 outbox 完整性 EXIT0，PG 九类正文为零。查询 P95 9.41 秒，水位滞后 P95 63.71 秒，峰值 Node RSS 542.77 MiB；25 个中途查询覆盖不足，真实记录而不假零。只证明完整性与最终追平，不证明实时 SLO、1C2G 或集群故障转移。见 [1000 事件证据](test-evidence/main-3e052d8-strict-1000.json)。

此后新收入别名回执、raw prune 签名门槛、049 收入元数据生命周期是后续修改，不冒称已在上述源码中测试。新冻结源的空卷联合验证、5000 严格负载和新生产镜像运维仍待。

没有触发 CNB、同步、GitHub Actions。托管按用户规则由父在线下开发和本地验收全部收工后统一手动验证。真实外部账号、Windows 执行器等边界保持主清单未实测状态。
