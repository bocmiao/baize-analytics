# 白泽固定源码最终验收记录

软件源码为 `7509481a366b9ec1d0c3dc42ab31dc08d0792986`，基于用户指定的 `e5aff3b9411bb0eb4505bd2bd7d03060aab4bbfe`。仅修正 ZIP/HTTP 许可证断言，使其逐字验证构建器已经采用的空白归一化完整 MIT 声明；独立 LICENSE 文件仍按原始字节验证。业务源码未改变。发行包的软件/镜像revision仍为上述750；离线安装文档纠正revision为 `a683944148d0d6bbd5607c7eb8962e6374789e8e`，见各包内 `DOCUMENTATION_OVERLAY.json`。软件修正已正常 fast-forward 推 main，推前 fetch，未 force、未 PR、未触发 Actions/CNB、未操作生产服务器。后续验收文档提交不是软件镜像重新构建声明。

## 实际测试与边界

lint、全仓类型检查、本地生产编译通过；修正文件再次 ESLint、实际 HTTP 许可证专项通过。完整业务批次已执行完：1155 项，1151 通过、3 失败、1 跳过。原批次状态保持原样，不因补测改写成单次全绿。该批次使用真实独立 PostgreSQL、Redis、固定 digest ClickHouse，开启 `E2E_STRICT_FACTS=1`，canonical readiness 源码本来为 true，没有通过修改 guard 或伪造 authority 跳过严格模式。

`external.test.ts` 原批次三项 30 秒超时；单文件复测 10/10 通过，文件耗时 11.63 秒。原生 PG 客户端 case 在主批次因未设置 `NATIVE_TEST_DATABASE_URL` 跳过；补充设置该变量并实际使用从 PostgreSQL 17.11 镜像取得的匹配客户端，6/6 通过，包含备份/新目标恢复、失败升级、回滚和源数据保护。不能将重复覆盖累计成新增案例。全部实际失败/跳过名称见 [results.json](validation/final-7509481/results.json)。

标准浏览器默认首轮 47/48（严格 CH 来源用例实际通过），手机切回总览时 5 秒内未读完；默认专项复测仍失败，表现为比较期间尚未完成。30 秒断言等待专项 1/1 通过，只用于诊断。失败 trace 的实际 stats 成功响应约 1.07–2.88 秒，当前 PV511/覆盖1/30点及比较 PV120/覆盖1/30点均有真实 HTTP200；快速导航产生的取消请求另外记录，不能算错误响应或零耗时。两轮同时存在其他回归/打包活动，共享环境 CPU cgroup 实际为 4 CPU；这说明有并发工作，不能单凭同时发生断言根因。全部构建/打包/回归结束后的默认5秒窗口隔离复测1/1通过。该轮主数据stats请求375.6–845.0ms，中位557.7ms；手机最后当前请求375.6ms、比较请求833.9ms，PV分别511和120、覆盖1、各30点，无HTTP错误。没有独立SQL逐语句计时，不能把网络响应耗时当纯数据库查询时间。此单次隔离通过不掩盖此前真实加载等待，也不构成生产SLO；未通过增加默认超时隐藏产品问题，未修改业务/UI源码。详细实际共享cgroup样本、请求计时和最终数据见 results.json 及网络证据。Lite 浏览器5/5通过，包含真实采集、重投、事件目标、导出、保留边界和移动端。

## 镜像和原生包

两版完整 Dockerfile 都在新环境执行 `npm ci --strict-ssl=true`、完整 build 和正式 runtime stage 成功；没有以旧镜像 overlay 冒充。Docker 内代理 hostname 起初 DNS `EAI_AGAIN`；给构建加入当前环境实际代理地址映射后，npm ping 实测成功并重建。没有关闭 TLS 校验或写入凭据。Docker 使用vfs。原验收收尾约8GiB余量；本次重新封包和按文档实装的临时增长曾降至约3GiB，随后暂停写入，把838,038,218B校验解压副本和1,158,104,939B旧版保全产物逐文件核对哈希、模式、链接后迁至独立`/tmp/baize-acceptance-preserved`，保留完整可恢复副本，工作区恢复约5GiB余量。未prune、未丢失旧数据。完整迁移文件清单本地保留，路径和哈希见[迁移记录](validation/final-7509481/recoverable-relocation-summary.json)。

- 标准本地内容 image ID：`sha256:c0abeeded626b5d9392e8a2ac2f71592b260d158e30a2ca653b6a63e31f01db8`。
- Lite 本地内容 image ID：`sha256:7782b58652f20a06efd2c85826127445fc69223ea32b23fe55ac50150430e248`。
- 共同官方 Node base digest：`sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`。

上述是本地镜像内容 ID/基镜像 registry digest；应用未推 registry，没有应用 registry RepoDigest 声明。两版镜像各自实际独立容器健康启动，确认标准最高 schema编号61（迁移记录62条）、Lite user_version2。四个原生包各自从 tar 解压、严格清单校验，再真实独立启动/安装/采集1事件/重投去重/统计PV1/备份/新目标恢复/恢复后启动登录及统计PV1，均通过；源密钥保持、发布目录内数据与重叠数据/密钥路径拒绝均通过。打包器9项、runtime staging2项通过。bundled-node包内实际Node为24.21.0；Node-ready包实际使用宿主Node24.19.0启动，SQLite分别为3.53.4和3.53.3，readelf测得最低GLIBC2.28；这不等于所有GLIBC2.28主机均实测。

新构建 `dist` 文件584个，加独立 `public` 构建资产14个，合计598件物理交付文件；这两个路径集合在标准镜像、独立本地 build 和四个包逐文件同字节；标准镜像保留的 src/scripts344个文件（含264个.ts、37个.tsx）全部与冻结Git一致。旧环境598文件没有复用或冒认同源；旧交接下载阻塞，无法在本机比对旧完整目录。当前采集器源码SHA256=`987f121cf75cbbb5a8c9d7523a705170f88a72a26e263ff398a9a4f165cab41f`、实际编译模块SHA256=`bc31aea4fc43bbd72320f03904ed09360eb7dd9600008809e928691d57a6664f`，与资源报告候选记录逐字相同。完整列表见 [image-source-witness-standard.json](validation/final-7509481/image-source-witness-standard.json)。

两个 Docker save 文件已 gzip/manifest校验并在本测试 daemon 成功重新 load，随后各镜像独立容器启动。标准离线文件含app+PG17+Redis7，不含可选ClickHouse；Lite只含应用镜像。最后审查曾发现旧方法指南只接受`baize-validation:*`而本次实际tag为`baize-accept:*`，已修为精确tag、不可变image ID及软件SHA三重核对，没有扩大成任意镜像白名单。没有宣称新的物理离线机器验收。两版 Docker 安装 ZIP包含完整冻结源码和 install入口；原安装器会构建镜像，离线save需要独立加载并按部署文档启动已加载镜像，不是新增跳过build安装功能。源码ZIP、两安装ZIP及四原生包均已重新封入纠正文档，7件bytes/SHA更新、旧版保全；两个save和三个分发ZIP未改变。两版从实际随包脚本（只替换交付目录、隔离project名和本机端口）完整load→私有配置/空卷初始化→no-build/pull-never启动→复制nonce→实际创建管理员/站点→采集1事件/重投去重/统计PV1通过，确认schema61/2；旧tag、错profile、其他版本tag均拒绝。详见[实际安装证据](validation/final-7509481/documented-offline-install-results.json)和[包覆盖层核对](validation/final-7509481/documentation-overlay-package-checks.json)。软件功能测试未重跑；四包未变的598编译/公共资产字节与既测镜像相同，当前四包严格清单与原compiled生产preflight均通过。

## 普通用户文档和截图

四包README和原有其余说明维持软件750的Git身份；离线安装方法指南以显式文档覆盖层来自a683944，原/新SHA与软件SHA分别记录，不伪称整包都未派生。包内桌面1440×1447和手机390×2346 PNG与Git原始字节相同。运行文档31个本地链接均存在；24个固定源码链接对应的Git对象均存在，在线访问仍需私有仓库权限。源码/安装ZIP的截图均已在压缩包内实际核对。所有新源码、安装及分发ZIP均不包含历史压缩包；排除旧`docs/ui-prototypes/v2/baize-ui-prototypes-v2.zip`，没有递归打包工作区、数据库、私有运行环境文件、密钥或备份。

## 资源结论继承

没有无谓重跑容量实验。继承 [RESOURCE_VALIDATION.md](RESOURCE_VALIDATION.md) 的真实测量边界：旧1500事件正确性、100重投去重及SIGKILL恢复通过；候选共享额度固定ACK P95499.837ms改善约17.2%，峰值2092.262ms增加约33.5%，是混合结果。共享服务cgroup1CPU/1.8GB不含宿主OS/daemon/发送端，不能冒充整机1核2GB认证。旧严格CH5000测试未重跑、不能宣称通过；tracker gzip4998B是独立体积指标。当前完整包启动验证与这些旧容量测量分别记账。

## 复现入口

在冻结软件revision的干净源码目录，先 `npm ci`、`npm run lint`、`npm run typecheck`、`npm run build`。测试服务使用独立项目名：`docker compose -p baize_accept_review -f docker-compose.ci.yml up -d --wait`。按该文件端口设置合成夹具 `TEST_DATABASE_URL`、`CLICKHOUSE_TEST_URL`、`REDIS_URL`，设置测试PG容器的 `BAIZE_OPS_POSTGRES_CONTAINER`，随后 `npm test`。真实原生客户端专项另需 `NATIVE_TEST_DATABASE_URL` 和匹配的PG工具，不能把该条件skip当通过。

浏览器通过真实编译入口启动隔离数据/密钥/安装凭证目录，设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`、`E2E_BASE_URL` 和严格 `E2E_STRICT_FACTS=1` 后 `npm run test:e2e`；Lite另设 `E2E_PROFILE=lite`。不要把普通源码 npm start（tsx）与运行包派生的 compiled npm start混同。镜像按完整 Dockerfile/Dockerfile.lite构建并带完整revision/source标签，四包按 docs/release-packages.md的 `package-release.mjs` 生成和 `--verify` 校验；源码输出不递归收录本机运行数据或旧ZIP。本页复现是审阅说明，不要求用户现在操作生产服务器。

## 每件产物的实际身份

以下12件已在本机生成；**二进制目前仅本地保留，尚无用户可下载附件**。精确本地路径、归属revision和状态在 [DELIVERY_INDEX.json](validation/final-7509481/DELIVERY_INDEX.json)，SHA256清单在 [SHA256SUMS](validation/final-7509481/SHA256SUMS)。本地路径不是下载链接。

| 文件 | bytes | MiB（2²⁰ B） | SHA256 |
| --- | ---: | ---: | --- |
| `baize-lite-bundled-node-linux-x64-7509481.tar.gz` | 74,717,627 | 71.256282 | `2dfc0ba55959f9492ddc7ccd106f6cdc7726cbc2eea02e630ea06770ada898fb` |
| `baize-lite-docker-install-7509481.zip` | 30,455,084 | 29.044231 | `e613e85124a379602c207e6793232f15ad4a8a1eb458e7ebabe2097ea6685f7e` |
| `baize-lite-docker-offline-7509481.tar.gz` | 125,436,728 | 119.625786 | `b4c082e3c179b2d7c3234aa0bfb4031310b624cab689d9f617b81ac4d436976d` |
| `baize-lite-node-ready-linux-x64-7509481.tar.gz` | 30,036,242 | 28.644793 | `8871fe373a9b2ef766e42e80bf69f2a4dba0c1cc0d3f1d3b412bff029465e7c8` |
| `baize-source-7509481.zip` | 30,454,013 | 29.043210 | `58472cfaba35224bca53c4ee9fdd90c9fcf11704bff8bce1509d0fb5da42ddd3` |
| `baize-standard-bundled-node-linux-x64-7509481.tar.gz` | 84,321,660 | 80.415401 | `7bdd3fb4f400d6b5c36c18166ba9861f4e7c0a54820bff131dd9adc22a514492` |
| `baize-standard-docker-install-7509481.zip` | 30,455,085 | 29.044232 | `f96efb0e3aee529f98558884fdbb3c481036d7711fe590034648a3b89c37cbf6` |
| `baize-standard-docker-offline-7509481.tar.gz` | 297,011,351 | 283.252097 | `f73025dee09b94e83a66ef75dea8f93bc0cfbd7f3db4bd2f76c91805d3116cd3` |
| `baize-standard-node-ready-linux-x64-7509481.tar.gz` | 39,639,282 | 37.802965 | `097c36a8bba658b6c779cabd60400969237690cb0464691a7d5b8b1118f71013` |
| `baize-tracker-browser-7509481.zip` | 81,731 | 0.077945 | `e10950ff979bfa2bef3ad591d1e911054466e5403eb36d7acccf251430020987` |
| `baize-tracker-source-7509481.zip` | 22,833 | 0.021775 | `c05b4d2bc9f81f719690d7bfa5efcbf48e1010def0eb6556d0776e07168eabf2` |
| `baize-wordpress-7509481.zip` | 14,054 | 0.013403 | `1cd176c56235964e5d069d4513baee140bd4e393933f89e978523b3ce28fc926` |

本次只读Library连接检查成功，但按要求仅一次14件顺序保存的现有prepared helper仍失败于`hosted apps tools/list request failed: network`；prepare/finalize未开始，输出0B，没有新ID/版本/xattrs或未决写入，不盲重试。Library上传支持流程仍受工具目录网络阻塞；准备旧交接的控制动作成功，但三件输入的受支持消费端下载及一次明确本地目标重试全部失败，没有可读本地字节，旧ZIP哈希仅是发送方提供而非本机核验。没有猜URL或使用旧环境路径。GitHub已只读确认私有连接有admin/push权限、现有Release为空；CLI的API/Release访问Forbidden，连接工具没有Release创建/附件上传能力。没有创建Release、上传附件、新建凭据、抽取token或修改安全设置。源码和本页索引可通过私有仓库取用；大包等待可用投递通道，未写入main历史。详细阻塞见 [delivery-route-status.json](validation/final-7509481/delivery-route-status.json) 和 [old-handoff-materialization-status.json](validation/final-7509481/old-handoff-materialization-status.json)。

生产服务器、真实宝塔、Windows、macOS、ARM、Alpine、物理断电/磁盘故障，以及真实外部Google/SMTP/商业模型账号未验收，不宣称通过。暂无需要用户夜间操作的步骤；剩余需要决定的事项是恢复一个可用的二进制投递通道，并按已保留的并发加载等待和隔离通过证据评估目标部署的加载性能边界。
