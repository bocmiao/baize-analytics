# 安装、升级与数据迁移运行手册

## 当前验收入口（本地ce42c9f / d67应用源）

| 源/阶段 | 实际证据 |
|---|---|
| d67后端 |217单元+428真实集成=645PASS，实际后端执行|
| ce42c9f浏览器 |30检查（28真实Chromium+2日期）PASS、EXIT0；与d67 src/db/packages/sdk/scripts EMPTYdiff，不称后端重跑|
| d67镜像 |实际EXIT0：55DDL/391manifest/严格独立恢复；瞬时可用盘低62MiB风险已归档，不隐去|
| d67固定1000/5000 |实际EXIT1结束：1000PASS4.537660079秒；5000整体FAIL4700accepted/6unsent/38delayed/queryfail0，但draintrue、六final断言PASS，finalHTTP23.714184648秒；Node峰714698752B不含DB。性能仍欠，不称5000/SLO通过|
| Git/托管 |remotee441已核、push blocked，不再认证尝试；checkpoint manifest /workspace/baize-checkpoints/CHECKPOINT_MANIFEST.json、e441..f91五commit bundleverify0，仅Git对象/已跟踪source不含runtime keys。不称收工，不触发CI|

原661ENOSPC及d67首轮29/30整体EXIT1按原SHA证据保留在历史节。

1240 source文件前后不变、4项cleanup全true。当前无负载运行；末段可用盘观察1.5GiB→结束2.0GiB，不是minimum也不据此作因果解释。其后仅获批10个旧构建缓存精确ID清理，观测可用空间2485452800→9281884160B；完整清理证据另存，不触及最新镜像、共享依赖或卷。

## 历史SHA阶段记录与设计原文

## 历史此前当前表

| 源/阶段 | 实际证据与边界 |
|---|---|
| 66150be正式全轮 | actualEXIT0/cleanup：55文件215单元+156文件426真实集成=641PASS/0skip/0unhandled；30E2E（28真实Chromium+2日期）全部PASS，约1.5分钟；lint/type/SDK/journal/build/migrate/compiledentry全部PASS |
| 66150be固定负载 | 1000PASS，finalHTTP5.047623651秒；5000整体FAIL：4350accepted/13unsent/35delayed、drainfalse120秒；已接受4350最终PV4350/coverage1/sourceCH，六完整性断言PASS，finalHTTP21.102973929秒；不是5000或SLO通过 |
| 最新镜像/远端状态 | 新镜像尚未完成；本地HEAD e441存在，HTTPS认证失败导致push尚未确认，不操作Git或托管 |
| 66150be独立静态/单元 | type/lint/215单元PASS，不代替正式全轮结果 |
| 0a提交前摘要绑定专项 | 19真实定向PASS，仅对应precommit源码摘要，不是全局计数 |
| c890后端（历史源） | 211单元+421真实集成=632PASS，未外推661 |
| 1c1cb65浏览器/镜像（历史源） | 30检查=28Chromium+2日期PASS；镜像EXIT0，均绑定1c非661 |
| 1c1cb65固定负载（历史源） | 1000PASS，5000FAIL，不称SLO达标或661结果 |

托管不触发。以下更新段全部是明确SHA对应的历史阶段原文：其中“当前/最新”仅指各历史时点，不构成另一个当前入口。bd未捕错误、0a类型FAIL、测试WIP两FAIL、1c负载FAIL及所有原来源完整保留。

## 历史SHA阶段记录与原契约

**当前66150be测试窄修**：完整type/lint/215单元实际EXIT0，src/db/packages与0a相同；19真实precommit专项仍只证明此前摘要绑定源码，不是完整全轮。0a正式入口实际EXIT2（TS2749），unit/int/browser/image未运行；随后测试WIP首次213/215单元通过、2FAIL，类型与event-capable mock窄修后215PASS。先type后追加测试导致旧报告外推的失误已记录，不掩盖。661新full/image/load待；bd未捕获错误、0a类型FAIL、测试WIP2FAIL及1c负载FAIL原证据保留。

当前更新a9b49e7：bd3f51f三批候选7单元/21真实专项PASS，但新完整入口实际EXIT1：213单元PASS，集成424检查中423PASS/1skip，并有uncaught PG25P04 error1；浏览器NOT RUN。旧1c30浏览器及镜像通过仅绑定旧source，不外推候选。skip来自runner漏env，已改用仓库validate-local-final.sh正式入口；C idlefatal修复已保存0a0c171：precommit WIP摘要绑定第四轮19真实专项PASS/0skip/0uncaught，10单元/type/lint通过；新0a全量/镜像/负载尚待。所有FAIL保留，托管不触发。

### 历史2818bd4验收入口

c890实际后端211单元+421真实集成=632 PASS；1c1cb65浏览器30检查（28Chromium+2日期）PASS，src/db/packages与c890相同，不声称后端重跑。1c生产镜像实际EXIT0，main-1c1cb65-image-*证据绑定source1c。最终固定1000已PASS：最终HTTP5120ms、Node应用+harness采样峰650272768字节（不含存储服务）；5000最终FAIL（4900accepted/2unsent/39delayed、排空超时、最终断言未执行），不预称通过或SLO达标。预算默认值不保证scan行数、heap上限或性能改善。下文main0f/de当前或标记browser待等均为对应SHA历史原文，旧失败保留；托管不触发。

## 历史契约与阶段记录

当前交付：main0f14；19d97af同源595应用/30检查与55DDL/两个索引生产镜像均实际通过，核心activation guard已true，逐站proof/epoch/journal仍强制。下文早期切片的guard关闭/未交付描述是历史时点，不能用于当前操作；不得手动改authority绕过证明。ac投影仅定向14真实+2单元通过，ac1000通过5.316秒、5000失败，浏览器专项实际30检查PASS/0skip，96.441秒、EXIT0，不外推全轮或镜像。

本手册供自托管操作者使用。操作对象仅为你拥有的实例；命令示例不会自动发布网站、改变仓库可见性或切换生产流量。接口契约见 [API](api.md)，具体安装文件/网络配置见 [部署](deployment.md)。中英文手册对应入口：[English operations manual](en/migration.md)。外部账号/付费API无须为阅读或本地验证而创建。

## 现行用户契约与操作手册

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

当前删除与journal重放路径已清除整站AI派生答案/证据/建议并撤销导出，保留预算账本；这些hooks未纳第五272/19和第六pre-deletefix289/20，但已纳入fa3第七分阶段compiled-app验收，后续040通知清理仍属新切片。恢复重放最新journal后亦失效旧衍生内容，不把旧镜像假称已支持。

Current deletion/journal replay invalidates site-derived AI answers/evidence/suggestions/exports while retaining accounting. These hooks are not part of fifth272/19 or sixth pre-deletefix289/20; they are included in fa3 seventh-stage compiled-app acceptance. Subsequent040 notification cleanup remains a separate worktree slice. Historical derivatives must also be invalidated after latest-journal replay.

百度普通站长搜索分析公开读取API截至2026-10-10未证实，官方产品说明可读不等于API可用。2015关键词下载说明没有当前CSV样本；通用自定义模板+列映射不可宣称原生百度兼容。搜索资源URL提交、百度统计PV/UV搜索词和自然搜索展现/排名是不同数据，不能互相冒充。详见[官方搜索分析](https://ziyuan.baidu.com/college/articleinfo?id=3415)、[2015下载说明](https://ziyuan.baidu.com/wiki/571)、[统计搜索词API](https://tongji.baidu.com/api/manual/Chapter1/source_searchword_a.html)。

Baidu public search-analysis read access remains unverified; available product documentation is not an API contract. No current native CSV sample is available. Custom import templates/column mapping cannot be described as native compatibility. URL submission, Tongji PV/UV search words and natural-search impressions/rank must remain separate sources.

## 032–034 开发切片：不要手动切换权威

032 新增 canonical manifest、event members和删除epoch；033新增规范事件时间贡献/SQL精确去重事实；034新增 replay chunk keys，保存标识、序号、hash和记录时间边界，PG不存canonical rrweb正文。这些是forward migrations，不是许可手动把 authority 改为 clickhouse 的操作指令。早期快照当时 CANONICAL_ACTIVATION_READY=false；当前guard已true，普通默认PG与逐站受控切换各按真实配置。

在隔离专项里选择canonical后，CH正文、manifest、checksum与PG删除状态共同决定可读事件，CH不可用返回503而非回空PG。独立canonical备份/恢复模块已测，但尚未纳入安装器和完整应用恢复；既有history-cli恢复仍为隔离副本，不激活canonical。新的工具和迁移不能替代PG全库备份、文件/版本key备份及独立最新journal。

混合身份的一批回放必须按rrweb记录时间判定删除，不能只按wire ts删整个chunk；索引重叠清理不等于CH物理擦除。混合身份记录的不可变替换、旧body物理ACK、故障回滚/孤儿恢复及独立journal恢复已由C4真实PG/CH三项专项验证；尚未纳入新的不可变全量与原生rrweb canonical浏览器验收。30天物理回放保留已有下述工作树定向实现，仍待下一不可变完整验收，该历史专项阶段activation/replay guard保持关闭；当前3e052d8核心激活已启用，索引隐藏不等于物理擦除。若曾在开发版本写入非规范键序hash，只能从已核验权威body重算，不能盲目更新hash忽略完整性失败。30天回放物理保留已有下述工作树定向闭环，不用只清PG索引冒充完成，也不提前声称全量已交付。

治理读取先取得session partition共享与site共享锁，等DDL/删除完成后才固定RR快照，随后转事务锁并释放session锁；持client期间不借同pool。默认应用已注册标准[MCP只读入口](mcp.md)，独立官方SDK4项通过。新AI trace/chart与删除派生hooks已接入当前路径，删除后清整站答案/证据/建议并撤销相关导出，保留预算账本；恢复重放latest journal后亦须失效旧衍生信息。AI派生hooks与默认MCP入口已纳fa3第七分阶段compiled-app验收；033/034/035/037及新通知保护仍按下一工作树切片判定，镜像边界以主验收记录为准。

新增035 durable AI reservation账本仅保存费用保留/结算状态，无模型正文或visitor FK；删除AI派生内容不能删除该账本而重置费用。站点facts导出排除该内部操作状态（ai_reservations，原因quota-ledger-operational-state），不改变已有ai_budget数字事实策略；PG整库backup自然包含账本。该新增切片的定向与下一完整阶段结果单列，不假定旧镜像已有035。

## 后续037：最新回放保留授权（工作树预览）

回放按rrweb记录时间执行min(站点保留,30天)物理TTL。037任务在partition/site锁前独立持久提交单调cutoff；延长保留不能恢复已授权过期的内容。canonical混合chunk不可变替换并确认旧body删除，可选PG权威历史归档也逐记录保新，不删整namespace唯一新记录；失败可靠重试，不能先清索引。该运行期账本不等于个人删除journal。

证明version2、scope=canonical-and-history-replay，稳定v1实例key签名完整范围/sourceScope/时间，默认有效10分钟；v1、不完整、错误来源、旧证明和签名不匹配均拒绝。范围包含activeCH、published历史raw与已有037授权站点，最多5000；backup index.retentionSites须匹配。源capture先调度提交再RR捕获，私有证明文件fsync。目标在正文发布前同client GREATEST合并；发布后在同一未提交事务清除过期正文与历史rrweb，才可commit。成功标记前源still-current不再调度，只复核最新范围/cutoff与journal，变化就拒绝，不修改源CH。

完整PG备份带账本，但旧dump不能替代独立最新源证明。site-facts导出不重放该操作状态；新任务不放宽旧tombstone或个人删除日志。当前真实PG/CH定向验证已覆盖策略7→90、mixed保新、ACK后回滚重试和旧metadata恢复；native CLI已实际执行dump、独立PG/CH恢复、最新cutoff物理裁剪及源推进拒绝，最新native CLI进一步覆盖非空standard036 carry（schema含041，原生fixture的041行为空）、latest journal删除A保留B。daily非空包有定向通过证据；完整daily activation/restore、严格PG metadata、完整Docker以及canonical激活仍待对应新阶段证据。不要绕过guard或把以上预览当作旧镜像操作承诺。详见[治理验收](ACCEPTANCE_CANONICAL_GOVERNANCE.md)。

### 预览：已发布事实正文迁出与strict门禁

以下是当前工作树CLI的实际参数契约，**必须满足逐站切换证明**；不可变main3e052d8核心activation guard已true，逐站证明、删除、水位检查仍强制。使用前须核对同版本源码与最新联合验收，保持入口关闭、完整PG/application files/keys备份和独立最新删除journal。环境变量已在本地安全配置文件设置；命令不打印或内联数据库口令。

```sh
npx tsx scripts/canonical-cli.ts status "$BAIZE_SITE_ID"
npx tsx scripts/canonical-cli.ts migrate-facts "$BAIZE_SITE_ID"
npx tsx scripts/canonical-cli.ts strict "$BAIZE_SITE_ID" "$BAIZE_FACT_PACKAGE_DIR" "$BAIZE_LATEST_JOURNAL_DIR"
```

`status`只读；`migrate-facts`写入043 headers、044 effects/vitals、047 session/numeric/member/carry及048有限兼容缓存的原producer-sealed正文与完成receipt，返回pruned=false/strict=false，不自行清除PG正文或激活canonical。两项写操作要求同site干净generation、无存活worker租约；迁出不替换整周期。`strict`额外要求真实签名fact package、当前源scope/元数据闭包、独立最新journal及密钥版本全部通过loadVerifiedFactBackup，再按生产guard允许情况清正文。布尔verified对象、旧包、missing body、未知版本、陈旧epoch或不完整kind/zero marker不能代替证明；guard关闭时不能绕过。

048缓存每bucket body上限8MiB、batch≤100/12MiB，超限失败关闭，不是无限规模导出。standalone history恢复含048时保留原owner UUID/producer seal，目标原run UUID冲突必须拒绝；热图base覆盖按source→target committed batch精确映射，不能清覆盖后双计。全部sidecars恢复后还须在目标入口开放前重放最新journal并真实重建，无法重建的唯一历史明确不可用，不能假零。当前模块/定向原生验收与完整同源CLI/Docker/生产开放分别记录，见[治理验收](ACCEPTANCE_CANONICAL_GOVERNANCE.md)。

### 历史隐私拓扑的迁移边界

pre-014 等旧版本未经受控入口产生的 daily-salt 明细，可能缺少可验证的每日身份拓扑。迁移不能从旧访客字段、页面 ID 或自报时间制造 038 lineage / 041 producer proof；未知拓扑不得进入需要这些证明的 canonical/carry 历史迁移。保留安全的旧报表与导出可继续使用，不代表所有旧 PostgreSQL 站点停用。实际隐私升级专项验证旧安全 report/export 不含身份别名，并验证当前原生 collector 仍可正常采集。

缺少可信来源、留存已到期或历史重建不完整时返回明确不可用或 coverage<1；不把历史零行当真实零流量，也不以新入口正常运行证明旧历史完整。不可变3e052d8同源100单元+391集成与22 E2E（20真实Chromium+2日期函数）通过，全新Compose清理EXIT0，核心guard已true；定向工作树测试与已交付 main 验收须分开。独立严格恢复最后缓存控制行/签名正文readiness已于16:26:59实际3文件3PASS闭合。


当前不可变本地证据：[main-3e052d8-local-final.json](test-evidence/main-3e052d8-local-final.json)。这不代表外网部署或托管CI。1000事件严格CH完整性通过，但查询p95 9.41秒、水位滞后p95 63.71秒，不满足性能SLO。5000负载和新应用镜像矩阵尚待；所有历史失败保留。

### raw-prune 的签名备份门槛（7fbb561已联合验收）

管理员 HTTP `POST /api/v1/sites/:siteId/canonical` 的 `{action:"prune"}` 明确返回409 `canonical_backup_required`；HTTP不接受服务器路径、备份JSON或verified布尔值作为授权。删除PG raw仅走操作CLI，并使用已有实例稳定master key验证真实 `backupCanonical` 签名包、精确当前独立删除journal、站点/scope/epoch/current generation与每条原正文hash。旧备份或journal推进后必须重新取得匹配证明；校验失败不prune。

在已有私密操作环境中确认站点ID、成功备份目录及最新journal目录后执行（占位变量只指现有本地路径，不内联凭据）：

```bash
npx tsx scripts/canonical-cli.ts status "$BAIZE_SITE_ID"
npx tsx scripts/canonical-cli.ts prune "$BAIZE_SITE_ID" "$BAIZE_RAW_BACKUP_DIR" "$BAIZE_LATEST_JOURNAL_DIR"
```

`BAIZE_RAW_BACKUP_DIR`必须是单站raw包目录，不是整库dump或facts包。现有 `scripts/backup.sh` 成功输出的布局为备份目录下 `canonical/<SITE_ID>`；应核对该站实际存在完整签名raw产物后再选取。单站目录实际含 `manifest.json`、`events.ndjson`、`published.ndjson`。`scripts/canonical-ops-runtime.ts` 直接输出为指定目录下 `<SITE_ID>`；shell整体布局为 `backups/<name>/canonical/<SITE_ID>`。备份流程只为实际CH权威canonical站点生成该raw包，不能为无产物站点构造空目录假证据。journal应取当前独立可信来源，不用旧快照内副本。PG shadow尚不是可prune站点。CLI也可使用 `node --import tsx scripts/canonical-cli.ts prune` 同一参数；master key从现有 `KEYS_DIR` 的v1文件或 `MASTER_KEY_FILE` 读取，来自已有私密实例配置，不创建新凭据、不打印密钥。此门槛纳入7fbb561的494应用测试联合验收，不修改3e052d8历史491计数。

冻结补记：ac86cd3浏览器30检查（28真实Chromium+2日期）实际PASS/0skip，96.441秒、EXIT0；其191/404完整后端全轮未复验，不叠加旧19计数。当前4384后续预算切片尚未全量通过；B真实3项仅证明服务器行为，200 exception风险仍待C适配，不能称adapter已验。aea2ece日期标记4单元PASS、浏览器未跑。预算口径为SELECT次数/decoded bytes/deadline，不承诺scan或heap限制。原FAIL全部保留。

1c最终固定负载：1000 PASS、最终HTTP5120ms；5000总体FAIL：4900accepted、2unsent、39delayed、queryfail0，drainReached=false且120秒deadline，剩余积压1350/最大3250。最终查询25.389秒FAIL、assertionsExecuted=[]，不得声称六完整性断言已过。Node峰730509312字节不含数据库，source unchanged且4项cleanup全true；没有预算拒绝。已通过代码功能/浏览器/镜像不等于关闭此本地性能欠项，不据此称提速/SLO。归档证据为 docs/test-evidence/main-1c1cb65-independent-strict-5000.json 及配套record；原FAIL保留。

0a0c171包含三批候选及idlefatal修复。第四轮实际19/19 PASS（11budget+4server+3triple+1strictrestore）、0skip/0uncaught，另10单元/type/lint通过；这是提交前源码摘要绑定定向证明，不是新全局计数。原前三轮FAIL及bd完整EXIT1全部保留。0a新完整空库、镜像和固定负载正在准备，不预写通过；旧c890632、1c30/image、1c1000PASS/5000FAIL各按原源码阶段保留，不外推0a。

## 历史前次状态入口（原记录保留）

## 当前验收入口（66150be，唯一当前）

最新本地主干d67bb8a已保存，正常Git push权限当前不可用，不创建token。只在同run effects/vitals均为complete CH时省identity TEMP写，混源保持原路径；type/lint、新2+旧18=20受影响真实集成及217单元PASS/0skip。20是部分集成，不与旧426累加；217首次215PASS/2旧mockFAIL保留，随后仅修形状不降断言。d67新whole/image/load等待串行验收，最新已过完整全轮仍是661641+30；不推断提速。原镜像ENOSPC FAIL及精确自有旧cache清理/targethealthy EXIT0仅诊断恢复，native未跑，不称镜像生命周期通过。
d67整轮实际EXIT1/cleanup：645后端（217单元+428集成）ALL PASS；浏览器29PASS/1FAIL，protected share只读提示未找到、实际HTTP503“统计快照已改变请重试”，D正在诊断竞态，不称全passed。新完整镜像/负载待。父已核远端e441；local e441..d67 Gitbundle及tracked-source tar保存在/workspace/baize-checkpoints，bundleverify0且排runtime，不创建新凭据。

正式全轮215单元+426真实集成=641PASS，30E2E（28真实Chromium+2日期）PASS，EXIT0/cleanup。固定1000PASS、finalHTTP5.047623651秒；固定5000整体FAIL：4350accepted/13unsent/35delayed、drainfalse120秒；已接受4350最终PV4350/coverage1/CH且六完整性断言PASS21.102973929秒，不是5000或SLO验收通过。

新镜像实际EXIT1：CH target233/ENOSPC创建preprocessed_configs；build/install/manifest/budget/55DDL/licensing/seed已过，native阶段未开始，targetcleanup完成，F归档证据。不推测底层原因。本地01e2c5d已保存，不预称远端确认；托管不触发。历史验收段以SHA标记；下方API/安装操作手册仍描述当前契约。预算不保证scan/heap或性能收益。
