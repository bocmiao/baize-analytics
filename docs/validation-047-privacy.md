# 047 衍生会话隐私删除专项

本专项使用隔离 PostgreSQL schema、真实本地 ClickHouse、实际 HTTP collector 和实际 worker。初始权威选择在测试夹具中显式设置；它不证明生产 activation/prune API 或全局 readiness 已经开放。没有 mock collector、ClickHouse 正文或统计结果，没有新增外部凭证。

## 实际路径

- `remaining-fact-full-deletion.test.ts`：发布非空 sessions/numerics/members/carry checkpoint/keys 五类真实 worker 正文；完整访客删除同步物理 ACK 后，用真实 PostgreSQL trigger 拒绝事务提交。断言受删除访客 ClickHouse 正文为零、PostgreSQL 收据仍存在、另一访客正文逐项保持；移除故障后重试和日志重放，真实看板 PV/UV/session 均保留另一访客。
- `remaining-fact-partial-deletion.test.ts`：同 cookie 的 A→B 时间段，分别覆盖匿名首锚、删除 A 首锚后选择真实 B 首事件、旧前缀全部被删除、原始 PostgreSQL/ClickHouse 已真实保留期裁剪、已完成 047 namespace 的五类 PostgreSQL 正文全部移除但 B 唯一归档页仍存在。已裁剪 PostgreSQL 正文的步骤是明确的测试来源依赖证明，不冒充生产自动 cutover/prune。部分删除先从受认证 043 拓扑与权威原始事件重归约，发布独立 immutable checkpoint 与完整 keys，才物理删除旧正文；仅替换 carry head，不冒领旧 contribution head。空幸存前缀不制造 checkpoint。
- 相同测试以 trigger 验证物理 ACK→PostgreSQL rollback→重试。恢复只读取私有 HMAC context 中的新 checkpoint 或空标记，不恢复旧 A 正文。新 checkpoint 恢复必须用幸存拓扑重新生成 keys，并严格匹配签名 checkpoint digest。无普通 orphan 查询回退。
- 归档变体在 rollback 后追加另一个实际 fsync 日志 scope；该新请求因旧缺失正文仍严格失败。恢复验证旧 context 的 exactSegments 确为当前独立可信日志的子集，不把调用者自报 hash 当授权。
- `remaining-fact-unavailable.test.ts`：关闭真实临时 loopback TCP listener 后以原生 fetch 连接实际拒绝；删除返回 503，PostgreSQL epoch、全部 047 收据 hash 和身份删除标记均未被提前修改，真实 fsync 日志可恢复。恢复真实 adapter 后原全部五类正文严格可读，日志重放与 worker 保留 B。
- `deletion-authorization.test.ts`：真实 fsync/watermark 日志、同事务 opaque token、真实日期重试 scope、一字节签名篡改和伪造日志记录拒绝。
- `remaining-fact-deletion.test.ts`：原 043/044 基线仍验证 A 删除、B 保留、rollback/replay 与真实统计。

## 证据与修复

- `/tmp/baize-047-partial-first.json`：首次部分删除出现 `REMAINING_CARRY_OWNER_MISSING`，原因是按原删除区间再次清 keys，误清新重归约的合法跨 gap 键。修复为旧 visitor keys 物理清理时显式保留已完成的新 replacement run，未放宽 owner/source 校验。
- `/tmp/baize-047-partial-empty.json`：2 通过、1 失败；失败是测试误认为空前缀物理 ACK 后必有共享访客衍生正文。补充对独立权威 B 原始事件的真实 read 校验，空前缀仍断言 checkpoint 为零，重算后的 B 真实统计必须保留。
- `/tmp/baize-047-partial-empty-retry.json`：3 通过、0 失败。
- `/tmp/baize-047-partial-archived.json`：4 通过、0 失败，含保留期裁剪后的 B 归档页。
- `/tmp/baize-047-partial-expanded-journal.json`：4 通过、0 失败，增加可信日志子集恢复证明。
- `/tmp/baize-047-partial-pg-body-pruned.json`：4 通过、0 失败，归档变体实际移除已完成 namespace 的全部 PostgreSQL 047 正文。
- `/tmp/baize-047-tcp-real-refusal.json`：首次 TCP 专项在检查全部历史 published run 时触发 `SOURCE_NOT_MIGRATED`；原 pre047 run 确实没有 047 声明。修正检查范围为实际 complete-five-kind namespace，没有放宽原 source guard。
- `/tmp/baize-047-tcp-real-refusal-retry.json`：1 通过、0 失败，使用真实关闭的临时 TCP 端口，而非 fetch 禁止端口。
- `/tmp/baize-047-c-combo-final.json`：4 个文件、7 通过、0 失败、0 跳过；独立 TCP 专项另记 1 通过，未混入父级全仓计数。

上述测试不替代全仓测试、安装升级、最终浏览器或最终 Docker 验收。047 whole signed package 和 daily_salt controlled carry 的导出/恢复专项由 ops 单独记录；标准模式部分身份测试不冒称每日盐支持跨日 identify。047 激活、发布和裁剪仍须父负责人统一验收，未在本专项解除 guard。

本轮实际定向命令：`TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 npx vitest run tests/integration/remaining-fact-partial-deletion.test.ts`；完整定向组合包括 full-deletion、partial-deletion、deletion 基线和 deletion-authorization 四个文件。类型检查使用 `npx tsc --noEmit`，lint 使用 `npx eslint` 指定本轮 owned 文件。全仓最终类型/lint 证据独立记录，尚不等于父级最终完整流水线通过。

The operator restore entry can use `replayVerifiedDeletionRecordsInTransaction(client,pool,dataDir,records)` after importing all sidecars and before committing target metadata. It rereads the independently verified current journal, rejects invented records, and replays the complete current journal through the same physical-ACK pipeline without borrowing another pooled client. Backup-file deletion remains a postcommit prerequisite before traffic exposure. `tests/integration/deletion-same-transaction.test.ts` passed one real PG/CH test with pool maximum one: physical ACK followed by injected PostgreSQL rollback, same-transaction journal recovery, and invented-scope rejection. Evidence: `/tmp/baize-deletion-same-transaction.json`; owned lint and full TypeScript check exited zero.

A new two-stage historical identity fixture is still in progress. Its first source-dependency attempt failed before deletion with `CARRY_CONTRIBUTION_PREFIX_INCOMPLETE`; this is not evidence of a deletion failure. The public-activation revision initially omitted the prerequisite published-body migration and failed the exact old-checkpoint receipt assertion. Both failures are preserved. The fixture now uses native collection, actual published-body migration, and the public shadow/verify/activate API in an isolated readiness-only source variant. No repository publication guard or production authority is manually changed for this revised fixture.

The revised historical identity fixture subsequently passed in `/tmp/baize-strict-late-final-eky_wric`, an isolated SHA-manifested source variant whose sole production change enables the otherwise closed readiness constant. A's two-test run passed 2/2 with zero skipped tests (`/tmp/baize-strict-late-final.json`); one is this C historical fixture. It uses the public activation API after actual body migration, verifies historical B contributions and the original LCP 900 under the selected published owner, ingests later A/B transitions, expires raw data and removes the five complete-namespace PostgreSQL body copies, then deletes A. Historical B remains PV 1/UV 1/coverage 1; total PV changes from 4 to 3 with UV 1, and journal replay preserves the same result. A published-owner rebuild legitimately replaces an old run identifier, so the test checks actual historical contributions rather than treating UUID retention as data preservation. The earlier producer and fixture failures remain recorded; this result does not enable the repository readiness guard or prove every planned feature complete.

`history-strict-fact-backup.test.ts` exercises the real managed outer signed history wrapper. Its native source performs public canonical activation, genuine signed-package strict activation and a later strict worker publication, with persistent PostgreSQL five-kind bodies absent. Native opt-in heatmap collection supplies a nonempty original 048 cache body (x25/y50/viewport1200/count1); 047 includes the real selected carry checkpoint. `writeHistoryBackup` includes these bodies in its signed envelope. A modified envelope HMAC is rejected. With an unchanged journal, `restoreSignedHistory` restores into a distinct history namespace and reuses the exact existing backing, preserving original source rows, run IDs, 047/048 member hashes and PV4/UV1. A later native deletion with real TCP refusal leaves a genuine independently fsynced A identity deletion scope while rolling back metadata; managed restoration then rejects `HISTORY_DELETED_SINCE_CAPTURE` and source bodies remain unchanged.

This managed test does not claim independent target reimport of the selected 047/048 bodies or permission to bypass revocation. Those are separate whole-instance operator namespace/runtime entrypoints. Final targeted result: one pass, zero skipped (`/tmp/baize-history-strict-outer-final.json`), immutable SHA-manifested readiness-only variant `/tmp/baize-outer-strict-final-eodygsnj`; owned lint and whole TypeScript check exited zero. Two earlier attempts correctly failed the nonempty-cache assertion because their source only had verified zero owners. The final fixture generates the cache through actual collection, not fabricated database rows. No repository publication guard was changed.

The subsequent real strict privacy run exposed a missing physical 048 hook: PostgreSQL cache invalidation and current V2 control rows alone do not erase old ClickHouse cache attempts. Deletion and every journal replay now call the 048 adapter's synchronous site-derived-cache erase/count-zero ACK after the established 043/044/047 physical steps and before invalidation/rebase. Missing published-cache/strict registry fails closed. Authoritative B headers/effects/remaining facts are not erased wholesale.

The strengthened outer-wrapper fixture now natively collects both A and B heatmap cache contributions. After successful A deletion it queries the physical ClickHouse cache table and requires zero rows across all owners/attempts, PostgreSQL owners and pointers zero, and the explicit heatmap privacy-negative flag. The real worker retains B PV3/UV1/coverage1. Full export has no A path, authenticates both hourly and daily PV sums as 3 from current facts despite empty PostgreSQL rollup slots, and omits the unrecoverable legacy heatmap table with manifest coverage0/reason (not an invented empty result). A changed=false journal replay again requires physical cache count0 and the next real worker retains B PV3/UV1.

Four actual failures were preserved while closing prerequisites: carry-only replacement lacked strict 044 completion proof (`/tmp/baize-cache-privacy-native-first.json`); all-kind export still required physically removed 048 owners (`/tmp/baize-cache-privacy-complete-first.json`); hourly-specific routing retained that dependency (`/tmp/baize-cache-privacy-scoped-first.json`); export incorrectly projected zero from absent PostgreSQL slots (`/tmp/baize-cache-privacy-final.json`). A added actual source-empty publication after trusted prefix reduction; E bounded rollup keys from the authenticated effects source and kept negative-coverage metadata. No oracle, ordinary missing-body fence, or unknown flag was relaxed.

Final fresh-source result: 1 PASS, 0 FAIL, 0 skipped, `/tmp/baize-cache-privacy-closed.json`; immutable sole-readiness variant `/tmp/baize-cache-privacy-closed-fbo2hqa7` with `source-sha256.json`. Owned lint and whole TypeScript checks exited zero (`/tmp/baize-048-c-final-types.log`). Repository publication guard remains closed; independent whole-instance target restore requires its own subsequent B/F rerun with these hooks.

### 最终删除事务内清除严格 carry 暂存正文（本地专项）

真实 native PG/CH，单 pool client，完整公开 shadow/verify/activate + 签名事实备份严格切换后，删除 A 保留 B。新增断言在删除 API 已返回、下一次 worker 尚未运行时 PG carry checkpoint/keys 均为 0；changed-false journal replay 后同样为 0。既有旧缓存 owner 全部消失、CH 缓存物理正文计数为 0；允许受真实零贡献/零 header/七类 sealed body 验证派生的新 legacy-centroid 零完成元数据。B 的 PV3/UV1、完整导出小时/日 PV3、非零旧热图缺覆盖并省略表的断言保留。

- 第一次新专项真实失败 `FACT_STRICT_PUBLICATION_FENCE`：`/tmp/baize-cache-privacy-pgdrop.json`，未放松 generic worker 发布检查。修复为专用已验证 post-ACK carry-only 暂存清理。
- 最终结果 **1 PASS / 0 FAIL / 0 SKIP**：`/tmp/baize-cache-privacy-pgdrop-final.json`。
- 不可变测试源码：`/tmp/baize-cache-privacy-pgdrop-final-7ab3nwxl`，`source-sha256.json`；仅该隔离副本 readiness 常量改为 true，仓库生产 guard 未改。
- `npx tsc --noEmit` EXIT0：`/tmp/baize-cache-privacy-pgdrop-types.log`；C 两个修改文件 ESLint EXIT0。
- 此项未宣称 B 独立目标恢复的 hourly/day negative baseline 后迁移问题已经解决；该问题由 A/E/B 继续真实验证。
