# 061 历史备份校验与跨平台测试

2026-11-10 的 Linux 全量单元测试暴露两项旧换行假设：054 的结构断言只接受 LF，061 的历史备份校验只钉住 LF 摘要，而本地工作区和 NAS 已应用的 061 文件使用 CRLF。

只读查询 NAS `schema_migrations`，061 的已应用摘要为：

```text
154a59ccfadcf7ad6ee33f7e3266311da489151be3b7f2c1dee5f1482c7a62d4
```

这个摘要与现有 CRLF 文件一致。直接改历史 SQL 换行会使正常迁移检查拒绝已运行的数据库，因此本次没有修改任何迁移 SQL 文件、`schema_migrations` 记录或 `db.migrate` 的原始字节校验。

`history-namespace-backup.ts` 的 061 guard 现在只接受以下两个固定摘要：

| 已发布的字节形式 | SHA-256 |
| --- | --- |
| LF | `10a04db900b846c422b9e0ce3eee6959bc5daa40687276da78b056c2a294944d` |
| CRLF | `154a59ccfadcf7ad6ee33f7e3266311da489151be3b7f2c1dee5f1482c7a62d4` |

它们来自相同 061 内容的两种完整换行形式。生产代码不读取任意 SQL 来动态放行，也不先归一化任意输入；其他摘要继续拒绝。未知迁移名称、062 摘要、后续事实版本和签名内容范围的检查保持原行为。这个修复同时避免历史备份误拒绝当前 NAS 的合法 061 schema。

054 只改结构测试：先统一测试字符串的 CRLF，再断言它仍然恰好是原来的两个非唯一索引，没有增加其他 DDL。生产执行的文件保持原字节。

针对回归：`history-bootstrap-schema`、`history-namespace-schema-compatibility`、`bot-visit-history-schema` 三文件 **13/13 通过**。新增用例执行真实备份 guard，分别验证 LF、CRLF 继续进入事实版本检查；混合换行、SQL 内容改动、额外字节及未知摘要都在读取历史数据前拒绝。没有修改历史 SQL 来让测试通过。

Linux 全量重测使用独立测试镜像，补齐 git/procps，读取真实旧版本的 Git 对象供旧 SQLite 升级测试，并设置私有目录 umask077。生产服务未用于执行测试后台。全量结果见主验收记录及 `.baize/nas/completion-unit-linux-final-20261110/`。

最终完整重跑结果：**135 文件 / 797 测试全部通过**，一次 Linux 运行耗时 60.02 秒。前后原三站保持 3444 events，event_id 摘要 d654099fa3abc67338ca9e703481faa7 一致。
