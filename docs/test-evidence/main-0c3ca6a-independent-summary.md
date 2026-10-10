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

## 5000 实际 EXIT1：未达标，不能作通过验收

同源 immutable runner 第二轮实际完成，status=failed。100 planned/scheduled，94 sent/202，4700 accepted，6 unsent、32 delayed；sent请求 failed/rejected均0。queue峰8/concurrency2。13次query：intake8/drain5，1次30s失败，busy跳过9；报告drainP95 28.220s（不能把失败样本剔除解释为全部成功）。

intake99.176s、drain129.062s，drainReached=false/deadlineReached=true。最后probe backlog1950、gen96/processed57（lag39），最大lag70/maxbacklog3500；末oldest queued163.663s。130probe/0失败。final断言尝试=true但通过=false，executed列表为空；final30.002s失败，仅 `final_assertion_or_source_failed`，没有成功 finalHTTP PV/UV/coverage/latency字段。不能将本轮九PG正文、最终outbox/attempt/watermark等断言列为已验收；1000证据仍独立保留。

Node RSS app+harness峰intake720453632/drain748294144/final749203456 bytes，排除PG/CH/Redis。批次P95 4.343s。

| operation | adapter | CH calls | inclusive ms | measured bytes |
|---|---|---:|---:|---:|
| http_request | canonical | 1061 | 9643.5 | 54105324 |
| background_worker | session_headers | 261 | 2251.8 | 15076148 |
| background_worker | facts | 6714 | 74216.3 | 561873370 |
| background_worker | remaining | 588 | 5134.3 | 32993235 |
| background_worker | cache | 3 | 14.3 | 905 |
| background_worker | canonical | 395 | 3780.6 | 21653171 |
| http_request | facts | 5014 | 82873.9 | 699085526 |
| http_request | remaining | 429 | 4959.3 | 40811731 |

主要已观测瓶颈仍为 facts：HTTP5014次/82.874s/699.09MB，worker6714次/74.216s/561.87MB；下一项应细查重复事实 hydration/owner验证调用链和每次批次，而不是修改限额掩盖积压。传输累计时间不等于墙钟占比，也不是CPU。失败范围包括计划事件未发送、drain deadline、query timeout和未完成最终严格验收，不应只称查询慢。

bootstrapFailed/harnessFailed/cleanupFailed/bootstrapCleanupFailed均false；actual applicationClosed/chNamespaceRemoved/pgSchemaRemoved/temporaryRemoved全true。961 Git blobs digest前后相同/sourceUnchanged=true。所有samplesTruncated=false。清理/source绑定通过不能抵消负载失败。原JSON完整保存，不覆盖ce/b0/4ee/1000通过结果。
