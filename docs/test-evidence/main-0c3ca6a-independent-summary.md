# 0c3ca6a 独立 strict1000 实测

源提交 `0c3ca6ac06c459c824f0a1a5fc1a13497d4328d4`，961 tracked blobs 前后 digest 相同。根代理实际执行不可变 runner；结果 passed，非 mock、未手工 worker。原 ce/b0/4ee 证据不覆盖。

20 批×50：20 scheduled/sent/202，1000 accepted；failed/rejected/delayed/unsent/queryFailed/probeFailed 均0。intake 19.219s、drain 36.111s、final 7.893s；drainReached=true、deadlineReached=false，六项严格断言实际执行并通过。fresh HTTP PV1000/coverage1/sourceCH；权威 canonical 含 bootstrap PV1001/UV21；九张PG正文表0、outbox1001全部done/queued0、gen全processed/attempt0/watermark覆盖latest。

39 个 light probes：maxbacklog750、最大 generation lag15、oldest queued age最大43.303s；最终 backlog0/gen22=processed22。周期查询6次（intake2/drain4），报告 overall/drain P95 4.653s；intake仅2点，不适于可靠分位比较。fresh final HTTP单独7.625s。批次P95 922.848ms。Node app+harness RSS峰值 intake643862528/drain666796032/final678879232 bytes；不包含PG/CH/Redis。

| operation | adapter | CH calls | inclusive ms | measured bytes |
|---|---|---:|---:|---:|
| http_request | canonical | 161 | 1153.0 | 7470649 |
| background_worker | session_headers | 62 | 585.2 | 2961892 |
| background_worker | facts | 1340 | 13391.6 | 110396834 |
| background_worker | remaining | 148 | 1332.9 | 6953304 |
| background_worker | cache | 2 | 10.0 | 563 |
| background_worker | canonical | 87 | 517.5 | 4341003 |
| http_request | facts | 893 | 13801.8 | 123943626 |
| http_request | remaining | 88 | 819.0 | 7529021 |

HTTP facts 893次/13.802s；worker facts1340次/13.392s，显示下一应核实事实来源重复 hydration/验证，而不是宣称优化已完成。计时含嵌套、并行、多个HTTP操作与bootstrap，不能相加为墙钟占比或纯CPU。

cleanup applicationClosed/chNamespaceRemoved/pgSchemaRemoved/temporaryRemoved 已由实际核验；cleanupFailed/bootstrapFailed/harnessFailed均false。原JSON附于同目录。5000尚在运行，未列为通过。命令与环境见 `/tmp/baize-independent-adapters-0c3ca6ac/run-strict-1000-5000.sh`；无本轮生产限制更改。
