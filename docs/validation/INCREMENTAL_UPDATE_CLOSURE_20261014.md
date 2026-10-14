# 标准版与 Lite 增量更新最终复核（2026-10-14）

功能代码冻结于 `38c9c611cb535816edc8748c6144284434ba3e67`。本报告替代 2026-10-13 最终报告作为当前验收与产物依据；后续提交仅加入文档、截图与小型证据，六包源码身份仍是 38c9c61。接续 d4115f7 的已核验补丁，以本环境的新普通提交记录来源，没有伪造原提交身份。

## 已完成验收

- 2026-10-13 23:28 UTC 完整回归 **1192/1192**，0 失败、0 跳过；真实受控 PostgreSQL、ClickHouse、Redis 环境。命令为 `npm test -- --reporter=json --outputFile=/workspace/baize-transfer/closure2-full-regression.json`，环境和空间门禁见 CLOSURE2_REGRESSION_SPACE.json。前两次空间中止没有计为通过；第三次两挂载最低可用空间分别 5019566080 和 3894775808 字节。
- **32/32** 专项：24 ownership、8 protocol；构建、类型检查、lint 均通过。修复普通 stop/start 对外部同项目主容器的越权风险、Native busy 拒绝时的关闭死锁。初次接管仅允许私有配置中的完整 initialContainerId 与实际镜像/策略完全匹配。
- 真实 Docker 外部容器负例：同项目、服务及镜像但不同 launch 身份的容器，在普通 stop、start 拒绝、close 后仍存活；备份和自有实例恢复通过。
- 最终 NodeReady 两版独立执行器真实增量、数据库备份、版本与数据库健康、显式删除、hash 失败、断网、并发拒绝、回滚保留新写入、下载阶段与健康阶段强杀整个服务组后恢复均通过。健康阶段使用验收专用 spawn 同步点，先确认 journal=health、真实目标 PID/PGID 和数据库 ready，再杀整个组；新执行器恢复旧代码及当前数据。实际执行器 SHA256 为 `7ddd8c69bbd4e4987af387cbd653bea2068d26920161319580cbe431bfd39b55`，证据明确绑定冻结源码，不以旧记录替代。
- 标准 Docker PostgreSQL 与 Lite Docker SQLite 均完成真实镜像层增量、当前数据备份、目标健康、代码回滚以及升级前后写入一致性。标准改变压缩层 218 bytes，Lite 220 bytes；各复用 8 个旧层，另有签名清单及镜像配置流量。这是隔离标记层的真实更新验收，不能作为正式版本的下载体积承诺。Native 的 26 bytes 同样仅是 fixture 文件。
- 四个原生包分别以自身 `release-start.sh` 实际独立启动，PG/SQLite ready；两个最终离线包于 2026-10-14 实际执行 `gzip -dc 包 | docker image load`，所有镜像 ID 与最终清单相同。六包 SHA256 与 gzip 校验通过。

第一次健康尝试 operation `cd294c75-d19d-4bef-b29c-17abd49b707f` 实际在下载阶段因 `UPDATE_SPACE_PROTECTION` 失败，health 尚未开始；外层误报 missed deterministic target health window。诊断与新确定性结果均保留。旧成功记录缺少执行器 hash/源码快照，不能证明最终代码覆盖。本次使用最终包补齐，未将失败或运行中状态当通过。

原始证据目录：[incremental-update-closure-20261014](../test-evidence/incremental-update-closure-20261014/)。完整计数、Docker 两版步骤、数据一致性、下载请求、Native 强杀恢复、容器归属、包启动与离线加载分别在对应 JSON 中，文件校验见 EVIDENCE_SHA256SUMS。外部验收适配脚本以 .ts.txt 保留；它们没有修改产品执行器。Lite 使用最终生产镜像为基线仅增加目标标记层，回滚验证该目标文件消失；标准使用由最终镜像生成的 A/B 隔离标记层。两者数据库与更新器均为实际产品。

## 最终六包

| 版本 | 类型 | 文件 | 字节 |
| --- | --- | --- | ---: |
| standard | node-ready | `baize-standard-node-ready-linux-x64-38c9c61.tar.gz` | 35412021 |
| standard | bundled-node | `baize-standard-bundled-node-linux-x64-38c9c61.tar.gz` | 80098280 |
| standard | docker-offline | `baize-standard-docker-offline-38c9c61.tar.gz` | 292097025 |
| lite | node-ready | `baize-lite-node-ready-linux-x64-38c9c61.tar.gz` | 30514231 |
| lite | bundled-node | `baize-lite-bundled-node-linux-x64-38c9c61.tar.gz` | 75196927 |
| lite | docker-offline | `baize-lite-docker-offline-38c9c61.tar.gz` | 124958546 |

完整 SHA256、源码与镜像 ID：[DELIVERY_INDEX.json](../test-evidence/incremental-update-closure-20261014/DELIVERY_INDEX.json)、[SHA256SUMS](../test-evidence/incremental-update-closure-20261014/SHA256SUMS)。标准 Docker 离线包包含应用/Node、PostgreSQL 17、Redis 7；Lite 只含应用/Node。NodeReady 要求现有兼容 Node24，bundled-node 自带 Node；部署与私有签名源、配置及恢复操作见 [INSTANCE_INCREMENTAL_UPDATES.md](../INSTANCE_INCREMENTAL_UPDATES.md)。标准/Lite 使用各自已有生产依赖裁剪，不改写 lockfile。Docker 接收方仍依赖受信发布方签署的 schema fingerprint，不自行从镜像迁移文件重新推导。

**分发尚未完成。** 当前 Library 支持的整批 prepared upload helper 在 `hosted apps tools/list` 处报 network，尚未进入上传准备，没有生成 Library ID；精确失败见 LIBRARY_FINAL38_PACKAGE_RESULT.json。六包保存在本环境且已核验，不能将本地路径当作用户下载链接。按最新指令没有把归档或二进制分片加入 Git，也没有发布 Release。恢复交付可在 Library 网络恢复后用相同受支持 helper 提交这六包，或由用户指定私有产物存储；代码、文档、清单和截图通过现有私库普通 main 推送交付。暂不称六包已下载可用。

## 最终页面与空间保留

采用用户 design-product-ui 要求，仅增量完善现有紧凑更新页。实际 Docker 应用 [标准桌面](../screenshots/incremental-update-closure-20261014/update-standard-1440.png)、[标准 320px](../screenshots/incremental-update-closure-20261014/update-standard-320.png)、[Lite 桌面](../screenshots/incremental-update-closure-20261014/update-lite-1440.png)、[Lite 320px](../screenshots/incremental-update-closure-20261014/update-lite-320.png) 已逐张检查；无横向溢出或页面错误，checkbox、Tab、reduced-motion 已验证。回滚提示说明当前不下载，下方仅为上次检查计划。截图 Library 上传网络受阻，真实 PNG 随私库证据提交。

保持 2 GiB 底线加 1 GiB 缓冲，串行执行重型操作。未在旧环境重试或删除旧包。仅清理本环境自有已完成/失败的展开副本、停止的验收容器和明确 ID 的旧构建缓存：先归档并核验 gzip、tar 内容或 SHA，保留原包、源码、补丁、数据卷、配置、签名材料与原始证据。每项文件名、字节、保留位置和方法见本目录 *_RETENTION.json；目标 buildx prune 只按已确认自有缓存 ID 选择，无全局 prune 或强制删除。包保留位置变动通过映射记录，未改变六包内容。

自动触发检查：没有 .github/workflows；.cnb.yml 只有手动 web_trigger/web_trigger_validate，无 push、cron、NPC。只执行带 [skip ci] 的普通 main 推送，不使用 force、PR、GitHub Actions、CNB、Release 或权限修改。
