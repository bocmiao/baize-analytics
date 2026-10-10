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
| 完整镜像构建/安装 | 通过 | 真正执行 install.sh、npm ci TLS验证、build、Compose app/PG/Redis 健康；首轮 Buildx只读目录及镜像文件权限问题修复后重跑 |
| 真实 PG 备份、新库恢复、升级失败回滚 | 通过 | scripts/ops-lifecycle-test.sh 退出0：实际管理员/站点/采集fixture→备份→备份后fsync删除→新库恢复0events+1tombstone→同镜像升级→失败回滚DB+卷+旧应用健康；日志 /tmp/baize-ops-lifecycle.log |
| 密钥备份分离 | 通过 | DB备份无 master.key，app-data归档排除keyring/*.key；密钥另存0700恢复包，DB只含指纹 |
| 已提交schema变更后失败健康回滚 | 通过 | 本地衍生镜像迁移新增column，信息模式查询实际观察count1；HTTP503触发回滚后脚本断言count0及原应用health200，生命周期退出0。日志 /tmp/baize-ops-lifecycle-schema.log |
| WordPress PHP语法 | 通过 | PHP8.3-cli 容器 php -l 无语法错误；真实 WordPress runtime 未实测 |
| ClickHouse25.8真实适配器 | 通过 | 本地隔离容器：create/export/重复event去重/类型参数查询/同步删除；首次 ISO 时间写入400已修复 best_effort 并重跑通过。完整可靠双写迁移仍未完成 |
| Windows run.bat | 未运行 | 当前环境为 Linux |
| CI hosted runner | 未运行 | 提供 workflow，不代表远程 CI 已通过 |

禁止使用 mock 宣称真实外部账号已验收。无外部公开部署、无镜像 push、无其他仓库操作。

追加严格恢复验收：`/tmp/baize-ops-fresh-restore.log` 实际缺失日志、空日志重置均拒绝且未创建目标库；备份前生成的真实 JSON 导出、备份后的实际访客删除、全新目标数据/密钥卷恢复，目标库 events=0/tombstones=1，保留普通 geoip 目录文件且 exports 文件数=0，持久清理 pending=0。完整生命周期退出0：同镜像升级、不存在镜像回滚、已提交schema新增字段后HTTP503触发数据库/卷/旧应用回滚均通过。最新镜像 cf9ba00b6794；后续正常启动DB删除标记检查及显式legacy水位迁移工具通过原生typecheck/lint，尚未重新构建镜像。
