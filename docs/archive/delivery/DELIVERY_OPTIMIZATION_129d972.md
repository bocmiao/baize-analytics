# 优化版交付与边界

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

软件源码固定为 `129d972cde1ba8d3da97a130e3adf70f8673402d`。最终 main 的收尾提交仅加入此索引/说明，不修改软件代码。

全量类型、lint、生产编译通过；311 个文件、1160/1160 回归，0 失败、0 跳过。标准浏览器48/48、Lite5/5，严格 CH 用例实际执行。修复前1159/1160与环境/登录态错误记录保留，不改写原批次。

所有当前文件的逐件 bytes、MiB、SHA256、版本及本地保留位置见 [DELIVERY_INDEX.json](../../validation/performance-20261013/DELIVERY_INDEX.json)。本地路径不是用户下载链接。Library22文件有序批次在准备前网络失败，无新写入或未知写入，未循环重试。私有仓库提供源码、报告与小型证据；没有把大二进制写入源码历史。

| 文件 | bytes | MiB | SHA256 |
| --- | ---: | ---: | --- |
| baize-source-129d972.zip | 30,913,397 | 29.481313 | `8ffea17202f84d80d86ce00839668e2e95a7d6005efd8255c207a0ecb2bf573f` |
| baize-standard-docker-install-129d972.zip | 30,913,778 | 29.481676 | `504f6aa0c8fc494c681fa9b760814b8c786203deb53ed038c6b51f5dc1cfbb37` |
| baize-lite-docker-install-129d972.zip | 30,913,781 | 29.481679 | `c86c713d11a7d8ebaef3546f24c5703d01c673c07449ac996846640bc4e4b342` |
| baize-wordpress-129d972.zip | 14,054 | 0.013403 | `1cd176c56235964e5d069d4513baee140bd4e393933f89e978523b3ce28fc926` |
| baize-tracker-browser-129d972.zip | 81,731 | 0.077945 | `e10950ff979bfa2bef3ad591d1e911054466e5403eb36d7acccf251430020987` |
| baize-tracker-source-129d972.zip | 22,833 | 0.021775 | `c05b4d2bc9f81f719690d7bfa5efcbf48e1010def0eb6556d0776e07168eabf2` |
| baize-validation-129d972.zip | 821,399 | 0.783347 | `5754982960478f7565cc4b13e2c3f27a8d0c956f5d53b6d69d3a39e2f8da7e5b` |
| baize-desktop.png | 192,528 | 0.183609 | `6d2522e2991f2e90923f2c537e669ae061ad146e86618fc0c9513cf3d38446ac` |
| baize-mobile.png | 155,238 | 0.148046 | `b670cfb02c660f2ce496d02e9d07a4c6b98739992cab544b49fa7b177aac66b5` |
| PERFORMANCE_OPTIMIZATION_20261013.md | 9,931 | 0.009471 | `22c0298772a5e821f05bf1693cae80544ce05839afb121cfd4dea29e4290feed` |

这7件归档包括源码、两版 Docker 安装源码、WordPress、tracker browser/source 与证据 ZIP；不含优化版原生运行包或 Docker 镜像。源码/安装包实际核对 README、两张 PNG 与固定 Git blob；源码/安装/证据没有历史归档嵌套。tracker/WordPress 小包使用仓库既定许可文件集，不追加非既定文件。

优化版两份完整 Dockerfile 在空间保护预检即被阻塞，未启动构建；因此四原生包和两份新离线 save 未产出，没有对应 image ID。当前完整镜像/四原生包/离线save仍是旧7509481；12件旧交付物的实际 bytes/SHA全部匹配，见 [历史复核](../../validation/performance-20261013/HISTORICAL_DELIVERY_RECHECK.json)。两版旧 image ID、revision和入口已核对，registry RepoDigests为空；它们不是优化版。

本轮本地编译602文件与保留的应用/维护TS同源；旧598文件身份不用于本轮。24性能对照与容器崩溃恢复发生在最后分区安全修复前，明确保存各源哈希；没有重测最后DDL变体的延迟。标准500ms目标未通过，历史固定变快/峰值变慢的混合结论保留；旧5000测试未重跑，tracker4998B gzip另列。详见 [性能记录](../reviews/PERFORMANCE_OPTIMIZATION_20261013.md)。

数据、密钥、原始日志、旧包和迁移账本保留；只停止本轮使用的3个测试服务，不移除容器/卷。原4个smoke目录已逐文件校验后可恢复搬迁到/tmp，列明大小的 [搬迁摘要](../../validation/performance-20261013/RECOVERABLE_RELOCATION_SUMMARY.json) 与私有详细账本均保留。未触发Actions/CNB、未开PR、未触及生产。

后续仅需解决构建磁盘及Library连接，才能补齐优化版大包与实际可下载归档。生产、真实宝塔、Windows/macOS/ARM/Alpine与物理断电/磁盘故障未验证。
