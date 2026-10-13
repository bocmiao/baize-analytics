# 新环境完整构建交付：129d972（2026-10-13）

软件冻结 `129d972cde1ba8d3da97a130e3adf70f8673402d`；开始main为 `ffa37e45cfc6d288e292970a1c5413f582125803`，后续只新增本报告及小型证据。两版完整镜像、四原生包、两离线save已在本次新环境实际构建生成。旧任务/环境未访问，旧7509481与旧129d972归档哈希及证据索引未覆写，没有拿旧应用镜像改revision。

但完整交付仍有一个明确未解决项：**没有成功的用户下载通道**。Library一次有序十文件请求在准备前network失败，无写入/未知写入、不循环；gh报告现有GH_TOKEN无效且没有Release上传工具，没有更改凭据/权限或私自公开文件。下面本地路径只表示新环境保留位置。新大包均未写入Git源码历史。

## 实测与构建

初始workspace可用32,034,242,560B（29.83GiB），Docker已运行，vfs，root `/var/lib/docker`。最后采样仍约12.42GiB；固定2,147,483,648B保护值未修改。旧额外6GiB规划不是保证，本次完整上下文、全新层、PG/Redis及测试容器会累计占用更多空间。记录是阶段采样，不宣称测得连续峰值。新工作区/仓库未找到AGENTS或本地.agents技能文件，已读冻结打包/维护文档。构建使用冻结完整Dockerfiles，没有业务改动、没有上下文精简或降低安全口径。

首个buildx配置目录只读导致构建前退出，失败log保留；将BUILDX_CONFIG设到本次工作目录后成功。标准与Lite顺序构建，使用proxy_ca secret与strict SSL。实际Node基底24.21.0，基础digest/层在build log中保留；没有使用旧应用镜像作基底。标准ID `sha256:857643f99ad924c86e4acbab313f3635a3d627c44cd66907684282ae546c8df1`，LiteID `sha256:af3e70ad04f6599ed45c115840b97ce1b0b5ee20a00974fcad20878bab33dd88`；两版source/revision label、Linux amd64及入口正确。完整image inspect单独保留。

## 六包身份

| 文件 | bytes | MiB | SHA256 |
| --- | ---: | ---: | --- |
| baize-lite-bundled-node-linux-x64-129d972.tar.gz | 74722987 | 71.261394 | `39d4f00aa9e2a9c2655c9895f0721e39aa034281401f93e765353c051c3e961f` |
| baize-lite-docker-offline-129d972.tar.gz | 125430910 | 119.620237 | `54cccedf92198f76909d8f8b7ef2693173462017c00dc4f76f706f611750d595` |
| baize-lite-node-ready-linux-x64-129d972.tar.gz | 30037788 | 28.646267 | `d55000c40fd4667995ea6173c9bbceb21aa876f233a8601954847f179dd5761d` |
| baize-standard-bundled-node-linux-x64-129d972.tar.gz | 84323463 | 80.417121 | `654b90b6556694d4b3bae7cca114f2d31b4a900121036b5796cdd4441089aef5` |
| baize-standard-docker-offline-129d972.tar.gz | 297023350 | 283.26354 | `042b69d634bb1976e5e3c3fcf118dabca9111f821c3dd4c129bb7d85ed92bafb` |
| baize-standard-node-ready-linux-x64-129d972.tar.gz | 39636861 | 37.800656 | `e990d5ac1e7ab6ec9cbb8b5d2b3b438c85e27bddd2835e783b82a30b3afd7982` |

全部位于新环境 `/workspace/baize-new-packages-129d972/`。每件发布器记录、save manifest/config SHA与标签见 [新索引](validation/new-build-129d972-20261013/DELIVERY_INDEX_NEW_129d972.json)。旧交付索引继续保留其当时blocked状态；新报告描述本次补齐，不能改写历史。

## 独立检查及实际回归

- 独立宿主生产编译成功。两版镜像各602个dist/public文件一致；标准检查全部1080个保留源/维护/compiled/db等文件，Lite检查664个compiled/public/db文件，零差异。四原生包各602文件与独立宿主编译一致。发布器校验原始package/lock/接口同源、图像标签与不可变ID、文档Git blob、封存清单、真实tar解压；依赖锁版本标准169、Lite166项。详见 [镜像同源](validation/new-build-129d972-20261013/image-source-witness.json) 和 [四包证据](validation/new-build-129d972-20261013/four-package-compiled-witness.json)。
- 四包分别用包内release-start.sh、0600外部环境启动，实际health、首次nonce认领、cookie认证、前端HTML通过；停止后各自release-ops.sh实际backup/新目标restore，owner=1，restored setup阻断、不切流量。标准真实PG17客户端，Lite真实SQLite。初轮测试参数缺MASTER_KEY_FILE、目标名不满足baize_restore_前缀的错误日志在新环境私有证据保留，修正fixture后成功结果单独记录，软件不改。
- 两离线save gzip检查、实际docker load成功。使用冻结Compose/空卷helper，全新隔离project，`up --no-build --pull never --wait`；两版health、nonce复制/认领、登录cookie成功。标准PG/Redis健康，LiteSQLite健康。仅停止本次测试服务，保留容器/卷/数据/密钥与失败现场；未动已有dev PG服务及旧环境。
- 新回归首轮27通过/1失败/1跳过（缺Git历史），补只读Git历史后28通过/0失败/1跳过；专门真实PG dump测试首轮4通过/1失败（fixture PG用户名baize不存在），使用新建baize测试PG后5通过/0失败/0跳过。两批有4项重叠，不相加。发布器干净checkout9/9通过；无Git的导出目录第一次publisher用例失败也保留。历史源全量1160、标准浏览器48、Lite5保留原批次，未算作新镜像全量回归。
- Node-ready实际宿主24.19.0/SQLite3.53.3；bundled-node实际24.21.0/SQLite3.53.4；glibc最低2.28。平台均Linux x64 glibc，不外推其他平台。

安装身份与本次新tag指导见 [新交付安装说明](validation/new-build-129d972-20261013/INSTALL_NEW_129d972.md)。冻结包内7509481旧离线指南保留历史身份，本次新说明补充129d972，不放松任意镜像身份白名单。

生产、真实宝塔、Windows/macOS/ARM/Alpine、物理断电/存储故障、整台1C2G长期容量及旧5000重跑未验证。未重测性能；标准500ms目标仍未通过，历史固定改善/峰值退化混合结论与最终DDL变体未测延迟边界不改写。未运行Actions/CNB、未开PR、无付费资源、无生产部署、无凭据权限变更。
