# 可选 ClickHouse 运维边界

默认 `docker-compose.yml` 不运行ClickHouse。需要本机副本时，先在受限`.env`中设置独立`CLICKHOUSE_PASSWORD`，再显式运行：

```sh
docker compose -f docker-compose.yml -f docker-compose.clickhouse.yml --profile clickhouse up -d --wait
```

此profile使用25.8、独立`clickhouse_data`卷、不发布HTTP/native端口，应用只通过项目网络连接。配置存在不等于站点已切换：登录后为目标站点启用mirror，检查水位、epoch、覆盖率及源读提示，再明确启用prefer_clickhouse。PG始终权威，副本异常回退PG，不把当前方案标为“PG仅元数据”的完整迁移。不要把副本密码提交到Git或输出到日志。

`backup.sh`备份权威PG数据库、独立删除日志、水位、应用文件和单独密钥恢复包，不备份ClickHouse卷，因此不能称作canonical CH备份或CH集群灾难恢复。当前副本可由保留期内PG事件重建；PG原始事件已过期时，不能凭历史rollup还原详细CH快照。保留期/混合读取覆盖必须据真实状态展示，不能隐藏缺失数据。

优先恢复路径：独立新PG数据库/数据/密钥卷恢复→重放最新journal与物理导出清理→所有站点重算持久状态确认→目标存储模式postgres并清除旧上传/清理任务→检查对账→在不同ClickHouse endpoint重建mirror→验证后启用目标读取。默认新恢复禁止继承源CHendpoint；同endpoint换query参数不算独立namespace。源CH不应被新库恢复删除。

若运营者另行做原生CH卷快照或BACKUP，它只能是**副本快照**，需单独保存版本、schema、site/epoch/generation/watermark与PG恢复点关系。恢复这些快照后禁止直接发布旧pointer或对外提供查询；必须先以当前PG/journal做删除和保留期复核并重新发布epoch，缺少最新删除日志时失败关闭。该单机副本 profile 不提供多节点集群灾备。ClickHouse 权威存储使用[迁移手册](migration.md)中的独立恢复流程。

升级需要暂停非相关pull/build并准备磁盘余量，25.8 profile不是可自动跨版本滚动升级承诺。升级前使用独立环境验证应用、数据库和存储兼容性。

Pinned image: `clickhouse/clickhouse-server:25.8-alpine@sha256:87e0a5b72f5465b18eacca7c76850e7ff551c9795c50e451f5646299e5e24146`, matching the actual locally tested image and CI. This digest-only configuration update was validated without another pull or restart.
