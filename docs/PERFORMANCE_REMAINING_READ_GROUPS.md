# 047真实看板读取：有界receipt合批候选

状态：2026-10-11，候选已基于小样本净收益改默认三receipt，新完整验收待执行；不声称净收益、5000通过或新全轮通过。最近完整功能入口为2d2dda2（359单元/490集成/31浏览器，全0skip）；d90e09a相同应用树的新镜像安装与独立签名恢复已有分开的真实证据。详见 [producer与恢复记录](PERFORMANCE_PRODUCER_CANONICAL.md)。

## 依据与明确边界

固定239原负载HTTP047累计864请求、约67.1MB、传输9838.127ms；这些是累计inclusive stage，不是墙钟占比。8195be3真实100采集后strict迁移，三次HTTP200返回相同统计摘要、PV/UV100、coverage1，五类PG正文为0；各71请求/约6.71MB，transport612.468/605.651/731.107ms，wall1752.845/1736.8/1989.8ms。整个入口source_check FAIL保留：root误以仓库cwd启动不可变脚本，同时helper阶段日志在该cwd变化。下一版sourceDigest根据import.meta.url定位自身快照，Git archive单独逐blob绑定，不能删除最终检查或把此FAIL改PASS。原始证据 [JSON](performance/producer-canonical/http-8195be3-100-failure/result.json)。

候选只合并最多三个同kind receipt的CH读取。每receipt仍最多100行；每个PG成员count/checksum、完整正文SHA/canonical/HMAC/key、归属/来源及carry anchor/orphan均认证。整组三个receipt全部认证后才yield原每批≤100行给TEMP。不并发、不unlock共享站点门、不缓存正文/认证证明、不用epoch复查替代门。044既有读取组不变；canonical ACK后PGrollback可不改变epoch，仍必须保留原门和可见性协议。

三receipt query仅限列举已提交attempt，使用每attempt101行sentinel，未知/重复/超限/缺正文全拒绝。group body以base64避免JSON斜线膨胀，UTF8 fatal解析、规范base64及总16MiB EOF预算保留。单receipt100正文及normalized32KiB约束仍原样。三receipt在候选源码成为默认；显式构造参数1保留同算法单批oracle。已过专项和实际A/B，不默认为当前新源码全轮已验。

## 比较方法

`scripts/benchmark/remaining-http-read.ts` 是本地可复制入口，不依赖Codex会话；显式使用已授权PG/CH fixture及串行资源闸，创建并清理自身schema/namespace。strict准备复用真实测试fixture与签名backup/proof，不是产品CLI或生产站点；零carry行如实记录。冻结源码后先100事件，在**同站点、同已认证正文/receipts**上交替宽度1/3，各三次真实登录HTTPstats。统计摘要、PV/UV/coverage与receipt前后摘要均一致才可比较。阶段ms有嵌套，分别报告wall、actual requests/response bytes/authentication/TEMP，不相加为总wall或CPU。

调用时须先逐blob验证Git archive，切换到该archive：

```sh
BAIZE_SERIAL_RESOURCE_GATE=1 FROZEN_SOURCE_SHA="$frozen_sha" \
  BENCHMARK_OUTPUT="$new_result_path" REMAINING_HTTP_EVENTS=100 \
  node --import tsx scripts/benchmark/remaining-http-read.ts
```

TEST_DATABASE_URL、CLICKHOUSE_TEST_URL及本地fixture账号从既有环境传入，不打印secret。100/1000都是小样本方向/对照，不代替原50events/s、100次50事件、query10s、queue8、并发2、drain120s的5000验收。只有候选具有净收益才追加一次受控原参数负载；全部旧FAIL与未发送批次保留，不补发、不延drain。候选100事件实际A/B成功见下；不等于5000或完整应用通过。

## 不可变2660cff：真实HTTP同源A/B EXIT0

源码逐blob绑定1968文件；100条真实collect，strict真实CH正文/签名proof及五类PG正文裁剪完成。同站点交替1/3共六HTTP读，完整统计摘要相同、PV/UV100、coverage1；7100正向成员、71receipts摘要前后未变，cleanup全部true/sourceUnchanged=true。三个wall配对：1779.37→1431.97、1657.57→1340.36、1735.49→1372.50ms，约19.5%/19.1%/20.9%下降。047请求每读71→25，transport636.13→321.88、589.03→311.71、617.99→303.30ms。response约6.71→8.13MB，增加约21%，是base64合批的明确成本；HMAC/正文/成员未减少，inclusive认证有store/bridge嵌套，不能相加作wall或把14200计数当14200不同HMAC。TEMP仍100行batch，未同时做另项SQL优化。

10新增unit通过；不可变2660真实PG/CH三文件8通过0skip（含五kind/非空carry/大Unicode/混合tail/第三attempt实际正文删除第一next即拒/receipts不变）。将默认改3后四相关unit43/43、类型/scoped lint通过，但完整空库/浏览器/新镜像及原参数5000仍待新不可变源码验证。

旧2d镜像归档I/O在strict准备阶段完成（文件mtime14:39:47.573UTC，14:39:48观察仍strict_backup_activation，HTTP测量随后发生），查询期没有再启动bulk；这些观察不证明硬件完全静默或生产SLO。所有旧FAIL保留。[原始A/B JSON](performance/producer-canonical/remaining-2660cff-pass/http100-ab.json)、[phase log](performance/producer-canonical/remaining-2660cff-pass/http100-ab.txt)、[真实集成](performance/producer-canonical/remaining-2660cff-pass/integration.json)。

维护决策：保留一个≤3receipt base64分组decoder及显式width1 oracle，换取这轮有实际HTTP净收益的固定往返减少；不解锁、不增加cache/migration/concurrency，不继续追加无依据微优化。下一受控5000沿239完全相同参数，全部旧失败及未发送原样保留；B前置持久收件箱仅隔离原型，见 [ADR060](ADR_060_INGEST_RECEIPTS.md)。

## 原参数72ea929唯一5000复验：仍FAIL，转B隔离实验

相同50/1s/10s/queue8/concurrency2/drain120及239开关（incremental1/coverageReuse1/pagePathBatch1/publicationConcurrency2），不可变72ea929，整体EXIT1/200.493s，子进程峰710716KiB不含数据库。100次计划全部scheduled，94发送/HTTP202、4700accepted、0rejected/请求失败、6queue_full_unsent（68、79–83）；不是deadline提前结束，不补发。12次看板查询失败0，77探针失败0；所有已接收排空与最终断言均通过，cleanup/sourceUnchanged=true。

intake103.217s、drain66.166s≤原120秒、final19.488s；最终实际HTTP18.187s/PV4700/coverage1/CH，canonical4701/PV含bootstrap1、UV95，九类PG正文0，outbox4701全done/queued0、processed/水位完整。旧2394900/2相比此次4700/6的工作集/选集不同，不将overall/query缩短宣称因果或达标。原reported batchP95约8494.662ms、queryP95约16170.623ms，event-loop intake平均6.763/max127.768ms；P95与nearest-rank另表不混写。共享site gateHTTP等待累计114.915s/max12.603s，认证42.503s、TEMP26.605s、最终SQL3.847s为inclusive累计，不相加当wall。查询全部认证和TEMP仍持门，不能unlock+epoch复查。

[原始JSON](performance/producer-canonical/strict5000-72ea929-failure/result.json)、[计划](performance/producer-canonical/strict5000-72ea929-failure/plan.json)、[调度摘要](performance/producer-canonical/strict5000-72ea929-failure/scheduler-summary.json)保留。A的局部净收益有真实同数据依据，但不足以完成此固定容量目标；不追加新微调或无变化重跑5000，按用户批准转向B隔离收件箱原型及故障验证。完整72应用/浏览器入口正在自然运行，尚未预写通过；原型不接正式collect。
