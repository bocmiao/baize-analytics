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
| 5000严格CH持续负载 | 正在执行，未预称通过 |
| 最新托管 | 未运行；按用户要求不阶段触发 |

原始证据：[总入口](test-evidence/main-7fbb561-local-final.json)、[单元](test-evidence/main-7fbb561-unit.json)、[集成](test-evidence/main-7fbb561-integration.json)、[文本记录](test-evidence/main-7fbb561-local-final.txt)。

收入alias回执、raw-prune真实签名包/最新journal gate、049收入FK及保留期窄修已经纳入本次源与实际验收。core guard已true；逐站来源、epoch、正文hash、水位和删除屏障继续强制。1000旧源严格CH完整性通过，但查询p95 9.41秒、滞后p95 63.71秒，不满足SLO，不代表5000结果或1C2G资源保证。

历史失败不覆盖：701候选实际100单元通过，394集成中392通过/2失败，无浏览器执行；修复后才有本次不可变结果。3e052d8原491+22记录保留原计数。外部账号、Windows/真设备和集群灾备等边界仍按逐项清单记录，不将本地通过称全范围完成。
