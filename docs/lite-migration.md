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

真实合成验收使用独立SQLite文件与本地CI PostgreSQL专用schema；测试包含共享统计、重复ACK、删除旧投递拒绝、篡改签名、源变化、导入中约束失败回滚。测试文件 `tests/server/lite-migration.test.ts`，必须纳入vitest include或使用显式包含该文件的配置，不将skip当通过。

## 配置与隐私转换

仅复制双方已支持的公有配置字段（来源别名、同意要求、vitals、IP排除、会话超时、渠道/AI来源规则以及关闭状态的replay/heatmap/experiments）；Lite内置 `config.tags` 移入标准版 `sites.tags`。所有 `lite_*` 内部字段、手动AI密文与用量/版本记录均不导入标准公有config。报告明确手动AI需在标准版重新配置，不会把旧密文作为可公开设置。其余未知config字段不激活。

标准版当前站点响应会公开config，故首版迁移遇到 `write_key_hash` 明确拒绝 `LITE_MIGRATION_UNSUPPORTED_PRIVATE_WRITE_KEY`；不能静默取消旧采集鉴权或复制到公有响应。需先提供受支持的私有存储/迁移方案再迁移此类源。master/salt、事件wire hash及访客删除日志保持原材料和含义；上述公有配置过滤不改变它们。

源码开发环境已安装开发依赖时，可使用 `node --import tsx scripts/lite-migrate.ts ...`；已构建Lite镜像必须使用上述 `dist/server/scripts/lite-migrate.js` 编译入口，不要求镜像保留src或tsx。
