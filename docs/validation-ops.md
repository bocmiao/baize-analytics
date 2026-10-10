# 运维实际验证记录

本记录只描述已执行的检查，不把设计或模拟测试写成生产验收。

| 检查 | 状态 | 证据 |
|---|---|---|
| Docker daemon | 通过 | 本地 unix socket info 返回 28.4.0 |
| Node24 容器镜像 | 通过 | docker pull node:24-bookworm-slim，sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 |
| Compose 配置 | 通过 | POSTGRES_PASSWORD 占位值 docker compose config --quiet |
| Bash 脚本语法 | 通过 | bash -n install.sh upgrade.sh scripts/*.sh |
| SDK 严格类型 | 通过 | tsc --noEmit --strict，miniprogram/ClickHouse/ops-sdk-test |
| SDK 本地执行 | 通过 | consent 不创建标识、失败重试同事件 ID、boolean、参数化查询、关闭 replica 拒绝请求 |
| 完整镜像构建/安装 | 通过 | 真正执行 install.sh、npm ci TLS验证、build、Compose app/PG/Redis 健康；首轮 Buildx只读目录及镜像文件权限问题修复后重跑 |
| 真实 PG 备份、新库恢复、升级失败回滚 | 通过 | scripts/ops-lifecycle-test.sh 退出0：实际管理员/站点/采集fixture→备份→备份后fsync删除→新库恢复0events+1tombstone→同镜像升级→失败回滚DB+卷+旧应用健康；日志 /tmp/baize-ops-lifecycle.log |
| 密钥备份分离 | 通过 | DB备份无 master.key，app-data归档排除keyring/*.key；密钥另存0700恢复包，DB只含指纹 |
| 已提交schema变更后失败健康回滚 | 通过 | 本地衍生镜像迁移新增column，信息模式查询实际观察count1；HTTP503触发回滚后脚本断言count0及原应用health200，生命周期退出0。日志 /tmp/baize-ops-lifecycle-schema.log |
| WordPress PHP语法 | 通过 | PHP8.3-cli 容器 php -l 无语法错误；真实 WordPress runtime 未实测 |
| ClickHouse25.8真实适配器 | 通过 | 本地隔离容器：create/export/重复event去重/类型参数查询/同步删除；首次 ISO 时间写入400已修复 best_effort 并重跑通过。完整可靠双写迁移仍未完成 |
| Windows run.bat | 未运行 | 当前环境为 Linux |
| CI hosted runner | 未运行 | 提供 workflow，不代表远程 CI 已通过 |

禁止使用 mock 宣称真实外部账号已验收。无外部公开部署、无镜像 push、无其他仓库操作。

追加严格恢复验收：`/tmp/baize-ops-fresh-restore.log` 实际缺失日志、空日志重置均拒绝且未创建目标库；备份前生成的真实 JSON 导出、备份后的实际访客删除、全新目标数据/密钥卷恢复，目标库 events=0/tombstones=1，保留普通 geoip 目录文件且 exports 文件数=0，持久清理 pending=0。完整生命周期退出0：同镜像升级、不存在镜像回滚、已提交schema新增字段后HTTP503触发数据库/卷/旧应用回滚均通过。最新镜像 cf9ba00b6794；后续正常启动DB删除标记检查及显式legacy水位迁移工具通过原生typecheck/lint，尚未重新构建镜像。

恢复重算 P1 复检：新增 `runRestoreRebuild` 以数据库持久状态确认每个目标站点 generation=processed_generation、无 lease、attempts=0、无 error/dead-letter 后才允许 `restored/reaggregated` 成功输出；worker 返回 false 不作为完成证据。实际运行 `TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev npm exec vitest -- run tests/integration/restore-rebuild.test.ts`，5/5通过：真实脏数据重算、false但仍dirty拒绝、暂态持久失败可重试、实际SQL42P01失败达到dead-letter拒绝、active lease拒绝假完成。新修正已通过typecheck/lint，最新完整Docker矩阵尚待重跑，不能沿用之前生命周期绿灯证明该版本。

真实恢复脚本 worker 失败验收已加入 `scripts/ops-restore-failure-test.sh` 并接入生命周期：通过本地衍生镜像迁移隐藏 goals 表触发实际 worker SQL42P01，断言目标数据库保留且仍 dirty/dead-letter、没有成功 manifest/成功输出、源应用容器及 DATABASE_URL 保持且 health 正常。失败脚本仅在断言后清理该测试目标。当前仅完成 Bash 语法/diff 检查，此新增 Docker 场景待最终代码稳定后实际运行，尚不能标记通过。

新版首次Docker全矩阵 `/tmp/baize-ops-final-matrix.log` 退出1：前置真实恢复及worker失败验收通过，但其他验收并发拉镜像使vfs磁盘满，最终schema503回滚 `mktemp` ENOSPC，schema未回滚。失败日志和备份保留；隔离测试trap清理了测试数据库，不能声称保留完整诊断现场。修复升级前空间门槛与紧急预留后，实际高门槛拒绝命令通过；顺序清理本任务旧镜像/cache后重跑 `/tmp/baize-ops-final-matrix-retry.log`，当前仍运行中。

最终顺序重跑 `/tmp/baize-ops-final-matrix-retry.log` **退出0**（实际镜像 `6c66d8a80e51`）：严格新库/新卷恢复通过且持久重算 `sites=1,rounds=1,verified=true`；真实 worker SQL42P01 故障导致恢复失败、诊断目标库存在、无成功marker/成功输出、源流量配置与健康不变；同镜像升级、不存在镜像回滚、已提交字段(count=1)+HTTP503失败后数据库/卷/旧应用回滚(count=0,health200)全部通过。22条迁移。新增升级磁盘门槛高阈值实际拒绝通过，128MiB紧急预留随升级/回滚执行。首次ENOSPC失败仍记录而未被覆盖。本次结束仅留下原devPG/Redis，隔离测试栈、目标卷及故障镜像均清理；工作区剩21GiB。没有Git提交或镜像推送。

本批freshrestore CH隔离真实测试：`TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 npm exec vitest -- run tests/integration/restore-replica.test.ts`，2/2通过。独立源/目标PG schema复制snapshot指针后目标失效，源PG元数据完全不变，实际源CH snapshot count=1且可读1；同endpoint/非显式配置拒绝，原库升级配置保持。最终Docker矩阵新增源与镜像SHA manifest逐文件核对（包含024及后续源码），此轮新镜像待稳定artifact通知，不沿用旧6c66验收。

最终第三批稳定artifact `/tmp/baize-third-yjpyeems` 实际新构建矩阵：首轮镜像 `dd0dd61f0515b1894ff371cfeea678fd85775d09398c110d620652acf24e699e` 退出1，compiled Node启动因JSON import缺少attribute失败（`/tmp/baize-ops-third-final-matrix.log`）；修复后第二轮镜像 `12f6064a9be373278cc2eb5706717f8e15b355fcbf1ec10a7bf8cbe0ec69e674` compiled Node已healthy，但exactmanifest读取600权限lockfile失败退出1（`/tmp/baize-ops-third-final-matrix-json-fix.log`）。两轮日志均保留，不用tsx成功覆盖生产Node失败。

只调整Docker中公开源码配置读取权限、保留secret排除后，第三轮镜像 **`f8dc7f94dcd5fc86dfedfc841f8af64d528f54de798115e59307b311434f8e90`** 全生命周期 **EXIT0**（`/tmp/baize-ops-third-final-matrix-permission-fix.log`）。镜像和稳定artifact源码170条SHA完全一致，包含024及本批CH/收入/身份/回放热图/AB/多语言，证据 `docs/validation/docker-third-{source,image}.sha256` 与 image.id。真实PG应用25条迁移。实际compiled Node启动、HTTP管理员/站点/采集/导出、严格新库独立卷恢复、worker SQL失败不输出成功、正常升级、缺失镜像回滚、已提交schema+503失败后的完整数据库/卷/旧应用健康回滚均通过。最终probe实际观察新增字段count1/status503，回滚断言count0/health200。测试栈已自动清理，仅保留原CH/devPG/Redis，未修改其配置/数据；未为Docker栈追加Chromium验收。主应用Chromium结果由root独立记录。

可选CH profile独立验收：`docker-compose.clickhouse.yml` config通过；实际以已有25.8-alpine镜像 `--pull never` 启动 `baize_ops_optional_profile` 的CHonly服务，healthy，认证SQL真实CREATE/INSERT/SELECT count=1/DROP通过，PortBindings={}未发布端口。该测试容器、volume和network已删除，原analyticsCH/devPG/Redis保持。初始非alpine25.8拉取发现新镜像成本后终止EXIT130，不声称该tag验收通过；最终采用与已有真实CH测试一致的25.8-alpine。仅本profile配置/服务已通过，不代表canonical CH备份或集群灾难恢复已实现。后续含026完整应用镜像尚待rootfreeze。

第四批冻结artifact `/tmp/baize-full-ci.WPkl6i` 新镜像 **`bf77b54e1ca7db572cccc4e77ec8e937550157d67b2a5bdb5dd2b4afbad93140`** 实际build **EXIT0**（`/tmp/baize-ops-fourth-build.log`），完整运维矩阵 **EXIT0**（`/tmp/baize-ops-fourth-final-matrix.log`）。source/image189条SHA相同，025/026/027全部包含，证据docs/validation/docker-fourth-*；真实PG28条迁移。compiledNode+HTTP采集导出、严格journal新库独立卷恢复、真实worker故障不输出成功、正常升级、缺镜像与已提交schema+503后的完整DB/卷/旧应用回滚全部通过。故障前实际字段count1/HTTP503，恢复后脚本断言count0/health200。

本轮因共享regular重跑启动独立PG/CH/Redis，ops在freshrestore完成后SIGSTOP暂停自己的bash，待CI栈清理后继续，避免磁盘峰值；不触其他服务/cache。最终own栈/目标卷/故障镜像自动清理，原CH/devPG/Redis保持，剩7.7GiB。CNBemptybootstrap后续script/docs及E2E/014测试夹具修正按父授权未加入该app冻结artifact，不冒称镜像包含这些独立后续变化。共享regular首轮fixture失败、第二轮237应用测试PASS但18E2E17PASS/1断言失败分别由root保存；本ops EXIT0不代表共享regular整体EXIT0。全部旧失败log保留。

第五新镜像 **c61030b4d8c169580ee1d8aab9206e01e33a791dfb63b801a7131003c0f97d01** build与完整运维矩阵实际EXIT0：201条source/image SHA相同，逐项与main8b61fc0对照0差异，真实PG30条迁移包含028/029；HTTP真实采集/导出/删除、严格missing/reset独立日志拒绝、独立新文件/密钥卷恢复、最新删除重放、真实worker SQL死信失败不输出成功marker、正常升级、missing-image真回滚、已提交schema+HTTP503真DB/app回滚全部通过。见docker-fifth-main.json、docker-fifth-main-matrix.txt、docs/validation/docker-fifth-*。

资源期间只精确清获批本任务buildcache与已不被本轮回滚依赖的旧bf77，旧失败日志与sha证据保留；SIGSTOP父bash时前台restore子操作仍完成，记录真实而非称整栈停住；2GiB upgradegate未降低。最终owned32311栈清理，原devPG/Redis/CH保持。此镜像不含后续030/F60/auth/语言WIP和4ed81c4 composehealth配置；可选CH history模式未在Docker矩阵另开启，已有真实PG/CH应用集成闭环，不能称全部CH灾备或PG-only完成。Docker不重复Chromium；fresh编译应用19E2E另有证明。
