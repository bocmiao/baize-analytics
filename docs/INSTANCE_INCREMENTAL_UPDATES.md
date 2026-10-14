# 实例更新：文件增量、镜像层增量与恢复

更新中心位于“设置 → 系统更新”，标准 PG-only 和 Lite 共用流程。只有初始化时认领实例的全局拥有者可以操作；站点 owner/admin、其他 `is_admin` 账号及 API Token 均不能升级实例。旧安装若没有 claimed owner，需要主机操作者在私有执行器配置中明确绑定现存全局账号，不猜测第一个用户。

本功能属于本次新增源码，不在已交付的8e47a2e六包中。旧包、镜像及其revision没有修改。正式Release及其签名增量资产尚未发布；页面和下载/恢复验收使用本地受控fixture，不代表生产包只需26bytes或正式发行已验证。

## 权限与首次接入

执行器是独立固定入口，不在正在更新的应用版本目录内。Web只能经Unix socket提交status/check/apply/rollback以及UUID和已预览的revision/hash；不能传shell、URL、文件路径、Compose project或镜像参数，也不获得Docker socket。原生执行器拒绝root运行。签名发行代码不是沙箱：配置公钥意味着信任该发布者的代码，应由操作者独立核验指纹。

本次只实现软件和隔离测试，没有在真实服务器安装/启用服务、授予Docker权限、修改账号/令牌或切换生产。首次部署需要操作者准备独立服务账号、只属于该实例的版本/状态目录、已有私有runtime.env、可信基础清单SHA256、拥有者UUID、固定HTTPS源和公钥。私有源可设置operator-owned、0600的authorizationFile；仅发送到固定origin，Web不读回token。不要用本地测试公钥作为生产信任锚。

执行器软件由 `npm run build:updater` 生成，部署时将 `dist/updater`（包括LICENSE与THIRD_PARTY_NOTICES）复制到独立受信目录。原生入口：

```text
node /opt/baize-updater/baize-updater.mjs --config /etc/baize-updater/instance.json
```

服务应使用systemd等现有主机监管，整组停止（KillMode=control-group），并配置最小文件权限；本次没有执行这些主机安装动作。实例只有一个受监管应用进程；外部worker/直连写入者必须停止。维护门闩阻断新HTTP写入并暂停后台周期，排空/停止失败会拒绝继续。原生标准备份还拒绝源DB其他连接及CH镜像/权威/历史sidecar，不能将PG dump当作完整CH备份。

## 原生文件级增量

独立配置字段见 `src/update/agent.ts` 的严格schema。初始运行包的release-manifest.json SHA256由操作者从受信交付清单绑定；执行器复核每个实际文件、mode及内部链接。发布源只有latest.json和以SHA256命名的blobs，不存在整包fallback端点。

生产发布工具：

```text
node dist/server/scripts/publish-native-update.js --base BASE_SEALED_RELEASE --target TARGET_SEALED_RELEASE --output NEW_PRIVATE_OUTPUT --key-file OFFLINE_ED25519_KEY --key-id TRUSTED_KEY_ID --label VERSION_LABEL --notes-file NOTES_JSON
```

只发布变化内容，显式列出删除文件/目录；未变文件从已验基础复制至新版本目录。修改依赖、Node或大文件会增大传输量，不承诺每次很小。支持固定linux/amd64、相同standard/lite和node-ready/bundled-node，运行Node主版本必须24；Lite仍需满足项目实际SQLite门槛。基础revision/hash或预览目标变化时停止并说明，不静默下载全量或换版本。

schema声明必须same-schema，PG迁移及Lite持久schema指纹必须与基础相同。新增/改变schema一律拒绝自动更新；本功能不覆盖所有未来迁移，也不猜测down migration。界面展示预计总下载量（清单、签名、必要镜像配置及变化文件或缺失镜像层）和各项明细，小量以bytes/KiB显示。重新检查或重试会再次下载校验元数据；受控fixture变化26bytes的同时，完整签名清单约2.2MB。

## Docker原镜像布局：内容寻址层增量

宿主入口：

```text
node /opt/baize-updater/baize-docker-updater.mjs --docker-config /etc/baize-updater/docker-instance.json
```

配置固定project、app服务、私有env、Compose文件SHA256、DockerCLI路径、初始不可变image ID/清单digest、schema指纹、source、公钥和owner。Web容器只只读挂载专用socket目录，不挂载执行器私有状态/凭据目录或Docker socket。Compose privileged、host网络/PID、额外cap_add及根目录/Docker socket挂载被拒绝。

辅助器通过带DNS/IP绑定的HTTPS下载签名OCI描述和缺失层，校验压缩digest、精确size、解压后diffID、config ID、平台和release/profile/schema labels。已有层从本地Docker内容验证复用；本机组装的完整导入tar不等于网络整包下载。启动仅使用不可变image ID，--no-build --pull never，持久状态保存已确认镜像；不写容器/app可写层来升级。Docker层增量不是文件delta，没有可复用基础的生产目标拒绝自动执行。

Docker发布器 `python3 scripts/publish-image-update.py` 从两个明确的本地image ID生成签名元数据/blobs，要求publisher-bound io.baize.release-id/profile/schema-fingerprint labels。工具不push镜像或发布Release；旧8e镜像不能改标签冒充新版本。生产标准备份复用独立已pin hash的原PG-only维护脚本和现存私有配置，默认baize用户/DB；自定义部署需独立验证，不默认为兼容。Lite调用当前已验镜像的compiled lite-ops备份。宿主需要足够vfs/overlay空间，预检不能绕过。

## Docker严格文件delta的取舍

当前image-owned /app布局不能持久地替换少量源码后宣称镜像升级。`deploy/update-volume`给出另一条软件部署布局：固定监督镜像内的入口＋独立持久版本卷，使用相同原生文件增量核心，另有状态、数据、密钥卷，不挂Docker socket。操作员必须选择并准备首次迁移，保全旧数据/密钥；不能由Web偷偷改造旧容器布局。

本次没有构建/运行这个完整监督镜像，模板不称验收通过。Docker宿主层辅助器已在新隔离云环境运行真实白泽标准 PG-only 和 Lite SQLite 应用，完成签名层增量、真实备份、启动身份与数据库健康、代码回滚及升级前后写入保留；测试发布源为本地受控源，不代表正式发行或生产主机首次接入已验证。原生两profile的真实应用增量流程已有独立验收证据。标准Docker每次备份的密钥包按操作UUID独立保存，避免连续升级/回滚时同名目录冲突。

## 持久事务与回滚

独占锁、幂等UUID、请求指纹和持久状态独立于release/data/keys。先下载验真并封存候选，再开启维护、停止受监管实例、完成真实备份。switch intent先fsync保存，再原子更新版本指针并fsync目录。HTTP健康必须匹配revision、清单SHA256和本次启动ID，并证明DB ready；仅存活或semver相同不算成功。

只有相同数据库结构才自动执行。更新失败切回旧代码；成功后的回滚也继续使用当前数据库，**不恢复旧数据库快照覆盖更新后写入**。备份是独立灾备点。下载失败、超时、并发或未完成状态保留结果与旧版本；相同请求不会执行两次。重启对下载中、切换/健康中事务分别恢复基础版本/门闩；未知或损坏状态失败关闭。受控服务组SIGKILL测试不是物理断电、磁盘故障或跨机灾备证明。

## 正式签名分发流程（尚未执行）

1. 在独立受控构建环境冻结真实源码、依赖锁、运行时与schema；生成实际运行产物并验全部文件，不拿历史包改revision。
2. 对准确受信基础生成native或image delta，审核变化/删除/兼容与下载量；离线签名私钥留在发布侧，不进Git、Web或执行器。
3. 通过独立渠道核验公钥指纹、配置允许的key ID及撤销/轮换流程；不能从待验证下载站自行获取公钥后就信任。
4. 用户授权发布后，将签名清单及内容blobs放入固定可认证HTTPS源。未授权时不创建Release或公开私有资料。
5. 对真实目标环境另验首次接入、服务权限、备份、更新/重启/回滚。当前本地fixture证据不能代替这些正式发行与主机步骤。

## 本地验收记录

2026-10-13 新云环境真实 Docker 结果见 `docs/test-evidence/incremental-update-20261013/standard-docker.json` 与 `lite-docker.json`。两版实际完成增量下载、真实备份、版本/清单/启动身份与数据库健康、回滚及升级前后写入保留；标准版修复密钥包目录碰撞后连续回滚通过。`ui.json` 记录真实应用桌面和320px、确认框、键盘Tab、reduced-motion、无横向溢出与页面异常；截图位于 `docs/screenshots/incremental-update-20261013/`。测试镜像身份和签名仅供隔离验收，不能作为正式基础包或生产信任锚。

## 执行器失锁、容器策略和 schema 信任边界

独占锁失效或执行器正在关闭时，不继续切换、启动或解除维护；收尾会等待受监管进程/命令退出并保留门闩。仍活着的旧拥有者收尾期间，新执行器即使获得 flock 也拒绝重叠接管。操作者先停止旧执行器及任务，再由新的锁拥有者接续；不要删除拥有者记录或维护文件绕过检查。未知或停止失败的状态需要主机操作者确认，不由页面强制解锁。

Docker检查合并后的配置及实际容器：只允许默认node/1000身份、固定编译入口、专用只读执行器目录和数据/密钥目录，拒绝入口/命令覆盖、root身份、额外设备/能力、host命名空间和未知挂载（包括其他路径的Docker socket）。目前非默认UID需要单独适配验证。Docker daemon访问权限仍由宿主操作者控制；这些软件检查不将daemon账号降权为内核按项目隔离，也不赋予Web任何Docker socket权限。

Docker schema兼容判定以受信签名元数据和镜像labels的发布者声明为依据，未独立从镜像提取并计算实际迁移/schema文件指纹。发布者必须在构建/签名前验证声明与真实schema一致；错误声明仍是信任边界，不能把labels相同表述为对所有迁移的独立证明。原生文件delta另计算迁移文件与编译schema模块清单指纹。

Lite依照独立运行树prune开发依赖，不携带标准版所需tsx/esbuild维护工具；不会裁掉实际功能的运行依赖、签名或校验。六个部署交付类型为标准/Lite各一个离线Docker包（标准附PG17/Redis7）及各两个原生运行包；源码和独立执行器归档是额外附件，不替代离线Docker包。

备份和主服务分别使用启动标记，执行器保留自己创建的标记集合；失锁收尾只停止该集合内、固定项目/服务及受信镜像的容器，包括一次性备份容器，并等待停止确认。同项目其他标记的容器不停止。未成功认领的执行器关闭时不写维护文件、不停止现有服务。

正常维护停止也核对已认领 launch 集合及实际运行策略；备份会创建新 launch，旧主服务标记仍属于该集合。启动/恢复执行 Compose up 前检查已有主容器，遇到未认领标记先拒绝，不替换或停止外部容器。首次接管已运行的旧实例，必须由宿主操作者独立核对容器完整 64 位 ID、不可变镜像 ID、Compose pin 及执行策略，再在 0600 私有配置明确填写 initialContainerId；省略时不接管未认领容器。此授权只绑定该容器 ID，Web 无权设置；同项目其他未认领容器仍使启动拒绝。


最新验收与六包清单见 [2026-10-14 最终复核](validation/INCREMENTAL_UPDATE_CLOSURE_20261014.md)。当前包分发因 Library 工具网络失败尚未完成；代码、清单和真实截图从现有私库获取。不要以历史包或本地路径替代最终下载交付。
