# Lite → 标准版离线迁移

这是显式导入工具，不是连接串兼容模式。原 Lite 服务必须停止；CLI 取得同一实例 flock，并保持 source freeze 到导入结束。不切流量，不删除原 Lite 数据。先保留已验证备份及独立密钥包。

```bash
LITE_DATA_DIR=/absolute/lite-data LITE_KEYS_DIR=/absolute/lite-keys \
  node dist/server/scripts/lite-ops.js backup /absolute/verified-backup

LITE_DATA_DIR=/absolute/lite-data LITE_KEYS_DIR=/absolute/lite-keys \
LITE_MIGRATION_TARGET_URL="$EXPLICIT_EMPTY_TARGET_URL" \
  node dist/server/scripts/lite-migrate.js /absolute/verified-backup \
  baize_lite_import_example /absolute/new-standard-data /absolute/new-standard-keys
```

目标 PostgreSQL URL必须显式指定，不能回退到默认数据库。schema必须为不存在的 `baize_lite_import_` 前缀名称；两目标目录必须不存在、互不包含且无符号链接祖先。工具先复用签名快照恢复校验（签名、精确文件/密钥 inventory、校验和、SQLite完整性、删除日志延伸及当前数据库日志一致性），再核对快照与冻结源的领域内容完全一致。源有新增采集或修改则拒绝旧快照，重新备份后重试。不会裸复制 live SQLite 数据文件。

保留账号密码hash、站点salt与配置、成员权限、目标、事件ID/页面ID/整数毫秒、规范化正文与维度、收据wire hash、收入订单与别名收据、访客墓碑。密钥包中的v1密钥原样保存，标准版 `master.key` 使用同一材料；不生成新身份密钥。标准删除日志转换后独立写入和校验。目标导入单事务；错误回滚，并清理仅本次创建的专用schema和目录。

登录会话作废，需要重新登录。派生聚合不复用，目标worker需重算后核验；报告 `aggregationPending` 为true。导出任务与附件不迁移，报告明确 `exportsNotMigrated`/`exportsRequireRecreation`，在目标重新申请导出。原导出仍保留在源及签名备份。后台任务不跨引擎搬迁。

首版无法无损表达以下领域，明确拒绝：已退休历史桶或持久retention cutoff/会话前缀未知状态、identify或user身份正文、用户级墓碑、replay/heatmap。不会把Lite未知统计迁入标准后伪称精确；不会放宽删除检查。缺失正文的收据也拒绝。正常活跃窗口的聚合桶仅是可重算派生数据，不阻断迁移。

完成报告在新数据目录 `lite-migration.json`，含签名manifest SHA256、数量、目标schema及未自动切流量标记；不包含连接URL、盐或密钥。部署标准应用时显式使用该schema的search_path、上述数据/密钥目录；原始数据库默认schema不受影响。先核验健康、worker完成、统计/重复ACK/删除拒绝后，管理员自行切流量。保留原Lite停止状态及备份可回退；未提供PG→Lite产品迁移。

迁移回归入口为 tests/server/lite-migration.test.ts，使用独立 SQLite 文件和 PostgreSQL schema。

## 配置与隐私转换

仅复制双方已支持的公有配置字段（来源别名、同意要求、vitals、IP排除、会话超时、渠道/AI来源规则以及关闭状态的replay/heatmap/experiments）；Lite内置 `config.tags` 移入标准版 `sites.tags`。所有 `lite_*` 内部字段、手动AI密文与用量/版本记录均不导入标准公有config。报告明确手动AI需在标准版重新配置，不会把旧密文作为可公开设置。其余未知config字段不激活。

标准版当前站点响应会公开config，故首版迁移遇到 `write_key_hash` 明确拒绝 `LITE_MIGRATION_UNSUPPORTED_PRIVATE_WRITE_KEY`；不能静默取消旧采集鉴权或复制到公有响应。需先提供受支持的私有存储/迁移方案再迁移此类源。master/salt、事件wire hash及访客删除日志保持原材料和含义；上述公有配置过滤不改变它们。

源码开发环境已安装开发依赖时，可使用 `node --import tsx scripts/lite-migrate.ts ...`；已构建Lite镜像必须使用上述 `dist/server/scripts/lite-migrate.js` 编译入口，不要求镜像保留src或tsx。

## 安装凭据与恢复终态

`install-nonce.json` 是首次管理员初始化的本机一次性凭据，不是数据恢复密钥。Lite及标准备份在读取归档内容之前排除此文件；恢复不会复制、回显或重新签发旧nonce。包含此文件的旧密钥归档明确拒绝，不能将其当作新安装凭据使用。

已知Lite v1签名快照先作只读schema/校验和验证，原快照保持不变；仅新恢复目标迁到v2。新目标密钥目录先耐久写入 `install-recovery-block.json`，恢复事务将 `install_bootstrap` 设为 `restored_blocked` 并清空nonce hash。已有管理员仍可正常登录；无管理员的旧preowner快照保持初始化关闭，不能自动变成新安装或重开注册。删除users或再次载入旧数据库也不能移除独立恢复标记。

Lite→标准导入不携带nonce，目标数据库初始化状态为closed legacy，目标独立恢复标记仍阻止重开；不会创建任何新的管理员、session或凭据。标准新目标恢复与原数据库回滚同样持久阻断初始化，已有用户登录不受影响；原master/versioned keys和原nonce文件不擅自删除，旧nonce hash失效即不可再用于claim。

恢复后的认证边界：标准恢复/原数据库回滚清空旧登录session、OAuth/SSO挑战，撤销API token和分享链接，并使旧邀请过期；Lite恢复目标清空session。正常用户用恢复保留的账号密码重新登录，管理员需要重新签发API/分享/邀请。原source实例的session和privatekeys不因此修改。账号、密码、成员权限来自备份快照；此策略不声称自动重放备份后所有账号/密码/成员变更，切流量前仍需管理员核对授权。
