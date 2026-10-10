# 安装、升级与数据迁移运行手册

本手册供自托管操作者使用。操作对象仅为你拥有的实例；命令示例不会自动发布网站、改变仓库可见性或切换生产流量。接口契约见 [API](api.md)，具体安装文件/网络配置见 [部署](deployment.md)。中英文手册对应入口：[English operations manual](en/migration.md)。外部账号/付费API无须为阅读或本地验证而创建。

## 先选择你要做的事情

| 场景 | 正确工具 | 不能替代的事情 |
|---|---|---|
| 新实例 | install.sh或本地npm开发启动 | 初始化不是旧数据库迁移 |
| 应用schema升级 | 前向SQL迁移 + upgrade.sh停机备份/健康校验 | 旧程序镜像不能自动撤销已提交schema |
| 单站业务数据下载 | API站点CSV/JSON，full每表100k | 不是整实例/密钥/灾备全量备份 |
| 完整PG灾备 | scripts/backup.sh与restore.sh | 必须同时有独立最新删除journal、应用files和密钥版本 |
| GA4历史聚合 | 管理员OAuth + GA4 import/exact window | 不能恢复原事件、身份、真实漏斗/留存或跨来源UV |
| CH历史快照 | history API或history-cli.ts | 只恢复隔离副本；PG仍为权威，不是已完成canonical迁移 |
| Umami等整库迁入 | 当前无已验收自动迁移器 | 不直接套入不兼容schema，不编造转换成功 |

## 新安装与本地开发

先安装Node≥24、Docker Engine/Compose v2（Docker方式）、PostgreSQL、Redis。使用仓库锁文件 `npm ci`；不要用安装器修改其他实例/仓库。安装器在当前checkout创建被忽略的.env/.baize并生成本地秘密；不要提交这些文件、运行envdump、显示密钥或把网络预览当部署验收。

```bash
# 已准备好本地Docker/Compose和镜像网络条件时：
./install.sh
# 或本地开发，数据库/Redis凭据已通过安全环境绑定：
npm ci
npm run db:migrate
npm run build
npm start
```

npm start 默认监听127.0.0.1:3000；如需容器监听按既有部署配置设置HOST。应用启动会前向migrate、验证删除日志/恢复标记、重试文件清理并启动生产定时器。`GET /healthz`验证实际PG/缓存状态；`GET /api/setup`确认required，再通过UI首个管理员初始化、建站、复制公开tracker snippet。不要默认密码；登录密码至少12字符。独立tracker的replay/heatmap/vitals/consent插件须按站点配置使用，不把管理员Token放网页。

本地开发建议DATABASE_URL/REDIS_URL、DATA_DIR、KEYS_DIR、MASTER_KEY_FILE、PUBLIC_URL使用私密环境绑定。初始化和秘密目录对应实际main版本，不能随意替换现有master key。已含数据的环境不重新运行初始化、更换privacy_mode或重置删除watermark。应用后台生产timer和worker-main是不同启动路径；验收使用哪个须明确记录。

## 前向schema迁移与分区

迁移目录 db/migrations按文件名顺序执行，每份SQL独立事务，schema_migrations保存checksum；已执行文件修改会失败，**修正用新的编号迁移**。数据库全局迁移锁协调同实例启动，不能以删除schema_migrations跳过检查。切换应用版本前保存恢复点与旧镜像，不在生产临时禁用约束/SSL/校验来“跑通”。

事件表按月份range分区，PK包含site_id/event_id/ts，属性外键对应同三元组；不能为分区表添加不含分区键的假唯一PK。event_keys负责全站event_id幂等冲突策略。默认分区容纳尚未建月分区事件；maintenance在schema-scoped分区排他gate下搬移事件及EAV，然后创建分区。collector/worker/retention使用共享gate，避免FK/关系锁顺序反转。RR快照须在DDL gate可用后才BEGIN，防止等待前固定旧快照遗漏搬移数据。

保留期按站点判断，不按一个站点策略删除整个共享月份。只删除空历史月分区，持gate后再次检查存在/是否为空，不能用过时catalog列表直接DROP。分区删除不恢复已丢失明细；archive rollup可保留完整桶，边界不完整桶明确不可用。

## 升级：停机、恢复点、版本验证

upgrade.sh是**停机升级**，不是零停机。它检查空闲磁盘、预留恢复空间、停止app、做备份，再运行新本地镜像/迁移并等待健康。实际执行前确认镜像已经准备好；本轮文档示例不拉取/部署外网服务。

```bash
# 已有本地镜像引用；不要传任意未审阅公网镜像：
./upgrade.sh "$BAIZE_LOCAL_IMAGE"
```

成功后验证schema版本、healthz、登录权限、真实采集202及rejected、后台watermark/coverage、删除和下载撤销；仅打开端口不足。新镜像或health/schema检查失败时脚本恢复PG schema/data和旧镜像，保留诊断恢复点；不能仅回旧镜像却沿用已提交新schema。磁盘低于默认2GiB时升级会在停服务前拒绝；134217728字节恢复reserve不是容量保证，按实例体量准备足够空间。

不手动force/reset丢未提交用户文件，不修改已执行迁移checksum，不直接DROP生产库。失败恢复脚本不自动切生产流量；保留错误和实际exit，不能用随后一次成功覆盖失败证据。

## 整实例备份：数据库、独立日志、文件、密钥

备份目录必须新建不存在，shell umask077。实际命令：

```bash
scripts/backup.sh "$BAIZE_NEW_BACKUP_DIR"
```

该命令使用Compose postgres的pg_dump custom格式，保存database.dump；复制tombstones.jsonl及tombstones.watermark.json并校验；保存app-data.tar.gz（排除key）、app-image.id、master-key.sha256、SHA256SUMS。密钥**独立包**存于BAIZE_KEY_BACKUP_DIR或.baize/key-backups，包含原master.key及所有版本keyring、独立SHA256SUMS；主备份仅保存key-package.ref。数据库snapshot不够：导出、GeoIP、删除journal、签名history文件等app-data，以及解密/验签所需旧版本key均需要保留。

密钥包与数据包分开保护，目录0700/文件私有，离线保存，限制操作者权限。不要把key-package.ref当实际密钥内容或认为只记key哈希可以解密。新轮换key不能覆盖/删除旧版本；数据库instance_keyring active version与文件master.vN.key必须对应。旧iv:cipher:tag格式可按v1兼容读取；新envelope使用版本key，未知/缺key fail closed。

**删除日志是独立、追加并可靠持久化的状态，不与旧DB snapshot一起回滚。** 保存后发生的新删除必须携带至恢复目标。备份自身日志只证明snapshot时已有删除，不能代替恢复时独立最新journal。完整删除记录和watermark校验缺失、截断、重置或比snapshot旧都必须拒绝恢复；不要创建空journal来通过校验。

## 恢复：新数据库与独立卷，不切流量

restore.sh要求新数据库名以baize_restore_开头，并拒绝覆盖已存在数据库/目标卷。使用备份匹配的master key，独立密钥包可通过BAIZE_KEY_RESTORE_DIR安全配置。

```bash
# 两个变量都应由操作者明确设置；目标必须全新：
scripts/restore.sh "$BAIZE_BACKUP_DIR" "$BAIZE_NEW_RESTORE_DATABASE"
```

步骤：验证备份checksums/key-package；从当前源app复制**独立最新**journal与watermark并与snapshot校验；在任何目标DB创建前拒绝缺失/重置/旧日志；新建app_data和app_keys目标卷，复制snapshot中性文件与旧key版本；创建新PG DB并pg_restore；迁移/回放删除日志、撤销导出并可靠物理清理、清缓存与旧任务、重算聚合；记录.baize/restores/目标.json且trafficSwitched=false。

恢复后的数据不能让被删除身份复活：入口tombstone、identity时间段、event_keys/outbox、实验event贡献、rollup/cache、旧export/files和CH/history副本都必须协调失效。旧lease/generation/epoch任务不能覆盖恢复重算。数据目录路径按目标卷安全映射，不按备份中旧绝对路径任意rm；仅清已关联导出ID文件，保留中性GeoIP文件。cleanup失败持久排队/退避，不报告物理删除已完成。

如果配置CH恢复，BAIZE_RESTORE_CLICKHOUSE_URL须显式隔离新端点，不能指源实例同endpoint/namespace；未设置时以PG运行，失效旧replica标记，不借源CH副本假称恢复。失败保留新目标DB/卷供诊断，无成功marker、无流量切换。完成后由操作者另行验证再决定切换；此文档与脚本不自动部署/合并/公开。

## 保留、隐私与重算

PATCH站点retention或S/retention后，maintenance按站点清expired raw/events keys/outbox及相关状态；dirty/活跃lease站点须协调，不能清掉尚待处理批次。保留aggregate不等于可恢复明细，非整小时/过滤/漏斗用户特征/身份路径超保留期应rangeStatus/coverage不可用。扩大retention_days只能延长今后保存，不能凭空恢复已删除事件。

标准模式identify用事件时间的时间段绑定；匿名→A→B不回溯自动归A。每日盐模式禁止identify/跨日UV/跨日留存，持久化不保留稳定客户端ID和PII属性。旧隐私清理迁移会清理残留属性/EAV/导出、dirty generation和cache；不通过备份回灌原PII。

管理员可POST S/jobs/replay重置epoch/重试状态，由生产worker基于完整保留事件重算；不是批次替换整周期。worker保存高水位/processed_generation，发布fence检查epoch/lease owner，旧任务无效。错误处理需复用持有client或先释放再借池；ROLLBACK仅结束事务，不释放连接。报表查询、错误导出、fence miss、邀请审计等同client路径有真实max1/max10回归，不能以pool容量增加替代资源顺序修复。

## 从GA4迁入历史聚合

先配置Google OAuth并由站点管理员真实授权；POST E/ga4/import `{start,end}`，包含两端日期最多3660天。保存五个提供方报告sourceDays/days/weeks/period/sources，每report最多100k rows、单HTTP响应≤5MB；超限失败，不能把截断当完整历史。

GET E/ga4/window仅当请求start/end**精确等于**保存provider窗口时返回saved-provider-window，未导入同窗口则unsupported。单日、ISO周、整段、来源totalUsers分别由提供方独立去重；不能相加日UV估计整段UV，也不与本地UV/会话去重混合。property_id/property_timezone/thresholding/sampling metadata保持来源边界；未知时区明确unknown/质量limited。虚线历史PV叠加是对照，不把GA4转换成本地原访客或漏斗历史。真实Google账号未实测时保留该边界，即便PG/mocktransport/UI通过。

GSC为query/page/day聚合，通常延迟2–3天；不能用搜索词推断某个用户订单。现无已核验Baidu流量API。其他产品整库自动迁移器尚未完整验收，先备份原产品，通过明确支持的聚合格式迁入，核对数量、时区、币种和UV口径；不要直接导入不兼容schema。

## 可选ClickHouse与历史快照CLI

PG是权威事件和删除状态。CH snapshot_v1/incremental_v1为可校验副本；prefer_clickhouse读取显式source/mode/fallbackReason，mirror只双写核验不自动承担查询。损坏、落后、epoch变更等回退PG。rollup、worker RR、export RR、身份元数据等仍走PG；没有完成“所有存储改为CH”的canonical迁移。

history保存raw/hourly/daily/vitals原JSON结构、slice checksum、epoch/generation/outbox watermark；超保留raw明确unavailable_not_reconstructed。capture/backup/restore需要配置DATABASE_URL、CLICKHOUSE_URL、MASTER_KEY_FILE、DATA_DIR、KEYS_DIR，值由私密环境绑定，不在命令中写密码、不打印环境。

```bash
# 只操作明确指定的本地实例；每步先保留响应ID再执行下一步。
npx tsx scripts/history-cli.ts capture "$BAIZE_SITE_ID"
npx tsx scripts/history-cli.ts backup "$BAIZE_SITE_ID" "$BAIZE_HISTORY_MANIFEST_ID"
npx tsx scripts/history-cli.ts restore "$BAIZE_SITE_ID" "$BAIZE_HISTORY_BACKUP_ID" "$BAIZE_NEW_HISTORY_NAMESPACE"
```

capture返回manifest id，backup返回签名backup id/bytes/integrity，restore namespace必须新UUID，响应activated=false/authority=postgres。restore验签/版本key/manifest/slices、最新PG删除与epoch，恢复到隔离namespace；没有自动切canonical来源或恢复删掉的人。API对应S/storage/history/capture、/:id/backup、/:id/restore。备份file与签名key版本必须一同保留，不能仅导出CH表行自称完整恢复。

## 验收清单与故障边界

操作后记录实际命令exit、镜像/源码SHA、schema版本、目标DB/卷、journal验证、应用权限、真实采集及幂等、聚合watermark/coverage、export下载与删除物理清理；对外部账号、真实模型质量、Windows/小程序设备等未实测项单列，不用环境smoke替代应用验收。

已保存真实Docker安装/备份/独立卷恢复/提交schema后失败回滚证据，见 [运行验证](validation-ops.md)、[部署](deployment.md) 与 [主验收记录](VALIDATION_MAIN.md)。本地CPU百万手动worker与持续background压力测试分别见 [scale](validation-scale.md) 和 [continuous](validation-continuous-scale.md)，不据此宣称1C2GiB或生产SLO保证。最新主验收记录优先于早期历史数字；本文件不自动重跑外部账号或部署生产。

## 下一批AI删除与百度手动迁移边界 / Pending AI deletion and Baidu import boundary

工作树031整site失效拟清AI派生答案/证据/建议与相关导出，保留预算账本；新的物理清理hooks未纳第五272/19和第六pre-deletefix289/20。恢复须重放最新journal后失效这些旧衍生内容，待新完整验收，不把旧镜像假称已支持。

Pending031 invalidates site-derived AI answers/evidence/suggestions/exports while retaining budget accounting. Physical cleanup hooks are not part of fifth272/19 or sixth pre-deletefix289/20. Restored historical derivatives must be invalidated after latest-journal replay; acceptance is pending.

百度普通站长搜索分析公开读取API截至2026-10-10未证实，官方产品说明可读不等于API可用。2015关键词下载说明没有当前CSV样本；通用自定义模板+列映射不可宣称原生百度兼容。搜索资源URL提交、百度统计PV/UV搜索词和自然搜索展现/排名是不同数据，不能互相冒充。详见[官方搜索分析](https://ziyuan.baidu.com/college/articleinfo?id=3415)、[2015下载说明](https://ziyuan.baidu.com/wiki/571)、[统计搜索词API](https://tongji.baidu.com/api/manual/Chapter1/source_searchword_a.html)。

Baidu public search-analysis read access remains unverified; available product documentation is not an API contract. No current native CSV sample is available. Custom import templates/column mapping cannot be described as native compatibility. URL submission, Tongji PV/UV search words and natural-search impressions/rank must remain separate sources.
