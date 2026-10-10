# 严格存储身份视图专项

2026-10-10 本地实际 PostgreSQL、ClickHouse、原生 HTTP 验收；不是主分支启用声明。源码快照 `/tmp/baize-strict-identity-qzg97wha` 唯一生产源码差异为 `CANONICAL_ACTIVATION_READY=false` → `true`，SHA 保存在该目录 `variant-manifest.json`。仓库开关保持 false。

`tests/integration/strict-identity-api.test.ts` 使用独立迁移 schema、max=1 连接池、真实 setup cookie、实际 collector 请求、PG worker、真实 shadow/verify、原生 canonical activation 路由及其 046 凭据、真实 CH 正文、完整加密备份验证后激活 strict。站点与成员关系属于隔离测试配置；不伪造事件正文、authority、proof 或 strict 状态。

激活后继续真实采集和两轮 worker。断言 PG events/event_data/sessions/analytics_definitions 与各事实正文为 0；原生 identities API 仍返回 clickhouse、coverage=1、一个身份、三个页面和一个会话；activity API 返回一个会话及三个 pageviews。pool.waitingCount=0。身份 API 现有实现已经从权威事件读路径计算会话，此专项无需更改业务计算。

实际命令（上述快照目录）：

```
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 npx vitest run tests/integration/strict-identity-api.test.ts
```

15:09:42 最终 1 文件 / 1 测试 PASS，0 skip，5.34 秒；日志 `/tmp/baize-strict-identity-third.log`。首次 15:08:57 失败为 fixture 未创建 packages 父目录，已修正；第二次 15:09:15 在身份断言前调用无关 queryStats 触发实际 `CACHE_SOURCE_NOT_MIGRATED`，保留日志 `/tmp/baize-strict-identity-second.log` 并交给统计/缓存负责人。最终专项移除该无关统计断言，未宣称统计缓存问题已修复。此专项不替代整站导出、跨设备/删除/恢复、生产开关和完整 CI 验收。

所属文件 ESLint 已执行。全仓 TypeScript 此次受其他在制 `remaining-body-backup.test.ts` 联合类型 `.data` 访问阻断，不能标全仓通过。此前 canonical daily/replay 四文件八项通过证据独立保留，不重复累计。

恢复复用接口已准备：`tests/support/strict-identity-api.ts` 的 `assertStrictRestoredIdentityApi` 接收独立恢复 app 的真实 cookie/baseURL、pool、保留 B 的源身份 key 及精确路径/会话期望；只进行原生 GET 和来源/PG 空正文断言，不创建身份绑定或恢复元数据。15:25:00 将该 helper 接入现有严格源站点专项，1/1 PASS、5.63 秒（与此前同一测试，不新增累计），日志 `/tmp/baize-strict-identity-helper.log`。独立恢复 fixture 仍由恢复负责人修复认证与 rebase 顺序；当前尚未执行“strict 独立恢复后 B 身份 API”验收，不以源站点通过代替恢复通过。

15:26:26 同一原生严格 fixture 追加 AI 结构化图证据，实际1/1 PASS、6.06秒（不新增累计）。PG 各正文为0时 query_analytics 实际读取 CH `/entry=1,/later=1,/tail=1`，来源 clickhouse-preaggregate、coverage1；模拟提供者第二轮收到的真实工具 series 与持久图结构相等。只有提供者响应模拟，数据没有模拟；不是真实模型质量测试。日志 `/tmp/baize-strict-identity-ai.log`，所属文件 SHA/运行边界见 `docs/test-evidence/strict-identity-ai-source.json`。

冻结复现：在无 `.git/.env/data/keys` 的独立源码快照中仅将 canonical-migration 的 readiness 常量设 true，并保存原/变体 SHA；测试自行建立并移除独立 PG schema，沿真实管理员激活路径取得凭据。运行上述单文件命令。主仓库 false 常量不修改。该文件里的身份与 AI 断言共享同一已验证 sealed-backup strict 实例，不能把运行次数相加为多个验收案例。

恢复源身份接线亦已实际验证：`publishNativeIdentityHistory` 仅通过真实 collector 请求产生同访客 A identify→A 页面→B identify→B 页面，随后原生身份/activity API 取得两个不同 userKey、各一页一会话，用路径定位 B，而非插入虚构 identity_bindings。该 hook 可由既有恢复 fixture 在正常备份前调用，再按现有删除流程删除 A；恢复断言使用源端 B key。15:28:12 原生 strict 专项包含上述独立源站点 hook，仍为同一1项测试 PASS、5.38秒；日志 `/tmp/baize-strict-identity-seed.log`。独立恢复调用继续未运行。

最新全仓 type 检查阻断为其他所属 `history-remaining-store-backup.ts` 导入不存在的 `RemainingStoreKind`，日志 `/tmp/baize-strict-ai-owned-types.log`；所属 lint 通过，未将全仓类型标为通过。

恢复 helper 改用 `node:assert/strict`，避免恢复 CLI 在 Vitest 外导入测试断言库失败；独立 `node --import tsx` 导入实际成功。最终 15:32:41 同一严格源专项 1/1 PASS、5.74秒（日志 `/tmp/baize-strict-identity-node-final.log`），所有预期保持不变。冻结证据 SHA 已更新，独立恢复目标调用仍等待已有恢复接口修复。

独立恢复首次实际执行（新增 `strict-identity-restore.test.ts`）：15:38:31 1 FAIL、0 skip，12.78秒。恢复负责人批准小型串行 pg_dump 窗口，使用既有 baize-dev-postgres 容器内客户端，不新建容器或镜像。真实 A/B 源 identify、实际管理员 canonical 激活、sealed-proof strict 源后，通过既有 canonical-ops-runtime 子进程签名备份，pg_export_snapshot+pg_dump，真实 A identity 永久删除的 fsync journal，独立 PG 数据库 pg_restore 和独立 CH database restore，restore-runtime 重算均走实际入口。最后目标 migrate-facts CLI 触发 `CACHE_MIGRATION_EXISTING_BODY_MISMATCH`，尚未到目标 strict proof/B API 断言；失败交给缓存及恢复负责人。未手写 body_mode、authority 或 identity_bindings。日志 `/tmp/baize-strict-identity-restore-first.log`；唯一 true guard 源码变体 `/tmp/baize-strict-identity-restore-variant-j8dfsepo`。测试清理自身独立数据库和 CH rows，无其他资源删除。

该新增恢复文件所属 ESLint 通过，15:38 后全仓 TypeScript 执行退出0（`/tmp/baize-strict-identity-restore-types.log`）；这不改变恢复失败结论。

独立恢复最终 **1/1 PASS、0 skip**：2026-10-10 15:47:12，13.26秒；日志 `/tmp/baize-strict-identity-restore-fourth.log`。第二次15:43:53、第三次15:45:22同样实际失败，均保留。安全诊断显示恢复重算后 PG 完整V2正文 PV1/gen6，而恢复的已认证 CH 小时/日缓存仍为删除前 PV2/gen2；不是纯控制 JSON 的比较误差。统计负责人修正迁移：继续验证旧 CH 正文/HMAC/数量与 row key，仅当前 processed generation、同权威 epoch 的实际已发布 V2 新正文才能按单桶重新 stage→持久 ACK→publish pointer。同代差异仍拒绝。

第四次实际恢复先处于 transition，未沿用源端 strict 标志；重新 migrate-facts，目标真实 child backup 的 PG 快照/签名包，再由 strict CLI 核验完整证明后启用目标 strict。随后真实目标登录 cookie 调用身份及活动 API，只得到源 B 的真实 userKey、一页、一会话和 `/identity-B`；源 A key 与 `/identity-A` 不存在。PG events/event_data/sessions/analytics_definitions 均0，实际来源 clickhouse、coverage1。源端最新 replay retention proof 仍核验成功。源码快照 `/tmp/baize-strict-identity-restore-fourth-z2wj6wbf`，唯一生产差异仍 readiness 常量 true；仓库 false 未改。全部文件 SHA、前三失败及安全来源向量见 `docs/test-evidence/strict-identity-independent-restore.json`。

复现额外参数：`BAIZE_OPS_POSTGRES_CONTAINER=baize-dev-postgres`，其余本地PG/CH参数同上，运行 `npx vitest run tests/integration/strict-identity-restore.test.ts`。测试使用小型独立数据库与现有容器客户端，不创建镜像/容器；完成后删除自身 PG 数据库、CH 数据库、源站点 CH 行和临时包。该新增恢复1项与此前严格源1项不同；没有将重复运行叠加为更多测试。

**新物理缓存删除/导出投影源码复验尚未通过**：16:06:02 同一独立恢复专项1FAIL、0skip、14.67秒，错误 `CACHE_BASELINE_UNAVAILABLE`；旧15:47:12 PASS不能覆盖这批新代码。16:07:52仅追加安全失效元数据诊断的复现同样失败。真实标记仅小时/日 rollup 的 privacy_invalidated；不是 heatmap/page/legacy 标记。源站点默认 AsiaShanghai，小时16Z–17Z、日16Z–次日16Z范围符合时区。target transition、generation=processed=6、deletion_epoch3，owners为空。源 A 删除后真实 B strict API/PG正文0、独立恢复及 restore-runtime 均通过；新目标 migrate-facts/strict proof/B API 阶段未通过。A/E负责人正在修已发布V2桶的实际可用性恢复，不允许清未知基线或伪零。失败记录独立保存 `docs/test-evidence/strict-identity-restore-physical-regression.json`，没有覆盖此前成功证据。

2026-10-10 16:17:59 新源码三文件实际2PASS/1FAIL，目标 migrate-facts CLI 固定隐藏错误为 CANONICAL_OPERATION_FAILED。16:20:20 仅测试诊断调用同 client 的原生产 header/fact/cache closure，真实定位 caches 阶段 PG42601、位置49、保留字 day SQL别名错误；未更改生产错误隐藏。缓存负责人修正为 AS "day" 后，16:21:20 新三文件2PASS/1FAIL、0skip：目标 migrate-facts与重新签名子进程备份/PG快照通过，目标 strict CLI 下一阶段报 CACHE_BACKUP_READINESS_PG_BODY_MISMATCH，备份验证需区分真实已认证 CH桶与纯PG路由控制元数据。恢复尚未通过新源码，旧15:47通过不覆盖新修复。

三文件中严格源身份/AI及回放 native 两项已通过。全量候选16UTC后揭示源AI夹具隐含默认AsiaShanghai，现两严格夹具明确设UTC；产品时区行为未改变。回放 full-export 前先对实际 dirty generation 执行真实 worker，使 publishedhead匹配当前 prune/retention/delete fence，避免把旧事实快照当当前数据；保留原始回放两记录及物理保留后一记录的强断言。恢复操作专项使用从 TEST_DATABASE_URL 解析的 PG username 作为客户端 argv，未输出URL密码；普通无DockerCLI/socket的CI此操作1项明确skip，由根负责人在同冻结源码的本地Docker环境独立实际执行，不为CI暴露Dockerhost。

**最新源码最终验收通过**：2026-10-10 16:26:59，3文件3PASS、0FAIL、0SKIP，24.01秒，日志 `/tmp/baize-b-final-readiness.log`。此轮包括 C 物理缓存删除/严格carry正文裁剪、E 已认证V2失效范围重建、完整导出投影及 F 严格备份证明窄控制元数据支持。readiness 只对严格白名单的纯路由控制JSON、无失效标记、当前clean权威发布头、每个非data字段/桶/代与已经签名并实际HMAC验证的当前pointer CH行精确一致时替换比较投影；完整PG正文仍精确比较，未知旧缓存不假装重建。

同一冻结源下：严格身份与真实CH AI图表、native可靠回放/保留/完整导出、独立子进程签名备份/PG快照/最新A永久删除/独立PG-CH恢复/目标新proof strict/B身份 API 均通过。目标只保留B一页一会话、CHcoverage1，源/目标四类PG正文均0；源 B API 与epoch/delete/generation在目标操作后保持一致。3项包含此前重复执行的同3案例，不叠加运行次数。此前全部失败继续保留。

最终唯一true变体 `/tmp/baize-b-final-readiness-pwvapksn`，仓库guard false未改变；完整源码 SHA/命令/边界见 `docs/test-evidence/strict-identity-final-three.json`。cache-body-backup SHA `98c283b9f529bb8743f0a838ae7fc086c1ec1f34d0a1da5f58b95d8d832bf255` 与负责人稳定回交一致。最新全仓TypeScript EXIT0（`/tmp/baize-b-final-readiness-types.log`），所属ESLint通过。代码冻结，没有 Git/CNB/全量CI/新镜像或容器操作；普通CI缺Docker设施明确跳过该独立恢复操作1项，根负责人在同冻结源本地另验，不向CI暴露Dockerhost。

时间边界补记：以上16:26:59实际验收执行时，工作区生产 readiness 仍为false，隔离快照的唯一true差异及原SHA完整保存。根负责人随后在这组critical专项通过后启用工作区 readiness=true；逐站验证/权限/删除与备份证明未取消。这一后续集成决定不改变历史测试快照，也不意味着全部项目或后续联合CI已通过。

新增不可逆 raw prune 门槛复验：实际 canonical 签名正文包、同连接 opaque proof 和四种派生签名包；HTTP 无证明裁剪返回 409，运维入口验证后才能裁剪。两个原有真实身份/AI及独立恢复测试于 16:51:35 全部通过（2/2、0 skip、20.98s），类型与 owned lint 通过。初次 EEXIST fixture 失败、新 049 备份 schema 拒绝失败均保留；详见 `test-evidence/strict-identity-raw-backup-proof.json`。仅本地真实 PG/CH/既有容器 dump/restore，AI 提供者仍为模拟。

同一恢复 fixture 追加真实 B 收入 CNY 19.95 的 049 凭据闭环：生产 collector、真实 worker、签名备份与独立恢复后 order_hash/event_id/currency/amount 一致；同订单新 UUID 重试返回 duplicate 202 且无新 CH 正文，CH 不可达时同订单别名返回 503。原 B 页面/会话贡献不变。16:53:20 专项 1/1 通过（0 skip、16.93s），未新增测试数量。
