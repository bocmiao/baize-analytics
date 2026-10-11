# 安全、外部与运维批次验收

基线957431ba；日期2026-10-11 UTC。父确认旧CNB cnb-42m-1k4kk3b3u成功：247单元、442集成通过/1 Docker能力跳过、31浏览器目录通过。旧托管结果不外推本批。本任务未触发任何CNB同步/流水线或GitHub Actions。

## 已完成的确定修复

- 六个实例管理路由复用Cookie-only真实管理员守卫，包括keys rotate、SSO GET/PUT、GeoIP GET/PUT/refresh；Authorization即使与Cookie并用也拒绝，site Token的issuer is_admin不授予实例管理权限。全局管理请求限流亦先执行同一守卫。
- setup/login/invite账户密码共用12–1024字符/4096 UTF-8字节规则，保留既有257–1024字符账户。越界邀请注册不消耗邀请。
- 统计/站点管理按真实用户跨站共用600/60s预算；公共分享/embed可信IP HMAC共用120/60s；429带Retry-After。Redis故障/超时503且不重置预算，未配Redis才有界单进程内存，不信任XFF。分享scrypt32改异步，旧格式/短密码兼容，输入有界。
- 站点创建、配置、write-key轮换与audit_logs同一事务及同一持锁client；故障回滚旧hash/config/generation，恢复一操作一审计。
- GSC/旧GA4 adapter对畸形200、分页行类型/数量失败关闭，保留已有明细与窗口；模拟异常不能冒称真实Google联调。
- 非1000安装UID的升级回滚proof按实际numeric UID/GID写入0600；run.bat先切脚本目录。运行时回滚待最终镜像阶段，Windows执行器仍阻塞，静态不算原生验收。

## 实际已运行结果

| 阶段 | 结果 | 证据 |
|---|---|---|
| 原957431隔离授权复现 | EXIT1；read site Token令临时keys rotate返回200/version2，403断言失败 | security-batch-admin-baseline-fail.json |
| 当前全部单元 | EXIT0，264通过，0fail/skip | security-batch-unit.json |
| 当前12文件专项 | EXIT0，67通过=25unit+42真实PG/Redis集成，0fail/skip，16.69s | security-batch-targeted.json |
| 初轮分享夹具 | EXIT1，48通过1失败；夹具未处理ZodError，非生产createApp | security-batch-share-fixture-fail.json |
| 初轮guard顺序 | EXIT1，6通过1失败；limiter先ctx.user返回401，修为管理guard先行 | security-batch-guard-order-fail.json |
| Redis teardown竞态 | EXIT1，67断言通过但suite失败；显式disconnect后quit竞态，修清理状态 | security-batch-redis-teardown-fail.json |

专项命令使用明确TEST_DATABASE_URL与REDIS_URL指向本任务本地测试服务，不接生产。每个实际应用测试使用独立schema/keyDir并清理。授权测试真实setup/login/invite/API Token，无权限stub；测试密钥仅在临时目录。站点审计触发器故障注入无真实站点变更。Redis两实例原子窗口/恢复/隔离/伪XFF/断连，7单元含容量/超时拒绝。

生产manifest SHA256：920671bf6aaa63e84192f5ad584d899d5daa6f1c3a93d520d45deac2c590b24c。源清单与精确commit在冻结后补记；当前专项不代表新源码空库全轮/浏览器/镜像已经验收。

## 保留欠项

strict5000仍FAIL；本批无已证实下一窄性能优化，不降低旧044认证/逐批receipt/HMAC/删除屏障。会话闭包与贡献重用属于更大契约改动，见PERFORMANCE_CURRENT_BATCH_REVIEW.md，未实施，不标外部阻塞。真实Google/付费SERP/MaxMind/SMTP/SSO/模型账号、Windows执行器、小程序真机、跨物理机灾备/读屏仍准确未测。Ollama下载403属于网络阻断。
