# 047真实看板读取：有界receipt合批候选

状态：2026-10-11，候选在制，默认仍单receipt；不声称净收益、5000通过或新全轮通过。最近完整功能入口为2d2dda2（359单元/490集成/31浏览器，全0skip）；d90e09a相同应用树的新镜像安装与独立签名恢复已有分开的真实证据。详见 [producer与恢复记录](PERFORMANCE_PRODUCER_CANONICAL.md)。

## 依据与明确边界

固定239原负载HTTP047累计864请求、约67.1MB、传输9838.127ms；这些是累计inclusive stage，不是墙钟占比。8195be3真实100采集后strict迁移，三次HTTP200返回相同统计摘要、PV/UV100、coverage1，五类PG正文为0；各71请求/约6.71MB，transport612.468/605.651/731.107ms，wall1752.845/1736.8/1989.8ms。整个入口source_check FAIL保留：root误以仓库cwd启动不可变脚本，同时helper阶段日志在该cwd变化。下一版sourceDigest根据import.meta.url定位自身快照，Git archive单独逐blob绑定，不能删除最终检查或把此FAIL改PASS。原始证据 [JSON](performance/producer-canonical/http-8195be3-100-failure/result.json)。

候选只合并最多三个同kind receipt的CH读取。每receipt仍最多100行；每个PG成员count/checksum、完整正文SHA/canonical/HMAC/key、归属/来源及carry anchor/orphan均认证。整组三个receipt全部认证后才yield原每批≤100行给TEMP。不并发、不unlock共享站点门、不缓存正文/认证证明、不用epoch复查替代门。044既有读取组不变；canonical ACK后PGrollback可不改变epoch，仍必须保留原门和可见性协议。

三receipt query仅限列举已提交attempt，使用每attempt101行sentinel，未知/重复/超限/缺正文全拒绝。group body以base64避免JSON斜线膨胀，UTF8 fatal解析、规范base64及总16MiB EOF预算保留。单receipt100正文及normalized32KiB约束仍原样。生产默认1，构造参数3仅隔离A/B候选；有净收益和所有适用正确性通过后才决定推广，不默认为生产已验。

## 比较方法

`scripts/benchmark/remaining-http-read.ts` 是本地可复制入口，不依赖Codex会话；显式使用已授权PG/CH fixture及串行资源闸，创建并清理自身schema/namespace。strict准备复用真实测试fixture与签名backup/proof，不是产品CLI或生产站点；零carry行如实记录。冻结源码后先100事件，在**同站点、同已认证正文/receipts**上交替宽度1/3，各三次真实登录HTTPstats。统计摘要、PV/UV/coverage与receipt前后摘要均一致才可比较。阶段ms有嵌套，分别报告wall、actual requests/response bytes/authentication/TEMP，不相加为总wall或CPU。

调用时须先逐blob验证Git archive，切换到该archive：

```sh
BAIZE_SERIAL_RESOURCE_GATE=1 FROZEN_SOURCE_SHA="$frozen_sha" \
  BENCHMARK_OUTPUT="$new_result_path" REMAINING_HTTP_EVENTS=100 \
  node --import tsx scripts/benchmark/remaining-http-read.ts
```

TEST_DATABASE_URL、CLICKHOUSE_TEST_URL及本地fixture账号从既有环境传入，不打印secret。100/1000都是小样本方向/对照，不代替原50events/s、100次50事件、query10s、queue8、并发2、drain120s的5000验收。只有候选具有净收益才追加一次受控原参数负载；全部旧FAIL与未发送批次保留，不补发、不延drain。当前未记录任何候选实际A/B成功。
