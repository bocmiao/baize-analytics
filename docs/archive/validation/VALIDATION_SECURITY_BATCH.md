# 安全、外部与运维批次验收

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

基线957431ba；日期2026-10-11 UTC。父确认旧CNB cnb-42m-1k4kk3b3u成功：247单元、442集成通过/1 Docker能力跳过、31浏览器目录通过。旧托管结果不外推本批。本任务未触发任何CNB同步/流水线或GitHub Actions。

## 已完成的确定修复

- 六个实例管理路由复用Cookie-only真实管理员守卫，包括keys rotate、SSO GET/PUT、GeoIP GET/PUT/refresh；Authorization即使与Cookie并用也拒绝，site Token的issuer is_admin不授予实例管理权限。全局管理请求限流亦先执行同一守卫。
- setup/login/invite账户密码共用12–1024字符/4096 UTF-8字节规则，保留既有257–1024字符账户。越界邀请注册不消耗邀请。
- 统计/站点管理按真实用户跨站共用600/60s预算；公共分享/embed可信IP HMAC共用120/60s；429带Retry-After。Redis故障/超时503且不重置预算，未配Redis才有界单进程内存，不信任XFF。分享scrypt32改异步，旧格式/短密码兼容，输入有界。
- 站点创建、配置、write-key轮换与audit_logs同一事务及同一持锁client；故障回滚旧hash/config/generation，恢复一操作一审计。
- GSC/旧GA4 adapter对畸形200、分页行类型/数量失败关闭，保留已有明细与窗口；模拟异常不能冒称真实Google联调。
- 非1000安装UID的升级回滚proof按实际numeric UID/GID写入0600；run.bat先切脚本目录。运行时回滚结果在最终记录单列，Windows执行器仍阻塞，静态不算原生验收。

## a834589历史专项结果

| 阶段 | 结果 | 证据 |
|---|---|---|
| 原957431隔离授权复现 | EXIT1；read site Token令临时keys rotate返回200/version2，403断言失败 | security-batch-admin-baseline-fail.json |
| a834589全部单元 | EXIT0，264通过，0fail/skip | security-batch-unit.json |
| a834589的12文件专项 | EXIT0，67通过=25unit+42真实PG/Redis集成，0fail/skip，16.69s | security-batch-targeted.json |
| 初轮分享夹具 | EXIT1，48通过1失败；夹具未处理ZodError，非生产createApp | security-batch-share-fixture-fail.json |
| 初轮guard顺序 | EXIT1，6通过1失败；limiter先ctx.user返回401，修为管理guard先行 | security-batch-guard-order-fail.json |
| Redis teardown竞态 | EXIT1，67断言通过但suite失败；显式disconnect后quit竞态，修清理状态 | security-batch-redis-teardown-fail.json |

专项命令使用明确TEST_DATABASE_URL与REDIS_URL指向本任务本地测试服务，不接生产。每个实际应用测试使用独立schema/keyDir并清理。授权测试真实setup/login/invite/API Token，无权限stub；测试密钥仅在临时目录。站点审计触发器故障注入无真实站点变更。Redis两实例原子窗口/恢复/隔离/伪XFF/断连，7单元含容量/超时拒绝。

a834589生产manifest SHA256：920671bf6aaa63e84192f5ad584d899d5daa6f1c3a93d520d45deac2c590b24c。该历史专项不代表后来05360be的空库全轮/浏览器/镜像验收，最终同源结果见下文。

## 保留欠项

strict5000仍FAIL；本批无已证实下一窄性能优化，不降低旧044认证/逐批receipt/HMAC/删除屏障。会话闭包与贡献重用属于更大契约改动，见PERFORMANCE_CURRENT_BATCH_REVIEW.md，未实施，不标外部阻塞。真实Google/付费SERP/MaxMind/SMTP/SSO/模型账号、Windows执行器、小程序真机、跨物理机灾备/读屏仍准确未测。Ollama下载403属于网络阻断。

## a834589完整回归与兼容补修（旧失败保留）

同源完整浏览器先跑实际EXIT0：31通过/0skip，2.1分钟，证据路径/tmp/baize-browser-final.UD2NsO；随后原生空库全轮EXIT1：264单元通过，452集成中451通过/1失败/0skip。失败bot-collector Redis故障夹具在正常建站之前已断Redis，管理API按新契约503，采集断言未执行；修为同一Redis真实连接先建站后断连，管理API503断言保留，采集fallback断言不降低。compiled E2E阶段未进入，不把先跑浏览器当全轮EXIT0。

父复审新增本批兼容回归：旧share创建密码无字符上限，仅1MiB整HTTP正文，新checkPassword的1024上限锁死旧长密码。修订维持新创建1024字符/4096字节，旧salt:hex32验证最多1MiB UTF8，仍受原HTTP/gzip1MiB，不截断；有效且未撤销未过期分享查到后异步scrypt。全进程4任务无队列，满额503/share_password_busy/Retry-After1秒，finally释放。旧1025/8192ASCII、实际HTTP/embed、新建拒绝、绝对超字节不派生回归追加；结果与新SHA待最终保存。

第一个调整Redis夹具的专项实际EXIT1（34通过1失败）：enableOfflineQueue=false时ping早于连接ready；改显式lazyConnect/connect，不改产品策略。旧JSON保留。

兼容补修实际专项：4文件35项通过/0skip（含2真实collector Redis正常/断连、23治理PG、10单元），独立真实createApp/HTTP旧长密码测试1项通过/0skip，全部单元265通过/0skip。首个独立HTTP fixture误断言embed包含站点名称，既有embed契约仅热门页面标题；修为验证真实HTML标题/类型及错误密码404，不改产品页面。其失败JSON保留。scrypt四在途/第五busy/结束后释放由确定性单元验证；未用计时或睡眠制造HTTP占槽，最终HTTP忙态header为固定共享错误handler分支。

## 最终不可变源码05360be（2026-10-11 UTC）

实际命令入口为仓库 `scripts/validate-local-final.sh`，在 `git archive 05360be137a66e3863605393602b87db3f6782be` 的独立目录运行。空库正式全轮EXIT0：65文件265单元；166文件454真实PG17/CH25.8/Redis7集成；31浏览器目录检查=29真实Chromium+2日期函数，全部0fail/0skip。lint、type、SDK、journal、build及编译应用入口通过。集成strict身份独立恢复此次实际执行，不能外推此前CNB的Docker能力跳过。

生产manifest为 `55f47171539d96df6a64e32c900e4d57179a261caffb42e1d911b07fa0e3a642`，401文件/56迁移；完整结果在 `test-evidence/security-batch-05360be-full-*.json` 和source-binding。新镜像 `sha256:4d5c1084b7fe04aef7311b323c46590de7fe5dc30fd2d29d25c6636c9195365e` 与同源manifest一致，安装、独立目标CH签名恢复EXIT0：最新journal删A保B、源不变、缺sidecar/篡改/worker失败/未知未来schema/已有目标覆盖均拒绝，失败后实际修复恢复通过。该独立目标仍在同一物理执行器，不算跨物理机灾备。证据为image-result/image-native-result/image-binding JSON。

非1000UID试验初次在容器启动前失败：宿主UID1000的chown至2000返回EINVAL。仅测试runner改用自有Docker命名卷传入同一合成测试key，0600及UID/GID2000不变，不放宽生产权限、不改安装器；其最终结果另列。所有测试卷仅清理本批自有项目，原三个dev服务保留。旧失败完整保留；没有新5000负载、没有任何托管CI或真实外部账号操作。

非默认UID2000实际故障回滚EXIT1：数据库已恢复，但文件helper在读取宿主解包bind目录`/restore-data`时EACCES，应用未恢复；已清理自有栈，失败记录`security-batch-05360be-custom-user-fail.json`保留。053的默认UID镜像/独立恢复EXIT0不能冒称此场景已通过；需要窄修后新源码重验。

## 文件恢复窄修e991f4c

实际非默认UID失败后仅改`ops-restore-volume`脚本及新增独立helper/3项Node回归，src/db/packages与05360be逐字节一致。新源码`e991f4c3aad96398a34d080a8bb6ecbf6d1de1a1`新镜像安装及独立签名恢复EXIT0，manifest`416b68607411cfb0f8a246a06c52102e14967dd60ba31ea087ce2b37ea3c88d4`/403文件/56迁移，镜像`5e14b5a3807b26853664eb9290ff5ed26f20ccc9fdba071692d4fc64e51ead57`。完整265/454/31仍引用05360be同应用树，不称新SHA重跑；新增文件回归3项不累计成268单元。源码/新镜像/独立恢复证据见`security-batch-e991f4c-*`。

最终非默认UID运行：固定e991f4c、同源镜像sha256:5e14b5a3807b26853664eb9290ff5ed26f20ccc9fdba071692d4fc64e51ead57，隔离PG/Redis/CH和合成key，实际app2000:2000。仓库 `scripts/ops-upgrade-custom-user-test.sh` 注入9999已提交schema变更+HTTP503，真实数据库/文件/应用回滚EXIT0；恢复重算verified、schema探针消失、health200、proof UID/GID2000/mode0600/可读。source-image和source-after diff均空。证据`test-evidence/security-batch-e991f4c-custom-user-result.json`。自有卷/容器清理，原dev服务保留，剩余约6.9GiB。此为同物理机本地验收，Windows原生与跨物理机未测不变。

## 父CNB清理失败后的测试窄修

父最终2d05e7ca托管实际EXIT1（453集成passed/1Docker能力skip、1afterAll套件错误，浏览器未运行）已保留。仅测试2753b5a修stale-ready→QUIT竞态，2确定性单元与2真实PG/Redis集成在宿主2轮/现有Compose runner3轮各4PASS0skip；不改生产、不重跑完整应用或镜像。见[定向验收](VALIDATION_REDIS_TEARDOWN_FIX.md)，新托管尚待父统一运行。
