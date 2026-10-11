# 可复用的 strict incremental 性能入口

`run-strict-incremental.sh` 不依赖 Codex 的工作区位置或 `/tmp` 中脚本。需要 Bash、Python 3、Git、Node 与已经按锁文件安装的依赖，及现有的本地测试 PostgreSQL、ClickHouse、Redis。它不会启动服务、安装软件或改变服务限制。

`APP_ROOT` 必须是 `SOURCE_SHA` 的独立 `git archive` 快照；在该目录链接同锁文件的 `node_modules`。`SOURCE_REPOSITORY` 默认是脚本所在仓库，用来逐个核对所有 tracked blob。调用者必须获得串行资源窗口，显式传入 `BAIZE_SERIAL_RESOURCE_GATE=1`；这只是操作约定，不是跨进程资源锁。

```bash
APP_ROOT=/path/to/pristine-snapshot \
SOURCE_SHA=<full-40-character-commit> \
TEST_DATABASE_URL="$LOCAL_TEST_DATABASE_URL" \
CLICKHOUSE_TEST_URL="$LOCAL_TEST_CLICKHOUSE_URL" \
REDIS_URL="$LOCAL_TEST_REDIS_URL" \
BENCHMARK_OUTPUT=/path/to/new-evidence.json \
BAIZE_PERF_EVENTS=300 BAIZE_SERIAL_RESOURCE_GATE=1 \
bash scripts/benchmark/run-strict-incremental.sh
```

只有 `300`（6 批）和 `5000`（100 批）两种参数被接受。每批 50 事件、每秒一批、查询间隔 10 秒、队列上限 8、并发 2、drain 120 秒保持原口径。候选若需启用增量，在同样环境中另外传入 `BAIZE_INCREMENTAL_SESSIONS=1`；基线与候选除此开关和源码外必须保持参数一致。服务 URL 从环境读取，不输出。

入口拒绝已有 JSON 或任何同名证据侧文件，并保留 `.run-lock` 预约标记，避免覆盖失败记录。输出目录需预先存在。运行前检查至少 2 GiB 空闲；这不能保证执行峰值不会跌破该值。应用建立自己的随机 PG schema/CH database，并在结束时检查其清理，不能指向生产环境。

输出包括原应用 JSON、`.log`、`.exit`、`.plan.json`、`.source-binding.txt`、`.wall.txt` 与 `.disk-after.txt`。Python `time.monotonic()` 测量整个 Node 子进程 wall；Linux `resource.getrusage(RUSAGE_CHILDREN).ru_maxrss` 记录已回收子进程的最大单进程峰值 KiB；该值不代表并发子进程 RSS 的同时总和，也不包含独立 PG/CH 服务内存。退出码原样保留，信号退出映射为 `128+signal`。阶段指标是已仪表化的子集，累积计划计数包含重复工作；`hydratedEffectRows` 不是所有 HMAC 校验行数，`reusedOwnerHeads` 不是会话数，`reusedSessions` 独立记录真实已认证会话。

本次只通过 Bash/Python 静态语法检查，尚未用这个仓库内新入口执行负载。原 `/usr/bin/time` 缺失导致的 EXIT127 及后续失败证据均保留。

057 closure selected-run A/B uses `BAIZE_PERF_COVERAGE_REUSE=0|1` (default `0`) to explicitly set the server's `BAIZE_COVERAGE_SELECTED_RUNS`. The resolved numeric value is archived as `coverageReuse` in the plan. It changes only transaction-local run-ID materialization, not body authentication, schedule, queue, concurrency or drain. Invalid values fail before bootstrap or evidence reservation. The retired `BAIZE_PERF_SELECTED` hydration projection experiment is no longer supported.

## 同源码页面路径查找 A/B

`BAIZE_PERF_PAGE_PATH_BATCH=0|1` 默认为 `0`，入口显式覆盖子进程 `BAIZE_SESSION_PAGE_PATH_BATCH`，不会隐式沿用父进程开关。非法值在资源/输出锁之前拒绝。plan 的 `pagePathBatch` 记录实际采用的数值；`coverageReuse` 仍独立记录 `BAIZE_PERF_COVERAGE_REUSE=0|1`（默认0），映射 `BAIZE_COVERAGE_SELECTED_RUNS`。

同一完整SHA、同一机器与所有原参数，先 scalar0 的300，再 batch1 的300，各用不同新证据路径；仅开关不同。`page_path_lookup` 是实际SQL叶计时，`lookupInputRows` / `lookupReturnedRows` 是累计输入 / SQL返回行数（包含NULL路径的返回），不是唯一事件或匹配路径数。它嵌套在会话构建墙钟中，不相加。开关不改变50/1s/10s/queue8/concurrency2/drain120，不改变每FETCH100边界，不自动宣称收益。此说明未运行负载。
