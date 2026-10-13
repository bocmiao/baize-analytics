# 标准 / Lite 增量更新设计

当前已交付的六包仍为8e47a2e，不含本功能。本文与新增代码是后续版本；没有替换旧包/镜像的 revision。/workspace 当前约3.4GiB可用，/tmp独立约6.8GiB；2GiB最低保护保持。

## API 只读参考

依据父线程对 bocmiao/api 默认分支 `76b1c618fb003a76e5a169c2dd42e15df90c75d3` 的只读审计：src/lib/updater.js:396–488 用 GitHub recursive tree、本地 Git blob SHA1 比较，未变文件复制 staging，只下载变化文件；624–657 在变更>300文件、>60%或失败时全量fallback。后者不符合本用户要求，不沿用。src/routes/account.js 提供版本/更新/进度；public/app.js 的系统更新流程可参考。

该项目零npm依赖、无需构建；白泽比较实际封存运行产物，不能比较TS源码后直接替换运行目录。参考实现的备份只含代码，不含DB；进度/锁在内存、swap逐个顶层rename、pending在切换后写、launcher位于可更新src、仅存活20秒及前端版本检查，都不足以证明白泽的持久性与恢复。Docker参考写容器可写层，重建后回到镜像代码；本项目不采用此机制。API仓库未修改。

## 已实现的软件路径

标准PG-only与Lite原生（node-ready / bundled-node）：管理员在主机安装独立、固定入口的无root执行器，配置唯一release父目录、数据/密钥/私有env、固定发布源与Ed25519公钥、实例owner、监听地址及固定Node。Web只通过本机Unix socket调用检查、更新、回滚、读状态；没有shell文本、路径、URL或Docker socket参数。未配置执行器则界面如实显示未连接，不把命令复制算作在线升级。

签名覆盖目标完整运行清单、基础revision与manifest SHA256、变更说明、兼容声明、变化文件和显式删除文件/目录。基础受信manifest由本机操作者首次绑定。重新验实际安装文件、完整清单和签名；只请求固定origin下的清单及内容SHA256 blob，校验严格大小/哈希。变化文件传完整变化文件字节（文件级delta，不是字节补丁），依赖/Node变更会显著增大增量。未变文件从已验基础复制，目标构建为全新版本目录；没有整包URL，也没有任何失败全量fallback。

自动更新仅接受相同profile、variant、平台、Node主版本和持久schema fingerprint，数据库迁移声明必须为same-schema。新增/变更迁移、SQLite schema及未声明兼容一律拒绝自动执行，不实现猜测性的schema down迁移。标准严格CH权威/历史/外部sidecar模式沿现有维护入口前置拒绝，不能将PG-only备份当完整CH备份。

持久状态和独占实例锁位于release、用户数据、密钥之外。先验真/空间预检/下载并封存候选，再启用持久维护门闩、停止执行器自己监管的实例（排空HTTP/后台写入）、执行实际标准或Lite备份，最后记录switch intent并原子rename当前版本指针、fsync目录。新实例HTTP健康须吻合releaseId、清单SHA与本次启动标识，确认后才解除维护门闩。失败切回旧代码，不回滚数据库快照。更新成功后人工回滚也只切同schema旧代码，保持全部当前写入；备份是独立灾备点，不在代码回滚中偷偷恢复。

重启恢复根据持久intent、原子指针和签名验证恢复，未完成事务保持维护态直到受测版本健康。未知/损坏状态拒绝启动或更新。下载失败保留旧版本及明确失败状态；相同幂等请求返回原结果，失败重试仍走增量。Web端区分首次全局owner与站点owner/admin；API Token不允许更新实例。

Docker已有镜像布局：独立宿主辅助器固定Compose project/service和清单公钥。由带DNS/IP绑定的HTTPS传输下载缺失的内容寻址层，复用本地已验证层，在本机组装导入镜像并核对config ID/rootfs/OCI清单，固定服务以不可变image ID切换；没有Web Docker socket、任意shell/URL/project参数或容器可写层升级。镜像层增量不是文件级delta；本地组装的完整tar不是网络整包下载。源码/未配置部署明确显示未连接执行器。

严格要求Docker文件级delta时，提供`deploy/update-volume`的固定监督镜像+持久版本卷布局；它使用同一原生增量/监督核心，应用版本、状态、数据和密钥分别持久化，监督入口位于不可更新的镜像目录，不挂Docker socket。现有image-owned /app布局不能原地实现相同语义，需操作者选择并迁移布局；本次未给真实主机安装服务、改权或搬迁数据。该Dockerfile/Compose是软件部署模板，尚未实际构建此完整监督镜像，不能称该布局完整Docker应用验收通过。

## 验收与真实边界

使用本地固定origin受控HTTP fixture、独立签名测试密钥、真实标准PG与Lite应用执行旧→新；记录清单/变化blob实际HTTP字节、改变/未变文件、删除清单、持久状态、备份、健康、失败/断电恢复、回滚后写入保留、权限及SSRF/路径攻击。页面覆盖未配置、权限、检查/下载/维护/成功/失败与窄屏截图。发布源尚无真实Release；本地fixture验收不代表公开发行升级已验证。不会给真实服务器安装服务、提权、设置令牌或发布Release/CI/生产。
