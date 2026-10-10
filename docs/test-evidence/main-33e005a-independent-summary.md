# 33e005a 独立 strict 测量

源33e005abe4d571f1180d8055d08399bbfcbbbf5a，981 Git blobs sourceunchanged。根代理实际1000轮 passed：20批全部202，1000接受，failed/rejected/delayed/unsent/queryFailed/probeFailed均0。六strict断言实际通过：HTTP PV1000 coverage1/sourceCH、canonical含bootstrapPV1001/UV21、九PG正文0、authoritystrict、outbox1001done/queued0、genprocessed/attempt0/watermarklatest。实际四项清理true，cleanupFailed=false。

intake19.246s/drain47.190s/final7.428s；maxbacklog650/drainReachedtrue/deadlinefalse。周期query intake2/drain4；drain报告P95 6.297s。fresh finalHTTP7.143s，对比旧0c3ca6a7.625s只两次共享主机单轮观测，其他时段/样本不同，不能作因果改进或SLO达标。NodeRSS intake627982336/drain656642048/final616185856 bytes，排除PG/CH/Redis。

HTTP facts CH1103/auth1103/TEMP1103次，证实该读取路径每批一次PG TEMP command，旧实现每批两次；这是命令结构变化证据，不是端到端性能目标已实现。HTTP CH16.619s/auth6.843s/TEMP4.276s；workerfacts CH1721/auth385/TEMP385，CH16.327s。嵌套inclusive计时不能求墙钟占比。

5000轮正在执行，未列为通过；旧ce/b0/0c3ca6a及顺序基线保留，不覆盖JSON。
