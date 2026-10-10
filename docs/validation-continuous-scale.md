# 持续后台采集与查询验收（已实际执行，发现冷启动维护死锁）

脚本 `scripts/continuous-pipeline-benchmark.ts` 使用显式 `APP_ROOT` 不可变源码快照和 `SOURCE_SHA`，逐文件校验对应提交的 server/contracts/tracker/migrations git blob，并记录前后源码摘要一致性。从仓库目录执行；其他 cwd 必须设置 `SOURCE_REPOSITORY` 为本仓库，不能把调用者标签当成源码证明。

预定实际命令：`APP_ROOT=<已验收快照> SOURCE_SHA=<对应提交> TEST_DATABASE_URL=... npx tsx scripts/continuous-pipeline-benchmark.ts --sites=1 --events=10000`。集中多站另用 `--sites=4 --events=20000`，独立结果文件。已基于不可变main `9cd7cd0745cc0bf0440fcfbd8af9822f91e2f1f1`、对应170 corefile验证快照 `/tmp/baize-third-yjpyeems` 实际执行。server/contracts/tracker/migrations对应git blob全部校验，server源码不改。

真实独立 HTTP 端口、实际 Redis/PG 隔离 schema；background=true，仅生产定时器执行worker，不导入/手动调用worker。每站每秒最多一个50事件批次，生产分钟/IP和机器人规则保留；每轮采集同时真实授权HTTP查询stats，保存coverage/generation/processedGeneration/watermark lag以及延迟样本。最后等待生产worker最多120秒排空，核对真实SQL PV/UV/sessions、watermark、全部outbox done及最终HTTP stats coverage=1。记录Node进程RSS峰、p95/max lag、query/batch p95、coverage不足及worker失败样本；清理独立schema与临时密钥。

这是单站与集中站点的明确构造负载；实际吞吐受后台聚合和查询反向影响，脚本不追赶突发。没有1C/2GiB资源隔离，不能宣称已满足该配置。百万后台关闭/顺序worker证据见 `validation-scale.md`，不代替本次持续运行，也不证明持续小于5分钟聚合SLO。

首次单站运行实际失败（CLI EXIT1）：第2批 collector HTTP500，PostgreSQL实际日志证明40P01，collector参数化INSERT events与首次maintenance DROP历史events_2026_03互相等待。安全证据见 `docs/test-evidence/continuous-initial-deadlock.json`；没有保存请求/payload/rawIP/连接凭据。随后仅runner增加观察onError hook，不修改生产handler/limits或不可变server。

第二次单站10k完整完成（CLI EXIT0）：采集加live HTTP queries 290.383秒，后台drain5.621秒；watermark lag p95=4.403秒/max7.990秒；batch p95=2471.7ms/query p95=231.2ms；Node RSS峰1035026432bytes，schema44089344bytes。最终SQL=PV10000/UV200/sessions200，全部outbox done，最终每站watermark覆盖最后接受事件、HTTP coverage=1，源码前后摘要一致。204次查询时coverage不足是持续dirty期间实际状态，不隐去。该retry测量通过不能推断首次死锁已修，证据 `continuous-1site-10000.json` 同时链接失败文件。

四站20k实际再次失败（CLI EXIT1）：第2批捕获40P01/deadlock detected，PG日志确认INSERT events与DROP events_2026_02相互等待，两参与事务同时报错。证据 `continuous-4site-20000.json`。未满足集中多站后台验收，不用随机重复运行覆盖失败。需修正维护与采集的依赖锁顺序，在新不可变提交回归单站/多站后再判定。所有失败/通过运行均关闭并删除独立schema。

最初runner SHA256=74f1deb9cb16474d03ac1901c02c3ff3183c427ce2812788d44242745cd1f1b5；观察hook版本（单站retry/四站）SHA256=60105ede90f31f7c7de642d90746ebd2f3be86daef6259571888fecd2ba1be2b。诊断runner后来增加初始化relation OID→表名映射以定位锁依赖，单独保存小规模重现证据，不覆盖已发生失败。
