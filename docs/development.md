# 开发

## 本地环境

使用 Node 24 与仓库锁文件安装依赖：

```sh
npm ci
npm run db:migrate
npm run build
npm run dev
```

先配置独立 PostgreSQL 17 的 DATABASE_URL，以及 DATA_DIR、KEYS_DIR 和 MASTER_KEY_FILE。Redis 7 可选；配置 REDIS_URL 后使用共享限流与缓存，未配置时采用有界单机降级。密钥文件权限为 0600，数据与密钥放在源码和公开目录之外。新 checkout 需要先构建前端，否则服务返回 build_required。

build 输出 dist/web、public/tracker*.js、dist/server 和独立更新执行器。编译后的服务入口为 node dist/server/src/server/main.js；源码 npm start 与维护脚本需要 tsx。部署包的依赖裁剪由[运行镜像构建](runtime-artifact.md)处理。

## 检查与测试

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:integration
npm run test:e2e
```

集成测试需配置 TEST_DATABASE_URL，浏览器测试需安装 Playwright Chromium 并准备对应应用。使用独立数据库、schema、Redis namespace 和数据目录，不把夹具写入业务实例。涉及安装、升级或恢复时运行 bash scripts/ops-lifecycle-test.sh。测试命令与依赖以 package.json 和相应测试配置为准。

严格 ClickHouse 存储浏览器测试使用独立 PostgreSQL 与 ClickHouse，并从相同源码构建页面：

```sh
E2E_STRICT_FACTS=1 \
TEST_DATABASE_URL="$ISOLATED_TEST_DATABASE_URL" \
CLICKHOUSE_TEST_URL="$ISOLATED_CLICKHOUSE_URL" \
npx playwright test --config playwright.strict.config.ts
```

该测试要求应用实际支持受控 canonical 激活；不要通过修改数据库标志绕过守卫。缺少显式开关或真实数据库地址会拒绝运行。记录 strict-storage.spec.ts 的实际结果；普通套件中跳过的严格用例不能算作通过。破坏与删除检查只允许作用于测试创建的随机站点及独立存储空间。

## 模块与数据约束

主应用采用 AGPL-3.0-only；packages/tracker 独立采用 MIT。sdk/miniprogram.ts 导出 createMiniProgramTracker，使用注入的请求 transport 和安全 UUID 生成器。要求同意的站点在授权前不生成身份、不缓存事件；重试保留 event_id。WordPress 插件保护管理配置并排除管理员访问。

默认 PostgreSQL 权威、可选 ClickHouse 副本与受控 ClickHouse 权威迁移具有不同恢复要求。按[迁移手册](migration.md)处理模式切换，保持事务、独立删除日志、来源认证和覆盖率语义。统计规则见[统计口径](analytics-correctness.md)，Lite 约束见[Lite 实现](lite-implementation.md)。

参阅[API](api.md)、[隐私](en/privacy.md)、[兼容性](compatibility.md)和[许可证](licenses/README.md)。
