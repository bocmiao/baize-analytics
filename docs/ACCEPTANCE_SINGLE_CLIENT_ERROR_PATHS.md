# 单连接池错误分支复核

2026-10-10 08:12–08:13 UTC 实际执行 `TEST_DATABASE_URL=... npx vitest run tests/integration/single-client-error-path.test.ts`。真实 PostgreSQL 隔离 schema，pool max=1、connectionTimeoutMillis=800，独立唯一 application_name；3秒 watchdog 仅允许终止本测试 application_name，实际未触发。没有模拟 pool/query，也没有触碰其他服务。

修复前实际 2/2 失败、CLI EXIT1：worker.rebuildSite 在真实 afterSnapshot 过期租约导致 publication fence miss 后，ROLLBACK却仍占 client，再 await pool.query；治理导出在真实 dataDir 普通文件导致 mkdir 失败后，ROLLBACK仍占 exportClient，再 await ctx.pool.query。两条真实栈分别指向 worker.ts:15 和 governance-worker.ts:25，均报告 `timeout exceeded when trying to connect`，约823/848ms。此为应用连接池等待超时，不是 PostgreSQL 40P01，也不是只根据锁图推断。

仅这两条更新改用已持有、已ROLLBACK的 client.query/exportClient.query。相同测试修复后实际 2/2 通过、CLI EXIT0，0.994秒；租约被清空、导出failed/export_failed可靠持久化、waitingCount=0、无残留 advisory lock，schema清理完成。相关 ESLint 和全项目 typecheck 通过。当前是未提交工作树证据，尚未纳入下批不可变全量验收。

只读 server 复核覆盖 pool.connect/transaction 回调及调用链：queryStats/readSiteEvents 传入同client；mirror/incremental/cleanup/history 的持连接分支用同client查询；transaction 回调未发现调用 authorize/audit 再借同pool。worker心跳是异步未await池查询，不属于这两条等待第二连接而无法执行finally的结构，但未做所有负载下租约时序证明。

另发现治理邀请 register/accept 路由 COMMIT 后仍持 c/client，await ctx.audit，实际 AppContext.audit 在 app.ts 调用 pool.query。随后新增真实 max1 API 回归：旧 register 实际返回500，三项测试中该项失败；未单独运行旧 accept，不将静态同类结构称作旧 accept 实际故障。两路由随后改为原有 client 在 COMMIT 前插入 audit_logs，审计与账号/成员/accepted_at 同事务。真实 register/accept 成功均审计持久化；真实数据库 trigger 拒绝 invite.accept 审计时 register 返回500，账号未创建、accepted_at仍NULL。完整新增 suite 实际3/3通过、CLI EXIT0、1.45秒，相关 lint/typecheck通过。该原子审计修复仍属于未stage下批工作树，不改变冻结的旧CI快照。

随后root从精确stage导出独立快照，lint/typecheck/build均EXIT0；7文件37项真实PG/CH回归全部通过、0失败/0跳过，包含本新增3项与既有max10池屏障/公平调度/全站导出。原始JSON见test-evidence/pool-error-paths-final-tests.json（numTotalTestSuites含describe，不当作文件数量）。编译入口在新PG schema执行fresh管理员向导后，邀请viewer真实浏览器专项1/1通过（3.8秒），见pool-error-paths-invite-e2e.txt。新池错误路径源码尚不在此前bf77镜像，需要下批新镜像覆盖，不把旧完整矩阵当新修复证明。
