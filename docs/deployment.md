# 本地自托管安装与恢复

## 当前验收入口（唯一当前表）

| 源/阶段 | 实际证据与边界 |
|---|---|
| 66150be正式全轮 | root25860运行中，最终结果待；新镜像/负载未跑 |
| 66150be独立静态/单元 | type/lint/215单元PASS，不代替正式全轮结果 |
| 0a提交前摘要绑定专项 | 19真实定向PASS，仅对应precommit源码摘要，不是全局计数 |
| c890后端（历史源） | 211单元+421真实集成=632PASS，未外推661 |
| 1c1cb65浏览器/镜像（历史源） | 30检查=28Chromium+2日期PASS；镜像EXIT0，均绑定1c非661 |
| 1c1cb65固定负载（历史源） | 1000PASS，5000FAIL，不称SLO达标或661结果 |

托管不触发。以下更新段全部是明确SHA对应的历史阶段原文：其中“当前/最新”仅指各历史时点，不构成另一个当前入口。bd未捕错误、0a类型FAIL、测试WIP两FAIL、1c负载FAIL及所有原来源完整保留。

## 历史SHA阶段记录与原契约

**当前66150be测试窄修**：完整type/lint/215单元实际EXIT0，src/db/packages与0a相同；19真实precommit专项仍只证明此前摘要绑定源码，不是完整全轮。0a正式入口实际EXIT2（TS2749），unit/int/browser/image未运行；随后测试WIP首次213/215单元通过、2FAIL，类型与event-capable mock窄修后215PASS。先type后追加测试导致旧报告外推的失误已记录，不掩盖。661新full/image/load待；bd未捕获错误、0a类型FAIL、测试WIP2FAIL及1c负载FAIL原证据保留。

当前更新a9b49e7：bd3f51f三批候选7单元/21真实专项PASS，但新完整入口实际EXIT1：213单元PASS，集成424检查中423PASS/1skip，并有uncaught PG25P04 error1；浏览器NOT RUN。旧1c30浏览器及镜像通过仅绑定旧source，不外推候选。skip来自runner漏env，已改用仓库validate-local-final.sh正式入口；C idlefatal修复已保存0a0c171：precommit WIP摘要绑定第四轮19真实专项PASS/0skip/0uncaught，10单元/type/lint通过；新0a全量/镜像/负载尚待。所有FAIL保留，托管不触发。

### 历史bb6阶段状态表

证据归档已随bb6a20c保存；下表按实际源码与执行阶段区分，不累加历史计数。

| 源与阶段 | 当前实际结果 |
|---|---|
| c890后端 | 211单元+421真实集成=632 PASS/0skip，已实际执行 |
| 1c1cb65浏览器 | 30检查=28真实Chromium+2日期全部PASS/0skip，92.6437秒，EXIT0/cleanup |
| 两阶段源码关联 | src/db/packages与c890一致已核；不声称1c重跑后端 |
| 1c1cb65新镜像 | 实际EXIT0；a5d495d6…，55DDL/054两个索引、391源码与镜像一致、运行budget probe、独立目标latest journal删A保B/源不变、故障拒绝及cleanup通过；证据main-1c1cb65-image-* |
| 最终固定1000/5000负载 | 1000 PASS（最终HTTP5120ms）；5000 FAIL（4900accepted/2unsent/39delayed、120秒排空deadline、最终断言未执行），仍有本地性能欠项 |
| 托管/外部边界 | 不触发托管；真实外部账号、设备及模型未测边界保留 |

日期标记和累计SELECT次数/decoded bytes/deadline预算两项有限缺口已有本地证明；预算不保证scan/heap或性能改善。以下各SHA原文为历史时点，不作为另一个“当前/最新”入口；所有FAIL、执行时间与原证据保持。

需 Docker Engine 与 Compose v2。当前发行从私有源码本地构建，不拉取或发布白泽镜像。运行 `./install.sh`：保持现有 .env、密钥和卷，随机生成数据库密码与 32 字节主密钥（0600），构建后等待健康检查。首次访问创建管理员，不提供固定初始密码。默认仅 `127.0.0.1:3000` 可访问。

Compose 中 PostgreSQL、Redis 不发布端口。密钥在 `.baize/master.key`，独立于数据库；密钥备份必须独立于数据库备份保护。版本化密钥位于独立 app_keys 卷（KEYS_DIR=/app/keys），不进入 app_data 卷归档。主密钥不可丢失，否则无法解密已有连接器密钥。云环境代理 CA 使用 BuildKit secret 挂载，保留 TLS 验证，不写入镜像。若在受代理管理的云环境测试真实外部连接器，使用 `docker compose -f docker-compose.yml -f docker-compose.cloud.yml` 使运行容器挂载当前 CODEX_PROXY_CERT 并设置 NODE_EXTRA_CA_CERTS；保留 Docker 注入的代理，不绕过网络策略。用户反向代理可自行配置 HTTPS；登记 TRUSTED_PROXIES 后才信任相应 IP 转发头。任何外网开放或部署需部署者明确操作，本开发任务不做。

`./scripts/backup.sh` 生成新目录，保存自定义格式 pg_dump、独立删除日志、脱离密钥的应用卷归档、应用镜像 ID 与校验和。密钥另存 `BAIZE_KEY_BACKUP_DIR`（默认 `.baize/key-backups`）内的0700目录；数据库备份只含密钥指纹与独立恢复包位置，不含明文密钥。可通过操作系统定时器每日运行；备份应另存离机受限存储。没有删除日志时失败关闭。删除日志必须长期独立保留，不能随数据库备份过期一起丢弃。

`./scripts/restore.sh BACKUP_DIR baize_restore_NAME` 只创建新数据库，拒绝覆盖现有库。校验后恢复数据库，合并当前独立删除日志（覆盖备份后新增删除），重放 tombstone，递增 epoch/generation、废止旧任务、重建聚合、清站点缓存；不自动切换流量。原数据库及应用保持原有配置。恢复后先对账，再人工修改 DATABASE_URL 切流量。

`./upgrade.sh LOCAL_IMAGE_TAG` 先备份，停止应用后迁移并启动新镜像，健康检查失败时还原数据库快照、应用卷及旧镜像（保留当前独立删除日志），并通过启动重放期间独立删除日志。当前为停机升级，不承诺零停机。版本兼容见 compatibility.md。升级镜像必须已经在本机，脚本不发布镜像。

`bash scripts/ops-lifecycle-test.sh` 创建隔离命名栈验证安装、数据库备份、新库恢复、成功升级及失败回滚；结束删除这个测试栈的卷。只应对测试副本运行。相关结果见 validation-ops.md。

GeoIP 无离线库时降级未知；真实 MaxMind/GSC/SERP/AI 账号均由部署者配置，不会自动购买或创建生产凭证。Windows 使用 run.bat，先提供 DATABASE_URL、REDIS_URL 和 MASTER_KEY_FILE；生产推荐 Linux。

## 反向代理与HTTPS示例（由部署者自行配置）

应用继续绑定loopback，代理独立终止TLS。将 PUBLIC_URL 设为实际 HTTPS 地址，TRUSTED_PROXIES 只填写真实代理的CIDR，不能信任任意互联网客户端。下面证书路径是运营者已有证书位置；此开发任务不签发证书、不开放外网。

```nginx
server {
  listen 443 ssl;
  server_name stats.example.com;
  ssl_certificate /etc/ssl/local/stats.fullchain.pem;
  ssl_certificate_key /etc/ssl/local/stats.key;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off; # SSE实时流
  }
}
```

只在授权开放网络后部署者启用该配置。代理必须限制请求体大小并匹配应用采集批量限制，保留真实协议/站点的CORS要求；不要把数据库或Redis端口公开。

恢复必须保留独立当前 `tombstones.jsonl` 与 fsync 水位 `tombstones.watermark.json`，并验证当前日志完整延伸备份日志；缺失、截断、重置、水位不符会在创建目标数据库前拒绝。`scripts/restore.sh` 将 `app-data.tar.gz` 与独立密钥恢复到全新具名卷，记录 `.baize/restores/<database>.json`，不切换现有流量。恢复撤销旧导出、实际清理恢复卷内文件、取消旧通知/外部任务、暂停定时报表、旋转聚合 epoch 并重算及按站点失效缓存。操作员复核后才能启用目标应用与调度。

旧版本非空删除日志没有水位时，应用会拒绝启动。先停止应用，在可访问原数据库与原数据卷的维护容器显式执行 `node --import tsx scripts/ops-migrate-journal.ts`；该工具逐条检查数据库删除标记已存在于独立日志，才 fsync 写入水位。不能用于初始化丢失日志、不能替代独立日志恢复，禁止在恢复流程自动运行。

升级开始前检查工作区至少2GiB可用空间（`BAIZE_UPGRADE_MIN_FREE_BYTES` 可提高），并预留128MiB紧急回滚空间，回滚开始先释放预留。该检查不能保证其他并发Docker拉取不会耗尽存储；升级期间停止无关构建/拉取并监控Docker数据盘。任何回滚失败都必须保留恢复点，应用停机后由运营者释放空间并手动恢复，不能把旧镜像启动或部分回滚视为成功。

以下仅描述PG-authority的可选mirror副本恢复分支，不是当前全局存储契约；严格CH权威及044等正文迁出已交付并有19d同源应用/镜像证据。PG-authority副本分支的新数据库恢复默认禁用ClickHouse，清除目标数据库复制指针、上传/维护旧任务并将存储模式设回postgres，不读取、删除或清理源副本。需要新目标副本时显式设置 `BAIZE_RESTORE_CLICKHOUSE_URL`、`BAIZE_RESTORE_CLICKHOUSE_USER`、`BAIZE_RESTORE_CLICKHOUSE_PASSWORD`；目标须为不同endpoint（同endpoint仅改query/database不算独立目标）。当前副本表namespace固定，不能让新旧恢复实例共用。新目标恢复完成后由管理员明确启用mirror并重建，不直接信任备份中的snapshot。原库升级回滚仍使用原ClickHouse删除屏障，失败不会宣称恢复成功。

已逐站切换的严格canonical CH权威恢复必须使用独立signed target分支，不能按上述mirror分支回空PG或信任备份自报authority。原producer seal/完成receipt/目标隔离、独立最新journal、当前retention proof及真实正文校验仍强制，失败关闭；实际参数与权限见 [迁移运行手册](migration.md)、[API手册](api.md)。19d镜像证据不外推当前c890新源码；c890完整冻结实际EXIT1（632应用通过，浏览器29/30），下一测试夹具复验待，de原FAIL保持。标准Compose正在前向传递三个非秘密budget配置，默认值不变，后续新镜像需绑定实际源另验，不据配置变更宣称性能提升。

当前c890冻结已结束，完整入口EXIT1、cleanup完成：55文件211单元+155文件421真实集成全部PASS/0skip=632应用通过；30浏览器检查29PASS/1FAIL（27真实Chromium+2日期通过），operations Chromium因固定x58画布点击点未命中失败，UI证明不完整。原FAIL保留，不能称全轮通过。root仅测试夹具1c1cb65按实际趋势/canvas几何窄修，焦点、PV、时区断言未降低；下一步同应用源码定向浏览器复验，不重复已过后端。新1c（含Compose预算配置前向传递）的镜像及性能仍待，不将632加旧源计数，托管不触发。

## 历史c890/1c分阶段记录（当前结果见顶栏）

| 源/阶段 | 实际结果 | 边界 |
|---|---|---|
| c890后端冻结 | 55文件211单元+155文件421真实集成=632 PASS/0skip | 已实际执行；不称1c重跑后端 |
| c890首轮浏览器 | 30检查29PASS/1FAIL，整轮EXIT1/cleanup | 原画布固定点失败保留 |
| 1c1cb65浏览器复验 | 30检查=28真实Chromium+2日期全部PASS/0skip，92.6437秒、EXIT0/cleanup | src/db/packages与c890应用源码一致已核；operations单项1PASS10.333秒是子集，不累计 |

有限两项实现缺口已本地闭合：日期标记真实canvas/键盘/时区/权限及PV1断言通过；累计SELECT次数/decoded bytes/deadline预算已由13定向（9PGCH+4服务器/适配器）及同应用632后端证明。限制预算不保证scan/heap或性能SLO。de417中的2FAIL及c890首轮浏览器1FAIL原记录保留，不改写历史EXIT1。

最新1c应用镜像（含cdbenvforward）与独立负载仍待，负责人下一步串行镜像验收；19镜像与ac负载证据不外推此源。托管不触发，真实外部未测边界保持。

1c最终固定负载：1000 PASS、最终HTTP5120ms；5000总体FAIL：4900accepted、2unsent、39delayed、queryfail0，drainReached=false且120秒deadline，剩余积压1350/最大3250。最终查询25.389秒FAIL、assertionsExecuted=[]，不得声称六完整性断言已过。Node峰730509312字节不含数据库，source unchanged且4项cleanup全true；没有预算拒绝。已通过代码功能/浏览器/镜像不等于关闭此本地性能欠项，不据此称提速/SLO。归档证据为 docs/test-evidence/main-1c1cb65-independent-strict-5000.json 及配套record；原FAIL保留。

0a0c171包含三批候选及idlefatal修复。第四轮实际19/19 PASS（11budget+4server+3triple+1strictrestore）、0skip/0uncaught，另10单元/type/lint通过；这是提交前源码摘要绑定定向证明，不是新全局计数。原前三轮FAIL及bd完整EXIT1全部保留。0a新完整空库、镜像和固定负载正在准备，不预写通过；旧c890632、1c30/image、1c1000PASS/5000FAIL各按原源码阶段保留，不外推0a。
