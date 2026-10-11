# 原环境执行轮次交接（2026-10-11 UTC）

## 本轮追加：5c02abf实际验收与保存

### 本轮当前状态

| 源/阶段 | 实际结果与边界 |
|---|---|
| 5c02abf正式全轮 | actualEXIT0：229单元+439真实集成=668后端，0fail/0skip/0unhandled；30检查（28真实Chromium+2日期）全PASS，freshCompose清理完成；证据main-5c02abf-full-* |
| 新055镜像 | 实际EXIT0，56DDL/394manifest/独立签名恢复、源不变及失败拒绝；见 main-5c02abf-image-* |
| 新固定负载 | 整体EXIT1：1000PASS finalHTTP3.881271447秒；5000FAIL全部5000accepted/0unsent/36delayed/queryfail0，120秒未排空、lastBacklog2600、最终断言未通过；见 main-5c02abf-fixed-*，旧FAIL/容量探索保留 |
| Git/托管/UI | Git授权恢复、正常push5c成功并校验bundle；视觉方向暂停，托管全部禁止 |

原d88157P01与7ed25P04完整EXIT1保持历史失败。旧d67的645/30/镜像不外推055当前源；新镜像已单独验收，固定5000仍FAIL；不称性能收工或触发托管。

## 原回合交接历史原文（失败与当时授权状态保留）

按用户要求仅结束当前执行回合，整体项目继续。环境仍为 `/workspace/baize-analytics`，private main；无 reset/force/PR/新环境/新凭据/网络变更。托管 CI 不触发。

## 源码与保存

本轮候选源码提交 `10082b6872275678464ad341cf20bc16bb8e31b8`，测试夹具与失败记录提交 `d881ce2523878e022f98fb62783fdf51909f4a09`。两提交的 src/db/packages/sdk/scripts 相同。远端最后父独立确认 main 为 `e44125b186415213e08205d1f8f0636cb0c6d311`；后续本地提交未推送。

精确认证错误为 `fatal: could not read Username for 'https://github.com': No such device or address`，exit128，没有观测到HTTP状态，不能推断401或token过期。现有代理变量存在但无已证实自行刷新路线。下一执行回合只做一次现有授权只读检查；失败则继续本地保全，不绕过。

可恢复检查点位于 `/workspace/baize-checkpoints/`，最终 bundle/源码归档与 SHA256、前置e441、全部本地提交见 `CHECKPOINT_MANIFEST.json`；不含运行目录、环境变量或密钥。只正常快进/保留历史整合，不 reset/force。

## 新候选与已保存证据

055新增配对nullable响应字节上界及HMAC；新可信receipt最多12同kind批且总上界≤原16MiB，旧NULL最多3。固定JSONEachRow完整EOF、101 sentinel、正文hash/HMAC/fence、累计预算、精准删除均保留；失败不拆分重试或返回partial。v1/v2显式备份投影、独立恢复新hint及history scope边界已接入。

专项11真实PG/CH通过；首10通过/1夹具DDL注入失败保留。全229单元、lint/type通过。10082首次空库全轮实际EXIT1：集成437通过/2失败/0跳过（160文件），浏览器未运行。失败为旧三批请求夹具用了新receipt、跨日夹具在UTC00实际仅一日；只修测试，7真实PG/CH用例通过。原始证据在 docs/test-evidence/main-055-* 与 main-10082b6-full-failed-*。

d881空库整轮已自然结束并清理，实际 **EXIT1**：229单元与439集成断言全部通过、0跳过，但存在1个未处理PG `57P01`（terminating connection due to administrator command），Vitest报告源自 strict-identity-restore.test.ts。根因尚未核实，不能把断言通过称全轮通过。JSON reporter 的 success:true 只反映断言，实际进程exit1为准；浏览器/后续阶段未运行。证据 main-d881ce2-full-failed-*，文本省略连接对象以避免归档运行连接字段，原本地日志保留。清理后仅原三个服务，可用盘观察9.1GiB。

## 下一回合有限剩余

1. 先核现有Git授权一次，保留本地历史；能恢复才正常push main。
2. 优先核实并修复本次真实未处理57P01连接终止异常，检查 strict-identity-restore.test.ts 的连接生命周期/cleanup；不据日志推演断言根因，不忽略错误追绿。lint/type/build/SDK/journal本轮已通过；修复后按影响范围和空库整轮复验，完成独立应用迁移/编译入口与浏览器。已关闭审计不重开。
3. 055新镜像尚未运行。`/tmp/baize-round2-final-image.sh` 已轻预检适配56DDL及055约束，保留054索引/原预算/独立签名恢复故障矩阵。先资源闸，使用最终冻结Git快照。旧d67镜像EXIT0不覆盖055。
4. 新候选只做一次原固定高到达率1000/5000对照；原入口 `/tmp/baize-d67bb8a-performance.df5adccj/run-strict-1000-5000.sh`，只替换快照/源码SHA/输出路径，1秒50事件、查询10秒、queue8/concurrency2/drain120及阈值不变。如失败诚实保留，不无限追绿。
5. 新候选性能未测，不称提速/SLO。原d67高率5000 FAIL（4700接收/6批未发）完整保留；低速探索PG5000PASS，strict5000全部接收但120秒未排空/final assertions未完成FAIL，分开记录。见 CAPACITY_EXPLORATION.md。
6. 功能/UI旧证据与性能分开；PG日均百万设计目标及持续<5分钟延迟/1C2G并未被数千事件证明。真实外部账号、小程序真机、读屏/跨物理机未测；Windows是执行器prestart错误、Ollama是403下载阻断，非笼统缺账号。

## 视觉方向待用户选择

用户最新明确暂停现有视觉方向的小修小补，不替换正式界面，保留既有功能和可访问性改进。父线程独立准备4套桌面/手机视觉概念；用户选定后才实施，本执行器不重复制作、不擅自选风格。

重型任务串行，保留原三个服务和正在用的卷。旧缓存精确清理证据已保存，不全局prune。CNB/Actions在整体本地收工前均不得同步/触发，父负责最终托管验收。
