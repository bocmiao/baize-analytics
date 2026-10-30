# 开发

当前 cloud task 本身隔离，使用现有 checkout，不默认创建 Git worktree。Node 24，npm lockfile 冻结安装 `npm ci`。设置 DATABASE_URL、REDIS_URL、DATA_DIR 与 MASTER_KEY_FILE 后执行 `npm run db:migrate`、`npm run build`、`npm run dev`（新 checkout 必须先构建前端，否则返回 build_required）。`npm run build` 输出 dist/web、public/tracker*.js、dist/server；本地 Docker 默认只绑定 loopback。

验证顺序：`npm run lint`、`npm run typecheck`、`npm run test:unit`、`npm run test:integration`（真实 PG）、`npm run test:e2e`（Playwright）、`npm run build`。运维验证 `bash scripts/ops-lifecycle-test.sh`。测试必须使用独立数据库与 Redis namespace，不向业务数据写 fixture。

Windows 本地开发（Lite 直接运行、锁语义、UI 验收工具）：[docs/WINDOWS-LOCAL-DEV.md](WINDOWS-LOCAL-DEV.md)。

主目录主体 AGPL-3.0-only；packages/tracker 独立 MIT。sdk/miniprogram.ts 统一导出独立 MIT tracker 包的请求 transport 注入 TypeScript SDK（createMiniProgramTracker），要求同意时在授权前不生成身份、不缓存。失败重试保留 event_id；请注入符合运行环境的 UUID 生成器。plugins/wordpress/baize.php 提供后台受权限保护的地址/站点/同意配置，管理员自身浏览不采集。

存储模式须分开理解：默认 PostgreSQL 权威；可选 ClickHouse mirror；经显式迁移和激活后可使用严格 ClickHouse 权威，不能把该模式称为可丢弃副本。默认架构不变。历史 adapter 验收不能替代当前主应用验收，模式切换按迁移手册进行。

编译生产入口为 `node dist/server/src/server/main.js`，需要 Node 24、独立 PostgreSQL 17/Redis 7、DATABASE_URL、REDIS_URL、DATA_DIR、KEYS_DIR、MASTER_KEY_FILE（0600）和持久化目录；服务守护由运营者配置。`npm start` 仍用 tsx；维护命令也依赖 tsx，因此不要直接删除 devDependencies。
