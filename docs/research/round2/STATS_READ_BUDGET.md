# 整操作统计读取预算

统计 queryStats、关系化读取与比较 snapshot 共享一个 AsyncLocalStorage 预算；嵌套及两个比较区间不重置。只在统计读取入口应用，不在写入、删除、备份或 worker 发布操作开启预算。默认选择保守值，依据已有共享主机单轮 final HTTP 最高成功约25.6秒与整轮数千次跨请求读取；整轮总量不是单请求需要，不用提前拒绝宣称提速。

部署只读取以下三个白名单环境设置，不打印值。无设置时使用默认，非法设置固定错误拒绝：

| 环境设置 | 默认 | 允许整数范围 |
|---|---:|---:|
| BAIZE_STATS_READ_DEADLINE_MS | 120000 | 1..3600000 |
| BAIZE_STATS_READ_MAX_SELECTS | 20000 | 1..1000000 |
| BAIZE_STATS_READ_MAX_DECODED_BYTES | 2147483648 | 1..17179869184 |

SELECT 在显式调用前预约累计次数，失败调用也消耗预算；次数不是扫描行数。fetch 解压后实际正文 chunk 累加字节，一条响应只计一次，包括直接 JSON count/ACK 解码；不记录正文、SQL、ID、URL或凭证。字节是操作累计传输量，不是 Node/数据库内存峰值保证。绝对单调时限合并原HTTP timeout信号，每个原bodycap、EOF、hash/HMAC及fence保持；合法HTTP200 JSON内非空server exception与JSONEachRow异常终行均拒绝，不能将部分data视为完整。

PG17 在统计专属客户端一次读取/一次设置 statement/lock/transaction_timeout（保原更严格值），不用每条SQL新增SET。操作到期关闭该操作连接中止在途排序/锁等待，PG自动回滚；正常路径恢复原设置后owner归还。迟到pool连接主动归还。超限为固定 stats_read_budget_exceeded/503，不能返回部分coverage1；正常source/缺body错误保持严格。真实PG/CH rollback/max1连接恢复专项由独立fixture验收，不能以纯单元替代。


## 本轮实际验收（预算安全，不是性能承诺）

[真实验收记录](../../test-evidence/stats-select-budget-validation-record.json)：9 项真实PG/CH累计预算/超时/恢复与4项真实CH服务端SELECT/合法200异常正文专项，总13 PASS、0 FAIL、0 SKIP。包括nested累计不重置、decoded bytes累计、deadline、max1连接恢复与严格事实仍可读，以及服务端异常部分JSON不被产品当完整data。确切命令/源码绑定及日志由该记录保留，fixture不是外部生产性能结果。

[轻量17项原报告](../../test-evidence/main-stats-read-budget-unit-17.json)，SHA256 `7c0b909778aacb32ae5af74e37b21597cd6008132b8264ef2d3e08980248199c`：stats-read-budget 8 + clickhouse-select-budget 8 + adapter-performance-eof 1；根代理只跑前两文件的16项是同一覆盖子集，不将16+17重复累加。全仓typecheck和ownedlint通过。

这些证明操作超限失败关闭、原严格数据读取与连接生命周期保持，不证明查询更快或达到SLO。默认字节/次数上限不是内存峰值或扫描工作量保证，120秒只是安全截止；既有5000负载失败及慢finalHTTP证据继续有效。真实生产硬件/并发分布与外部账号未被此本地专项代替。

## Docker安装的非秘密配置

标准Compose现在显式把下列`.env`数值传给app，未配置时与native默认一致：`BAIZE_STATS_READ_DEADLINE_MS=120000`、`BAIZE_STATS_READ_MAX_SELECTS=20000`、`BAIZE_STATS_READ_MAX_DECODED_BYTES=2147483648`。需要调整时在本地安装`.env`写入已验证范围内整数并重建app容器；这不改变端口、数据库网络、费用或其他资源限制。预算超限仍明确失败，不返回部分统计冒称完整。不要在浏览器或客户端传入服务器预算。

静态`docker compose --env-file /dev/null ... config --format json`默认及override对照通过，仅保存三项安全数值，见 `../../test-evidence/stats-budget-compose-config.json`。该检查未启动容器，也不表示当前c890不可变全轮或旧镜像已覆盖这项Compose配置；新镜像必须重新绑定包含本配置的提交。原应用默认和预算业务逻辑未改。
