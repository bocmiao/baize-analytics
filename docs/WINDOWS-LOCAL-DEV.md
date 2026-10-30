# Windows 本地开发

Lite 版（SQLite、零外部依赖）可以在 Windows 上直接本地运行，官方部署路径仍是 Docker（Linux）。

## 本地运行

```bash
npm install
npm run dev:lite          # tsx watch src/lite/main.ts
```

## Windows 兼容说明

Lite 运行时包含三处平台适配（`src/lite/app.ts`、`src/lite/store.ts`、
`src/lite/ops-domain.ts`、`src/lite/backup.ts`、`src/lite/optional-insights.ts`、
`src/shared/install-guard.ts`）：

1. **目录 fsync**：POSIX 独有；Windows 上跳过（文件 fsync 仍执行）。
2. **权限位校验**：`mode & 0o077` 在 Windows 恒不为零，视为通过。符号链接、
   硬链接计数等其余校验保持不变。
3. **单写者锁**：`flock(1)` 不可用，回退为 `data/writer.lock` 独占创建的锁文件：
   - 锁内容记录持有者 PID；启动撞锁时探测 PID，进程已死则自动回收（陈旧恢复），
     进程存活则拒绝启动（`LITE_WRITER_ALREADY_RUNNING`）。
   - PID 复用碰撞会保守拒绝——此时手动删除 `writer.lock` 即可，方向安全。
   - 优雅关闭（进程内 `close()`）必定删除锁文件；强杀进程则靠陈旧恢复兜底。

已知边界：`O_NOFOLLOW`、备份/导出的部分 POSIX 语义在 Windows 上是尽力而为；
生产环境请使用 Docker 部署（Linux），Windows 仅作为本地开发。

## 本地验收工具

```bash
npx tsx scripts/ui-preview.ts .baize-preview/shots   # 全页面明暗截图（见 scripts/ui-preview.README.md）
node scripts/audit-css-classes.mjs                   # 组件 className 与样式表覆盖审计
```

## 本地 e2e（Lite）

```bash
# 终端 1：起一个全新实例（脚本含安装凭证 fixture）
npx tsx scripts/e2e-serve.ts           # 全新实例 + 安装凭证 fixture，或自行 createLiteApp
# 终端 2
E2E_PROFILE=lite npx playwright test --config playwright.config.ts
```

global-setup 会走真实的安装向导（创建管理员与示例站点）并缓存会话。
standard profile 的 e2e 需要 PostgreSQL，见 README。

## Standard profile 的 e2e：请在 Linux/Docker 上跑

Standard 版 e2e 需要 PostgreSQL（`TEST_DATABASE_URL`）。中文 Windows 上有一个
系统性的陷阱：initdb 的 post-bootstrap 阶段会以服务器编码 UTF8 校验从进程
环境继承的字符串，而 Windows ANSI 代码页（简体中文为 GBK/CP936）会把环境里
的 CJK 路径（例如包含「项目」的仓库路径，字节 0xCF 0xEE）写成非法 UTF8 序
列，直接 `FATAL: invalid byte sequence`。已验证无效的绕法：`--locale=C
--encoding=UTF8`、ASCII 数据目录与 CWD、剥离 PWD、清洗全部非 ASCII 环境
变量（GBK 字节在 Node 的 `process.env` 视角下与 UTF-8 中文无法区分，且部分
值由系统注入）。结论：standard e2e 与依赖它的 relational 天粒度开发请在
Linux 容器或 Linux 主机上完成。
