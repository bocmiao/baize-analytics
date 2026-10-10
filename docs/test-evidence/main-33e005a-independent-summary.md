# 33e005a 独立 strict 测量

源33e005abe4d571f1180d8055d08399bbfcbbbf5a，981 Git blobs sourceunchanged。根代理实际1000轮 passed：20批全部202，1000接受，failed/rejected/delayed/unsent/queryFailed/probeFailed均0。六strict断言实际通过：HTTP PV1000 coverage1/sourceCH、canonical含bootstrapPV1001/UV21、九PG正文0、authoritystrict、outbox1001done/queued0、genprocessed/attempt0/watermarklatest。实际四项清理true，cleanupFailed=false。

intake19.246s/drain47.190s/final7.428s；maxbacklog650/drainReachedtrue/deadlinefalse。周期query intake2/drain4；drain报告P95 6.297s。fresh finalHTTP7.143s，对比旧0c3ca6a7.625s只两次共享主机单轮观测，其他时段/样本不同，不能作因果改进或SLO达标。NodeRSS intake627982336/drain656642048/final616185856 bytes，排除PG/CH/Redis。

HTTP facts CH1103/auth1103/TEMP1103次，证实该读取路径每批一次PG TEMP command，旧实现每批两次；这是命令结构变化证据，不是端到端性能目标已实现。HTTP CH16.619s/auth6.843s/TEMP4.276s；workerfacts CH1721/auth385/TEMP385，CH16.327s。嵌套inclusive计时不能求墙钟占比。

5000轮正在执行，未列为通过；旧ce/b0/0c3ca6a及顺序基线保留，不覆盖JSON。

## 5000 actual EXIT1（未达性能目标）

100planned/scheduled，97sent/202、4850accepted、3unsent、38delayed；sent failed/rejected0。query14（intake9/drain5），queryFailed2/busy9，drain报告P95 30.002s。intake103.412s/drain126.615s/final30.001s。maxbacklog3550/末1450，末gen99/processed70（lag29）、oldestqueued155.132s；drainReached=false/deadlineReached=true。assertionsRun=true/assertionsPassed=false/assertionsExecuted=[]；finalMetadata只有失败分类，无成功finalHTTP数据，不能列九PG正文/outbox/UV等最终断言已完成。

| operation | adapter | stage | calls | inclusive ms |
|---|---|---|---:|---:|
| http_request | other | pool_acquire | 118 | 2.81 |
| http_request | other | partition_lock | 119 | 59.44 |
| http_request | other | site_lock | 104 | 93491.58 |
| background_worker | other | partition_lock | 64 | 555.94 |
| background_worker | other | site_lock | 24 | 5843.32 |
| background_worker | other | pool_acquire | 12 | 0.26 |
| http_request | canonical | ch_transport | 1163 | 10642.74 |
| background_worker | session_headers | ch_transport | 289 | 2687.32 |
| background_worker | facts | ch_transport | 7481 | 82832.54 |
| background_worker | remaining | ch_transport | 653 | 6401.22 |
| background_worker | cache | ch_transport | 4 | 22.00 |
| background_worker | facts | authentication | 1581 | 9836.55 |
| background_worker | facts | temp_fill | 1581 | 8739.22 |
| background_worker | remaining | authentication | 286 | 732.82 |
| background_worker | remaining | temp_fill | 143 | 792.66 |
| background_worker | canonical | ch_transport | 433 | 4122.26 |
| background_worker | session_headers | authentication | 62 | 282.96 |
| http_request | facts | ch_transport | 5468 | 87933.06 |
| http_request | facts | authentication | 5468 | 34110.94 |
| http_request | facts | temp_fill | 5468 | 28271.59 |
| http_request | remaining | ch_transport | 468 | 5823.69 |
| http_request | remaining | authentication | 936 | 2396.64 |
| http_request | remaining | temp_fill | 468 | 1830.53 |

HTTP facts CH/auth/TEMP各5468；CH87.933s/auth34.111s/TEMP28.272s。worker facts CH7481/auth1581/TEMP1581，CH82.833s/auth9.837s/TEMP8.739s。HTTP site lock93.492s，pool acquire2.81ms；此轮观测显示事实来源次数和持锁等待仍重大，不能把累计inclusive值求墙钟比例或称纯CPU。每批一次TEMP命令结构保留，但端到端SLO未实现。

NodeRSS intake643842048/drain670375936/final660680704 bytes（app+harness，排除PG/CH/Redis）。bootstrapFailed/harnessFailed/cleanupFailed均false；actual cleanup四项全部true。981blobs sourceunchanged=true。原JSON保留；旧0c1000PASS/5000FAIL、33的1000PASS和ce/b0不覆盖，不用不同共享主机单轮数据作因果改善宣称。
