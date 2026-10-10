# 第十次不可变本地验收

源码：`7fbb5612cee6121df23425ff14274316e43a4bca`。负责人实际运行全新测试专属 Compose 空卷的 `validate-local-final.sh`，shared EXIT0，cleanup complete；未触发托管或外网部署。

| 检查 | 实际结果 |
|---|---|
| 单元 | 27文件、100 PASS，0失败/0跳过 |
| 集成 | 145文件、394 PASS，0失败/0跳过 |
| 应用合计 | 494 PASS，专项不重复相加 |
| E2E | 22 PASS：20真实Chromium、2日期函数 |
| build/lint/type/SDK | 全部EXIT0 |
| fresh migration/compiled入口/journal检查 | 全部EXIT0 |
| 新应用Docker生命周期镜像 | 尚待 |
| 5000严格CH持续负载 | EXIT1：后台未按原排空判据追平；完整性最终断言未运行 |
| 最新托管 | 未运行；按用户要求不阶段触发 |

原始证据：[总入口](test-evidence/main-7fbb561-local-final.json)、[单元](test-evidence/main-7fbb561-unit.json)、[集成](test-evidence/main-7fbb561-integration.json)、[文本记录](test-evidence/main-7fbb561-local-final.txt)。

收入alias回执、raw-prune真实签名包/最新journal gate、049收入FK及保留期窄修已经纳入本次源与实际验收。core guard已true；逐站来源、epoch、正文hash、水位和删除屏障继续强制。1000旧源严格CH完整性通过，但查询p95 9.41秒、滞后p95 63.71秒，不满足SLO，不代表5000结果或1C2G资源保证。

历史失败不覆盖：701候选实际100单元通过，394集成中392通过/2失败，无浏览器执行；修复后才有本次不可变结果。3e052d8原491+22记录保留原计数。外部账号、Windows/真设备和集群灾备等边界仍按逐项清单记录，不将本地通过称全范围完成。

## 严格 CH 5000：实际失败，保留基准

冻结源仍为 `7fbb5612cee6121df23425ff14274316e43a4bca`，script SHA256 `5ccd23cbd1cd0b56fa883ae20e52069498e8a98fde3ed3949bf1bd4d27263468`，前后源摘要相同。真实单站后台采集并查询，5000 条均被接受；原循环判据未改，实际 EXIT1 为 `Background worker did not drain within 120 seconds`。尾段 await 查询会超过循环的墙钟界限，本次尾段约173秒，仍未追平，不能称硬120秒超时保证。

最后查询 PV4900、coverage0、generation102/processed100、attempts0；清理前独立元数据 outbox done4901（含bootstrap1）/queued100。采集加查询3044.955秒；query p95 64.701秒、batch p95 19.908秒、发布lag p95 380.906秒/max473.096秒。测量期Node峰值623210496B（594.34MiB）；计时器停止后的清理阶段/proc HWM711464KiB（694.79MiB）独立记录，不冒充同一统计窗口。

因排空失败，最终 canonical5001/精确UV、九类PG正文零、coverage1与全outbox完成断言没有执行，不将5000接收说成完整验收。专属PG schema及CH database清理并独立查询均为0。共享主机、每批等待查询，慢查询会节流采集；不是固定吞吐、实时SLO或1C2G承诺。未触发任何托管流水线。

证据：[原JSON](test-evidence/main-7fbb561-strict-5000.json)、[原输出](test-evidence/main-7fbb561-strict-5000.txt)、[退出与独立清理](test-evidence/main-7fbb561-strict-5000-handoff.json)。后续性能修复以新源独立测量，不覆盖该失败。
