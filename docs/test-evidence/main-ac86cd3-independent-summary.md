# ac86cd3 独立 strict 负载实测

源ac86cd322ef3d89d791c62f3c50cfc269cf66755，1074 tracked Git blobs/sourceUnchanged=true。根代理实际1000轮 status=passed；20planned/scheduled/sent/202、1000accepted，failed/rejected/delayed/unsent/queryFailed/probeFailed0。无mock或手工worker。

六strict断言实际PASS：freshHTTP PV1000 coverage1/sourceCH；canonical含bootstrapPV1001/UV21；九PG正文0；一站CHstrict；outbox1001done/queued0；gen全部processed/attempt0/watermarklatest。drainReachedtrue/deadlinefalse/assertionsRunPassedtrue。actualcleanup applicationClosed/chNamespaceRemoved/pgSchemaRemoved/temporaryRemoved全true；cleanupFailed/bootstrapFailed/harnessFailedfalse。

intake19.370s/drain38.146s/final5.584s；maxbacklog600。query intake2/drain4，报告drainP95 5.674s。fresh finalHTTP5316.1274ms仍慢；不同共享主机单轮及采样状态不可作因果改善或SLO达标。NodeRSS intake634073088/drain667156480/final641548288 bytes，仅app+harness，不含PG/CH/Redis。

| operation | adapter | stage | calls | inclusive ms | rows | batches | bytes |
|---|---|---|---:|---:|---:|---:|---:|
| http_request | other | pool_acquire | 33 | 1.06 | None | None | None |
| http_request | other | partition_lock | 34 | 14.65 | None | None | None |
| http_request | other | site_lock | 27 | 1356.09 | None | None | None |
| background_worker | other | partition_lock | 47 | 475.77 | None | None | None |
| background_worker | other | site_lock | 15 | 86.76 | None | None | None |
| background_worker | other | pool_acquire | 12 | 0.24 | None | None | None |
| http_request | canonical | ch_transport | 161 | 1259.56 | None | 161 | 7470659 |
| background_worker | session_headers | ch_transport | 86 | 745.28 | None | 86 | 4228663 |
| background_worker | facts | ch_transport | 1636 | 15829.37 | None | 1636 | 168341249 |
| background_worker | remaining | ch_transport | 196 | 1624.04 | None | 196 | 9777353 |
| background_worker | cache | ch_transport | 2 | 10.22 | None | 2 | 563 |
| background_worker | facts | manifest_sql | 1843 | 4657.88 | None | None | None |
| background_worker | facts | authentication | 638 | 2299.78 | 42390 | None | None |
| background_worker | facts | temp_fill | 427 | 1360.59 | None | None | None |
| background_worker | remaining | authentication | 100 | 232.04 | 7512 | None | None |
| background_worker | remaining | temp_fill | 50 | 104.72 | 3756 | None | None |
| background_worker | canonical | ch_transport | 113 | 744.82 | None | 113 | 5710121 |
| background_worker | session_headers | authentication | 21 | 54.96 | 1506 | None | None |
| http_request | facts | manifest_sql | 1018 | 805.59 | None | None | None |
| http_request | facts | ch_transport | 511 | 9171.73 | None | 511 | 167476837 |
| http_request | facts | authentication | 1525 | 5268.84 | 101477 | None | None |
| http_request | facts | temp_fill | 1018 | 4079.67 | None | None | None |
| http_request | remaining | ch_transport | 97 | 977.80 | None | 97 | 8536491 |
| http_request | remaining | authentication | 194 | 476.28 | 16978 | None | None |
| http_request | remaining | temp_fill | 97 | 242.89 | 8489 | None | None |
| http_request | other | aggregate_sql | 145 | 891.53 | None | None | None |

None为未测count而非0；manifest为metadataSQL elapsed，auth/TEMP/transport包含不同层级嵌套及并发，不能求墙钟比例或纯CPU。旧0c/33/19结果及其5000失败完整保留。

5000正在运行，pending，未列最终性能或严格断言通过。

## ac86cd3 5000 actual EXIT1：admission 与排空/最终断言均失败

100planned/scheduled，96sent/202、4800accepted、4unsent、42delayed；sent failed/rejected0。15query（intake9/drain6）、queryFailed0/busy7，drain报告P95 26.320s。intake99.334s/drain137.019s/final29.321s。maxbacklog3050/末850；末gen98/processed81（lag17）、oldestqueued139.882s。drainReached=false/deadlineReached=true。

assertionsRun=true/assertionsPassed=false/assertionsExecuted=[]；finalMetadata仅failure=final_assertion_or_source_failed。没有成功finalHTTP时间/PV/coverage或canonical完整性结果，不能填入19轮25.625s或声称4800严格完整性PASS。最终九PG正文/outbox/UV等本轮未完成验收。

NodeRSS intake641560576/drain689397760/final687771648 bytes（仅Nodeapp+harness）。

| operation | adapter | stage | calls | inclusive ms | rows | batches | bytes |
|---|---|---|---:|---:|---:|---:|---:|
| http_request | other | pool_acquire | 118 | 2.65 | None | None | None |
| http_request | other | partition_lock | 119 | 58.41 | None | None | None |
| http_request | other | site_lock | 103 | 96054.84 | None | None | None |
| background_worker | other | partition_lock | 70 | 432.02 | None | None | None |
| background_worker | other | site_lock | 26 | 10160.21 | None | None | None |
| background_worker | other | pool_acquire | 12 | 0.17 | None | None | None |
| http_request | canonical | ch_transport | 1248 | 12043.41 | None | 1248 | 64526298 |
| background_worker | session_headers | ch_transport | 343 | 3255.38 | None | 343 | 20346878 |
| background_worker | facts | ch_transport | 7831 | 81111.20 | None | 7831 | 810419044 |
| background_worker | remaining | ch_transport | 777 | 7360.66 | None | 777 | 44470967 |
| background_worker | cache | ch_transport | 4 | 18.48 | None | 4 | 1248 |
| background_worker | facts | manifest_sql | 8841 | 18911.42 | None | None | None |
| background_worker | facts | authentication | 3067 | 10771.15 | 204185 | None | None |
| background_worker | facts | temp_fill | 2047 | 8893.37 | None | None | None |
| background_worker | remaining | authentication | 370 | 1021.81 | 33468 | None | None |
| background_worker | remaining | temp_fill | 185 | 826.02 | 16734 | None | None |
| background_worker | canonical | ch_transport | 501 | 4671.35 | None | 501 | 27465643 |
| background_worker | session_headers | authentication | 80 | 326.23 | 7259 | None | None |
| http_request | facts | manifest_sql | 6989 | 6061.32 | None | None | None |
| http_request | facts | ch_transport | 3499 | 67990.05 | None | 3499 | 1152183053 |
| http_request | facts | authentication | 10479 | 36566.02 | 697936 | None | None |
| http_request | facts | temp_fill | 6989 | 31282.99 | None | None | None |
| http_request | remaining | ch_transport | 588 | 6605.11 | None | 588 | 56623330 |
| http_request | remaining | authentication | 1176 | 3131.00 | 112384 | None | None |
| http_request | remaining | temp_fill | 588 | 1713.39 | 56192 | None | None |
| http_request | other | aggregate_sql | 334 | 4174.29 | None | None | None |

source1074blobs/sourceUnchangedtrue；实际cleanup四项true、cleanupFailed/bootstrapFailed/harnessFailedfalse。cleanup与源码绑定通过不抵消负载失败。阶段累计含嵌套/并发，不作墙钟比例；None非0。

单轮并列：33轮4850接受/3unsent、末backlog1450/final失败；19轮4550接受/9unsent但排空与六断言通过（总体仍fail）；ac轮4800接受/4unsent但末850/final失败。共享主机、不同时段/样本的三单轮不可归因为代码性能改善，任何5000总体均未达目标；原0c/33/19结果保留。
