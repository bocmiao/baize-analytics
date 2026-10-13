# 增量更新最终验收与六包交付（2026-10-13）

代码冻结提交 `d8362d0ae6834bd500b119bfd73fbbc60010f421`；接续补丁来自 d4115f7，经独立提交保留来源，没有冒用原提交身份。早先 52c2ddf 的标准/Lite 共享运行时包是中间产物，本报告的六包清单替代它作为最终部署交付；历史文件和原包保留。

## 结果与命令

2026-10-13 21:45 UTC 完整回归：1188/1188 通过，0 失败、0 跳过。执行 `npm test -- --reporter=json --outputFile=/workspace/baize-transfer/final-full-regression.json`，连接本环境受控 PostgreSQL、ClickHouse、Redis，设置 TEST_DATABASE_URL、NATIVE_TEST_DATABASE_URL、CLICKHOUSE_TEST_URL、TEST_POSTGRES_CONTAINER、BAIZE_OPS_POSTGRES_CONTAINER、BAIZE_PG_BIN。原始报告见 [FINAL_REGRESSION.json](../test-evidence/incremental-update-final-20261013/FINAL_REGRESSION.json)。构建、类型检查、lint 成功日志及 28/28 所有权专项见同目录；后续提交只保存交付说明与证据。

21:52–21:54 UTC 最终 Docker 镜像标准版 PostgreSQL、Lite SQLite：真实初始启动、签名源检查、镜像层严格增量、当前数据备份、新进程版本/清单/数据库健康、代码回滚、升级前后写入保留全部通过。两版复用 8 个旧层；标准版变化压缩层 212 字节，配置元数据 9797 字节；Lite 变化压缩层 210 字节，配置元数据 9779 字节。26 字节只是隔离 fixture 的变化文件，不代表正式发行包或真实业务数据库体积。没有从网络下载全量镜像；本地 docker save/组装仅用于复用旧层。

21:55 UTC 最终分版原生运行时通过真实 PostgreSQL/SQLite 升级、备份、身份健康、回滚保留写入、显式删除、hash 失败、断网、并发拒绝、下载阶段强杀整个服务组恢复。执行已打包的独立执行器，不依赖开发会话。健康阶段强杀两版完整成功原始记录保留于 incremental-update-review-20261013/native-real-and-kill-recovery.json；最终原生运行时的首次健康窗口复跑因采样未捕获而失败，没有将该次计为成功；最终运行时复跑明确省略该窗口，未省略下载阶段强杀。对应最终原始报告 NATIVE_FINAL_RUNTIME_E2E.json；外部验收脚本源文作为 .ts.txt 保存在同一目录，省略健康强杀的代码可核对。

外部真实 Docker flock 丢失专项确认：本执行器的主应用及备份 one-off 停止、维护栅栏保留、同项目不同 launch ID 的外部容器继续运行。确定性专项覆盖下载/备份/切换/健康、异步后副作用、新执行器拒绝尚存活旧执行器，以及原生回滚备份中锁丢失/关闭。运行容器与合并 Compose 均检查启动参数、非 root 用户、环境变量、挂载和特权选项。接收端 Docker schema 兼容仍信任受信发布方签署 fingerprint，不独立提取镜像内迁移内容。

## 六种部署产物

| 版本 | 类型 | 字节 |
| --- | --- | ---: |
| standard | node-ready | 35409651 |
| standard | bundled-node | 80099346 |
| standard | docker-offline | 292093725 |
| lite | node-ready | 30516049 |
| lite | bundled-node | 75203067 |
| lite | docker-offline | 124958759 |

全部代码来源为 d8362d0。标准 Docker 离线包含应用/Node、PG17、Redis7；Lite 只含应用/Node。四个原生包均用 release-start.sh 实际独立启动，数据库 ready。六包逐个 SHA256 和 gzip 完整性检查；两包实际 docker load 后，逐镜像 ID 与清单一致。文件名、完整 SHA256、镜像 ID、实际启动及加载记录在 DELIVERY_INDEX.json、SHA256SUMS、PACKAGE_SMOKE.json、ARCHIVE_VALIDATION.json；使用方法见同目录 DELIVERY_README.md。源码与 Node24 外置执行器包仅为额外附件，见 SUPPLEMENT_INDEX.json。

文件位于 `/workspace/baize-transfer/delivery-d8362d0`。本环境新生成原生展开目录及六个归档已通过 SHA256/目录逐文件验证后保留在独立 `/tmp/baize-delivery-retained`，原目录用符号链接指向保留副本；完整映射、字节和方式见 DELIVERY_*_RELOCATION.json。两版 package.json/lockfile 未为了缩小体积改写；Lite 采用自身生产裁剪移除不需要的 tsx/esbuild，标准版仍保留 tsx 并将内容相同的双 esbuild 二进制改为内部符号链接。错误 52c2ddf 两版逐文件相同的证据和纠正后的差异见前一审查目录。旧 8e47a2e 包的实际字节在本环境不可读，因此没有伪造其逐文件对比。

## 页面与空间保护

标准/Lite 1440px 和 320px 实际 Docker 应用截图：[标准桌面](../screenshots/incremental-update-final-20261013/update-standard-1440.png)、[标准手机](../screenshots/incremental-update-final-20261013/update-standard-320.png)、[Lite 桌面](../screenshots/incremental-update-final-20261013/update-lite-1440.png)、[Lite 手机](../screenshots/incremental-update-final-20261013/update-lite-320.png)。保持既有紧凑布局，仅完善更新页。无横向溢出、无页面错误；checkbox、Tab、reduced-motion 已操作。回滚提示明确无下载，下方仅是上次检查计划。

新截图通过受支持 Library upload helper 提交，但 tools/list network 错误导致未保存、没有 Library ID；LIBRARY_UPLOAD_RESULT.json 是失败证据。最终截图已保存在 Git 和本环境，可在服务恢复后再上传。

Docker vfs 在创建完整容器副本时曾低于 3 GiB，更新器拒绝后未降低保护阈值；失败操作未记为通过。完整回归结束后，保留已核验 ClickHouse 镜像归档及全部数据卷，移除自有回归容器/镜像缓存。旧的已停止验收应用容器经 inspect/diff 确认仅包含挂载点目录变动后移除，Compose、镜像、inspect 记录和数据卷均保留。仅清理本环境自有无用副本、失败层缓存和旧代码树，归档先 gzip/tar 完整性及内容对比后保留；逐文件名、原/保留字节、迁移位置和方式见 *_RETENTION.json、*_RELOCATION.json、FINAL_RECOVERABLE_CLEANUP.json。没有在旧环境重试或删除旧包，也未删除生产数据或执行 Docker prune。

自动触发检查：仓库没有 .github/workflows；.cnb.yml 只有 web_trigger 与 web_trigger_validate，明确没有 push/cron/NPC。提交含 [skip ci]；最终仅普通 git push main，不执行 Actions/CNB、PR、Release 发布、权限变更或强推。
