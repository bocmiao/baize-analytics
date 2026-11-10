# WordPress 插件

将本目录复制到 WordPress 的 `wp-content/plugins/baize/`，在「插件」页启用 **Baize Analytics**。然后打开「设置 → 白泽统计」，保存白泽实例地址与站点 ID。实例中该站点的域名必须匹配 WordPress 网站域名。

插件在匿名前台页面的页脚加载实例提供的真实 `tracker.js`。已登录的站点管理员不采集。停用插件后不注入脚本；重新启用保留之前设置。

「要求同意后采集」默认开启。插件提供同意门控，不自带同意横幅；已有 CMP/同意界面可调用：

```js
window.baize?.grantConsent();   // 用户同意后开始
window.baize?.revokeConsent();  // 用户撤回后停止并清除追踪身份
```

脚本载入前需要等待 `window.baize` 可用。关闭插件里的同意设置，仅在实例站点配置也没有强制同意时自动开始采集。站点管理员浏览页面时不会创建追踪身份。

## 开发测试

可复用运行器为仓库的 `scripts/wordpress-acceptance.ts`。它使用真实官方 WordPress/PHP/MariaDB、独立 PostgreSQL 测试库、真实 `createApp` 和 Chromium；不模拟插件钩子、页面、tracker 或采集响应。

测试需要 Docker、Chromium、Python 3，以及可创建独立测试库的 PostgreSQL 账号。先准备镜像，再运行：

```sh
docker pull mariadb:11.4
docker pull wordpress:6-php8.3-apache
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev \
./node_modules/.bin/tsx scripts/wordpress-acceptance.ts
```

结果默认保存在 `.baize/test-evidence/wordpress/wordpress-actual-runtime.json`，可通过 `BAIZE_WORDPRESS_EVIDENCE_DIR` 更改目录。运行器绑定 `127.0.0.1:3280`（WordPress）和 `127.0.0.1:3290`（白泽），端口可通过 `WORDPRESS_ACCEPTANCE_PORT` 与 `WORDPRESS_ACCEPTANCE_APP_PORT` 修改。WordPress 禁用外部 HTTP、自动更新和 cron。

运行器上传安装当前插件，检查启用、保存设置、停用、同意与撤回流程，并验证采集入库和聚合结果。退出时清理自身容器、网络、卷、测试数据库、临时密码与密钥文件。
