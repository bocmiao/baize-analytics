# 白泽标准版与 Lite 部署包（2026-10-13）

代码冻结提交：`d8362d0ae6834bd500b119bfd73fbbc60010f421`。后续证据提交不改变这些包的代码来源。六个部署包如下；源码包、更新执行器包是附加材料，不占用这六个名额。

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| baize-standard-node-ready-linux-x64-d8362d0.tar.gz | 35409651 | `3214b8b98bb928daa48c14ef97b68c849885ef994277d717debb2ffbc8445571` |
| baize-standard-bundled-node-linux-x64-d8362d0.tar.gz | 80099346 | `dc430569a85cc97762e9aa5f374343e4e19a8d7314ab868637c3c0ed618e41c8` |
| baize-standard-docker-offline-d8362d0.tar.gz | 292093725 | `e2082e47b1f05814d5c3e54a63dbdaa3a4ac861045e8f9f1fe551151ac4a7bba` |
| baize-lite-node-ready-linux-x64-d8362d0.tar.gz | 30516049 | `eaaa6fe148ae41cec2dc0900d5df12e79f009f5a2103e02f41e2ea9511536268` |
| baize-lite-bundled-node-linux-x64-d8362d0.tar.gz | 75203067 | `5c15650a0341cf7e36fd9ac7fa2f7fb120954c9cf66098eeeca071aab12c1251` |
| baize-lite-docker-offline-d8362d0.tar.gz | 124958759 | `9ef092f5426031940705ba989552087c2f3b9eed5a7b80ab9d6b4a89f9916537` |

标准版 Docker 离线包包含应用/Node、PostgreSQL 17 与 Redis 7；不含 ClickHouse。Lite Docker 离线包只含应用及 Node 基础层，数据库为 SQLite。两种原生包分别要求宿主机 Node 24，或随包附带 Linux x64 Node；标准版仍需要外部 PostgreSQL，原生包不包含数据库服务。

先在包所在目录执行 `sha256sum -c SHA256SUMS`。离线 Docker 包使用 `gzip -dc <包名> | docker image load` 加载；对照 DELIVERY_INDEX.json 核对每个 tag 的完整 `docker image inspect --format '{{.Id}}' <tag>`。应用 tag 为 `baize-delivery-standard:d8362d0` 与 `baize-delivery-lite:d8362d0`。不要使用自动构建或拉取覆盖已核验镜像。

使用同一代码冻结提交的部署文件。标准版已有私有 .env 和 .baize/master.key 的实例，在 .env 明确设置 `BAIZE_IMAGE=baize-delivery-standard:d8362d0`；Lite 设置 `BAIZE_LITE_IMAGE=baize-delivery-lite:d8362d0`。按部署文档准备数据目录、权限和空卷后，分别执行 `docker compose -f docker-compose.yml up -d --no-build --pull never --wait` 或 `docker compose -f docker-compose.lite.yml up -d --no-build --pull never --wait`。不要运行会重新构建镜像的 install.sh。新实例须先按部署文档生成私有配置、密钥及目录；已有实例保留原配置、密钥与卷。更新页的增量更新须另行安装外置执行器，Web 不连接 Docker socket。

原生包解压后，按包内 docs/deployment-methods.md 和 scripts/release-start.sh 使用私有 env 文件启动。宿主机依赖、共享库和运行时校验见 release-manifest.json；SQLite 数据、PostgreSQL 数据、环境文件和密钥必须放在版本目录外。

严格增量更新只消费已配置受信源、签名和哈希，不接受任意 URL、路径或 shell，不静默回退全量。schema 不兼容时停止。代码回滚复用已有版本，不撤销升级后新写入；灾难恢复备份是独立操作。Docker schema 相容性目前依赖受信发布方生成并签署的 fingerprint，接收端不解析镜像内迁移文件，不能把此边界称为独立 schema 提取验收。
