# 开发

当前 cloud task 本身隔离，使用现有 checkout，不默认创建 Git worktree。Node 24，npm lockfile 冻结安装 `npm ci`。设置 DATABASE_URL、REDIS_URL、DATA_DIR 与 MASTER_KEY_FILE 后执行 `npm run db:migrate`、`npm run dev`。`npm run build` 输出 dist/web、public/tracker*.js、dist/server；本地 Docker 默认只绑定 loopback。

验证顺序：`npm run lint`、`npm run typecheck`、`npm run test:unit`、`npm run test:integration`（真实 PG）、`npm run test:e2e`（Playwright）、`npm run build`。运维验证 `bash scripts/ops-lifecycle-test.sh`。测试必须使用独立数据库与 Redis namespace，不向业务数据写 fixture。

主目录主体 AGPL-3.0-only；packages/tracker 独立 MIT。sdk/miniprogram.ts 统一导出独立 MIT tracker 包的请求 transport 注入 TypeScript SDK（createMiniProgramTracker），要求同意时在授权前不生成身份、不缓存。失败重试保留 event_id；请注入符合运行环境的 UUID 生成器。plugins/wordpress/baize.php 提供后台受权限保护的地址/站点/同意配置，管理员自身浏览不采集。

sdk/clickhouse.ts 是显式启用的 replica adapter：ReplacingMergeTree 以 site/event 去重，查询 FINAL 使用类型参数，删除等待 mutation 完成。当前 PostgreSQL仍是权威库；该适配器不能单独视为可靠双写/在线迁移完成。生产启用前必须完成 outbox、删除日志联动、水位/故障恢复和端到端故障恢复验证。适配器已在隔离 ClickHouse25.8 容器验证 schema、写入、重复去重、参数查询、同步删除；这不等于主应用迁移完成。
