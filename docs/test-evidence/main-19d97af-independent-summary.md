# 19d97af 独立 strict 负载证据

源19d97afcd6ad4c7adf08437bf82c1124d4057f8d，1040 Git blobs前后校验sourceUnchanged=true。根代理 actual immutable runner 1000 status=passed；没有mock或手工worker。旧0c/33的5000失败、旧ce/b0结果均保留，不覆盖。

20planned/scheduled/sent/202、1000接受，failed/rejected/unsent/queryFailed/probeFailed0，delayed1。六项实际strict断言通过：freshHTTP PV1000 coverage1/sourceCH；canonical含bootstrapPV1001/UV21；九PG正文0；一站authorityCHstrict；outbox1001全部done/queued0；allProcessed/attempt0/watermarklatest。drainReachedtrue/deadlinefalse，assertionsRun/Passedtrue。实际applicationClosed/chNamespaceRemoved/pgSchemaRemoved/temporaryRemoved均true，cleanupFailed/bootstrapFailed/harnessFailedfalse。

intake19.338s/drain24.070s/final6.325s；maxbacklog750。query intake2/drain2，报告drainP95 3.002s，样本极少不能推总体SLO。finalHTTP6057.865ms仍慢；对比旧7.625/7.143s仅共享主机单轮，时段与样本不同，不能因果改善或SLO达标。NodeRSS峰intake638140416/drain672911360/final657842176 bytes；仅app+harness，不含PG/CH/Redis。

| operation | adapter | stage | calls | inclusive ms |
|---|---|---|---:|---:|
| http_request | other | pool_acquire | 31 | 1.02 |
| http_request | other | partition_lock | 32 | 29.40 |
| http_request | other | site_lock | 27 | 3855.58 |
| background_worker | other | partition_lock | 37 | 537.38 |
| background_worker | other | site_lock | 10 | 2876.00 |
| background_worker | other | pool_acquire | 12 | 0.22 |
| http_request | canonical | ch_transport | 118 | 929.93 |
| background_worker | session_headers | ch_transport | 60 | 473.97 |
| background_worker | facts | ch_transport | 1173 | 11240.59 |
| background_worker | remaining | ch_transport | 142 | 1099.10 |
| background_worker | cache | ch_transport | 1 | 3.92 |
| background_worker | facts | manifest_sql | 1291 | 2342.73 |
| background_worker | facts | authentication | 362 | 1276.43 |
| background_worker | facts | temp_fill | 243 | 985.59 |
| background_worker | remaining | authentication | 66 | 137.67 |
| background_worker | remaining | temp_fill | 33 | 57.60 |
| background_worker | canonical | ch_transport | 84 | 479.98 |
| background_worker | session_headers | authentication | 13 | 33.20 |
| http_request | facts | manifest_sql | 636 | 427.04 |
| http_request | facts | ch_transport | 320 | 5286.28 |
| http_request | facts | authentication | 952 | 3426.34 |
| http_request | facts | temp_fill | 636 | 2643.08 |
| http_request | remaining | ch_transport | 63 | 662.04 |
| http_request | remaining | authentication | 126 | 315.75 |
| http_request | remaining | temp_fill | 63 | 163.17 |

manifest_sql为实际参数化metadata lookup/write elapsed，而非纯CPU。HTTP facts manifest636次427ms/CH320次5.286s/auth952次3.426s/TEMP636次2.643s；workerfacts manifest1291次2.343s/CH1173次11.241s。不同stage有嵌套/并行，不能求墙钟占比；计数不能脱离实际作用域、bootstrap和query样本比较为因果。

5000轮正在运行：pending，尚未列为通过，未提前写最终断言。原JSON完整保存。

## 5000 actual EXIT1：admission 未完成，已接收数据严格验收通过

100planned/scheduled，91sent/202、4550accepted、9unsent、46delayed；sent failed/rejected0。总体status failed，不能称完成5000。与旧0c/33排空与final失败不同，本轮drainReached=true/deadline=false/lastbacklog0/gen93=processed93；六strict断言全实际PASS，仅针对已接受4550事件。HTTP PV4550 coverage1/sourceCH；canonical含bootstrapPV4551/UV92；九PG正文0；authorityCHstrict；outbox4551done/queued0；attempt0/watermarklatest。

intake99.172s/drain114.650s/final26.702s；maxbacklog2900。16query（intake10/drain6）、queryFailed0/busy6；报告drainP95 17.440s。fresh finalHTTP25625.740ms仍慢，无SLO或单轮因果改善结论。NodeRSS intake668508160/drain700100608/final652107776 bytes，仅app+harness。

| operation | adapter | stage | calls | inclusive ms | measured rows | measured batches | measured bytes |
|---|---|---|---:|---:|---:|---:|---:|
| http_request | other | pool_acquire | 114 | 2.78 | None | None | None |
| http_request | other | partition_lock | 115 | 56.94 | None | None | None |
| http_request | other | site_lock | 98 | 109819.00 | None | None | None |
| background_worker | other | partition_lock | 57 | 542.97 | None | None | None |
| background_worker | other | site_lock | 20 | 14681.07 | None | None | None |
| background_worker | other | pool_acquire | 12 | 0.24 | None | None | None |
| http_request | canonical | ch_transport | 1272 | 11654.43 | None | 1272 | 66121727 |
| background_worker | session_headers | ch_transport | 233 | 2208.74 | None | 233 | 13233403 |
| background_worker | facts | ch_transport | 5393 | 57065.15 | None | 5393 | 521903735 |
| background_worker | remaining | ch_transport | 526 | 4865.04 | None | 526 | 29071582 |
| background_worker | cache | ch_transport | 3 | 18.12 | None | 3 | 906 |
| background_worker | facts | manifest_sql | 5948 | 13446.54 | None | None | None |
| background_worker | facts | authentication | 1692 | 6462.94 | 112725 | None | None |
| background_worker | facts | temp_fill | 1130 | 6264.56 | None | None | None |
| background_worker | remaining | authentication | 214 | 527.88 | 18754 | None | None |
| background_worker | remaining | temp_fill | 107 | 439.82 | 9377 | None | None |
| background_worker | canonical | ch_transport | 357 | 2927.18 | None | 357 | 19489904 |
| background_worker | session_headers | authentication | 46 | 177.54 | 4007 | None | None |
| http_request | facts | manifest_sql | 6815 | 5404.32 | None | None | None |
| http_request | facts | ch_transport | 3413 | 64722.08 | None | 3413 | 1124333068 |
| http_request | facts | authentication | 10217 | 36055.27 | 681099 | None | None |
| http_request | facts | temp_fill | 6815 | 30133.13 | None | None | None |
| http_request | remaining | ch_transport | 575 | 6218.93 | None | 575 | 55346705 |
| http_request | remaining | authentication | 1150 | 2983.23 | 109862 | None | None |
| http_request | remaining | temp_fill | 575 | 1592.04 | 54931 | None | None |
| http_request | other | aggregate_sql | 355 | 4012.36 | None | None | None |

所有stage均为实际有hook观察的计数/elapsed；None代表未测count，不补0。嵌套和并行累计不可作墙钟比例或纯CPU。下一实际瓶颈是持续到达下入队满/发送延迟与事实读取成本，需核同口径manifest/read/认证/TEMP链与持锁区间，不通过扩大queue、deadline、生产限额掩盖9批未发送。

actualcleanup applicationClosed/chNamespaceRemoved/pgSchemaRemoved/temporaryRemoved全true；cleanupFailed/bootstrapFailed/harnessFailedfalse；1040 Gitblobs/sourceUnchangedtrue。原JSON与旧0c/33失败完整保留。本轮只能证明4550接受后的可靠完整处理，不能证明计划5000已实现。
