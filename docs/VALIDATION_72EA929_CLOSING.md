# 72ea929 有界读取合批收尾

冻结源码 `72ea9291b69c30cba5369a63f44c0b2842bcbcd3`；本轮不包含后续独立 B 原型，不触发托管 CI。

- `scripts/validate-local-final.sh` 新空库真实 PG17 / CH25.8 / Redis，本地 EXIT0：369 单元、491 集成、31 Chromium，0失败/0跳过。lint、typecheck、SDK、构建与 compiled entry 同入口通过。原始结果见 [full-72ea929-pass](performance/producer-canonical/full-72ea929-pass/)。
- 新镜像实际构建并安装健康；整条 image helper 安装后磁盘2GiB门槛触发 EXIT1，保留原日志，不能写该整条通过。后续严格校验同一镜像与426文件源码manifest相等，复用已完成安装，只启动独立目标CH，以原生运维入口进行签名备份/PG dump/最新journal/worker/缓存恢复，EXIT0，`targetClickHouseServerIndependent=true`、源不变、删A保B、缺证明/篡改拒绝及修复后恢复均有真实记录。首次遗漏显式串行开关在启动目标前拒绝也保留。此为安装证据+独立恢复证据组合，不是再次完整安装升级矩阵。见 [image-72ea929-independent-pass](performance/producer-canonical/image-72ea929-independent-pass/)。
- 原参数5000仍 **FAIL**：4700 accepted，6批queue_full未发送；排空与已接收完整性通过不能抵消容量失败。没有追加无变更5000，也没有放宽deadline/drain。
- 原型B独立8项真实PG与模拟publisher通过，不能称正式采集接入、真实CH发布或容量闭环；见 [原型验证](VALIDATION_DURABLE_INBOX_PROTOTYPE.md)。

远端写入当前由父协调恢复原平台Git路由；本地提交和Git bundle保全。无需新凭据，不借CNB绕过。
