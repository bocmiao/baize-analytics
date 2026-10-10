# 严格正文路径浏览器验收运行条件

本页只描述实际验收入口，不授权开启生产保护。现有 readiness=false 源码不能被算作严格路径验收；最终 guard 启用须等待独立恢复及身份目标证据，并由集成负责人修改。历史本地通过是当前 main+WIP 不可变副本的唯一 readiness false→true 变体，不是主分支已发布证明。

## 单专项

在完整、已冻结源码副本根目录运行。该目录的 `dist/web/index.html` 与 assets 必须先由该副本构建；Fastify 在创建实例时根据进程当前目录检查文件，不能复用另一个工作区的旧前端。基础 PostgreSQL URL 不加 search_path/options；测试自行创建随机 schema，连接池 max=1，迁移全部当前文件。ClickHouse 使用现有本地专用测试用户，不创建生产凭证。

```sh
npx vite build
E2E_STRICT_FACTS=1 \
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev \
CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
npx playwright test --config playwright.strict.config.ts
```

专用配置缺少 `E2E_STRICT_FACTS=1` 或真实数据库地址会直接失败，不静默 skip。用例额外断言实际源码 readiness=true；不会改写 authority/body_mode 以绕过真实 public activate、正文闭包迁移、四类签名备份和私有 opaque 核验证明。此配置仅一个 Chromium worker/一个用例，不依赖原 `/api/setup` 全局夹具或已有 3000 服务。

## 全浏览器联合验收

沿用 `playwright.config.ts`、原生本地应用和真实初始化 globalSetup；实例数据库必须全新、已迁移，原页面构建来自同一冻结源码。集成负责人保留已授权的数据库/Redis/服务启动方式，并设置：

```sh
E2E_STRICT_FACTS=1 \
E2E_BASE_URL=http://127.0.0.1:3293 \
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/isolated_acceptance_database \
CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
npx playwright test --config playwright.config.ts
```

3293 与数据库名只是集成负责人的隔离实例示例，不替代实际启动。全套中的严格用例独立创建 schema/port/site、自己的真实管理员 cookie。最终报告必须列出 `strict-storage.spec.ts` 为 passed、零 hidden skip；不能只用整套 exit0 证明严格用例执行。无 `E2E_STRICT_FACTS=1` 的旧普通浏览器执行会明确跳过这个变体，不计入严格验收数。

## 必须保留的证据和判定

保留冻结源码 SHA256 清单、源码变体差异（若仍用预启用隔离副本）、Vite输出、Playwright完整结果和失败trace。检查真实采集202→真实worker→PG八类派生正文持久行数0→coverage1/PV2/UV1→本次query source ClickHouse→真实浏览器显示2。

随后仅物理删除测试站点的已发布 CH 派生正文，真实接口必须精确503 `aggregate_members_unavailable`；固定英文提示可访问，旧指标与来源说明清空，不能显示0或旧成功结果。该破坏仅针对随机测试站点，结束清理测试body/schema，不影响其他站点。错误期间中文切换后仍有可访问错误状态；用户内容不翻译。

本入口不运行 Docker、公开部署、CNB同步或外部付费/生产账号，也不证明设备/读屏、压力SLO或所有查询均使用CH。
