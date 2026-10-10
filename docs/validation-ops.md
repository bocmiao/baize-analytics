# 运维实际验证记录

本记录只描述已执行的检查，不把设计或模拟测试写成生产验收。

| 检查 | 状态 | 证据 |
|---|---|---|
| Docker daemon | 通过 | 本地 unix socket info 返回 28.4.0 |
| Node24 容器镜像 | 通过 | docker pull node:24-bookworm-slim，sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 |
| Compose 配置 | 通过 | POSTGRES_PASSWORD 占位值 docker compose config --quiet |
| Bash 脚本语法 | 通过 | bash -n install.sh upgrade.sh scripts/*.sh |
| SDK 严格类型 | 通过 | tsc --noEmit --strict，miniprogram/ClickHouse/ops-sdk-test |
| SDK 本地执行 | 通过 | consent 不创建标识、失败重试同事件 ID、boolean、参数化查询、关闭 replica 拒绝请求 |
| 完整镜像构建/安装 | 待执行 | 等待应用、lockfile 与 build 产物完成 |
| 真实 PG 备份、新库恢复、升级失败回滚 | 待执行 | scripts/ops-lifecycle-test.sh 已提供，未通过前不称完成 |
| WordPress PHP语法 | 通过 | PHP8.3-cli 容器 php -l 无语法错误；真实 WordPress runtime 未实测 |
| ClickHouse25.8真实适配器 | 通过 | 本地隔离容器：create/export/重复event去重/类型参数查询/同步删除；首次 ISO 时间写入400已修复 best_effort 并重跑通过。完整可靠双写迁移仍未完成 |
| Windows run.bat | 未运行 | 当前环境为 Linux |
| CI hosted runner | 未运行 | 提供 workflow，不代表远程 CI 已通过 |

禁止使用 mock 宣称真实外部账号已验收。无外部公开部署、无镜像 push、无其他仓库操作。
