# 手动 CI 与 CNB 镜像同步

GitHub main 是源码主线。仓库的 .cnb.yml 仅配置两个手动入口，没有 push、cron 或 NPC 自动触发：

| 入口 | 执行内容 |
| --- | --- |
| web_trigger_validate | 使用 Node 24 和 Docker 服务执行 scripts/ci-common.sh regular |
| web_trigger | 执行 scripts/sync-main-cnb.sh，将 GitHub main 单向同步至已配置的 CNB 镜像；默认不连带运行测试 |

同步脚本从现有密钥配置读取认证信息，验证源 main 与目标分支后按快进方式推送，不反向同步或覆盖目标分叉。首次空仓库初始化需要显式 SYNC_BOOTSTRAP_EMPTY=1；非空仓库缺少 main 会拒绝初始化。镜像地址与密钥导入入口由维护者在 .cnb.yml 中配置，不能把真实令牌写入仓库、日志或命令输出。

需要将这套流程用于自己的仓库时，先替换镜像地址和凭据来源，核对权限及可见性，再手动运行。验证使用独立数据库和缓存；本地检查见[开发指南](development.md)。一次同步成功只说明提交已同步，不代表测试或部署已经完成。
