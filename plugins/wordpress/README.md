# WordPress 插件

将本目录复制到 WordPress 的 `wp-content/plugins/baize/`，在「插件」页启用 **Baize Analytics**。然后打开「设置 → 白泽统计」，保存白泽实例地址与站点 ID。实例中该站点的域名必须匹配 WordPress 网站域名。

插件在匿名前台页面的页脚加载实例提供的真实 `tracker.js`。已登录的站点管理员不采集。停用插件后不注入脚本；重新启用保留之前设置。

「要求同意后采集」默认开启。插件提供同意门控，不自带同意横幅；已有 CMP/同意界面可调用：

```js
window.baize?.grantConsent();   // 用户同意后开始
window.baize?.revokeConsent();  // 用户撤回后停止并清除追踪身份
```

脚本载入前需要等待 `window.baize` 可用。关闭插件里的同意设置，仅在实例站点配置也没有强制同意时自动开始采集。站点管理员浏览页面时不会创建追踪身份。

## 本地真实验收

可复用运行器为仓库的 `scripts/wordpress-acceptance.ts`。它使用真实官方 WordPress/PHP/MariaDB、独立 PostgreSQL 测试库、真实 `createApp` 和 Chromium；不模拟插件钩子、页面、tracker 或采集响应。

预先准备两个镜像并检查磁盘。Docker 使用 VFS 时层展开会远大于镜像显示大小，请顺序拉取并避免与其他构建同时进行：

```sh
docker pull mariadb:11.4
docker pull wordpress:6-php8.3-apache
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev \
./node_modules/.bin/tsx scripts/wordpress-acceptance.ts
```

运行器使用 Python 3 标准库生成临时 ZIP 包。PostgreSQL 测试账号需要创建和删除独立测试库的权限。镜像的实际 digest、PHP/WordPress 版本、逐项结果保存在 `docs/test-evidence/wordpress-actual-runtime.json`。运行器仅绑定 `127.0.0.1:3280`（WordPress）和 `127.0.0.1:3290`（白泽），端口可通过 `WORDPRESS_ACCEPTANCE_PORT` 与 `WORDPRESS_ACCEPTANCE_APP_PORT` 修改。WordPress 禁用外部 HTTP、自动更新和 cron；没有公网部署，也不需要生产账号或密钥。

运行器将当前插件打成临时 ZIP，在真实 WordPress UI 上传安装，再启用、保存设置、停用/重启。没有把宿主私有工作区的 0600 文件直接挂给 www-data，也没有修改宿主私有权限。匿名 Chromium 浏览器验证同意前不发送事件/不创建身份，同意后真实HTTP采集写入PG并由worker聚合，撤回后停止，关闭同意设置后自动采集。退出时清理自身容器、网络、卷、测试数据库、临时密码与密钥文件；不删除开发库或其他任务资源。
