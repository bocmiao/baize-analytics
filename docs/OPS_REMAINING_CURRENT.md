# 当前运维剩余核查

核查基线：`957431ba13999d312eef24f7d80709d5d53c43da`，2026-10-11 UTC。规格、实施勘误和逐项清单按分段阅读核对；本轮先只读检查脚本与已有安全证据，再按父线程授权窄修两个确定缺陷；未启动Docker、数据库或应用测试，未修改迁移、CI或Git历史。

## 已有验收保留

`docs/test-evidence/approved-ui-81415f4-image-result.json` 记录实际EXIT0。对应native-entry证据明确：397文件manifest、56迁移（含两个010）、真实PG快照/恢复、非空carry/CH会话头/remaining/cache签名侧包、独立目标CH服务器、最新journal删A保B、源未变、缺sidecar/篡改/worker故障/目标覆盖/未知schema拒绝，以及保留期7→90只能向前。目标与源是同一物理宿主的独立服务器，不等于跨宿主灾备。

已有 `docs/validation-ops.md` 保留基础安装、幂等安装、新库新卷、独立密钥包、缺失/重置日志拒绝、正常升级、缺镜像回滚、已提交schema后503触发DB+卷+旧应用回滚的实际EXIT0。旧ENOSPC、权限、编译Node、原始PG指纹次序等失败仍保留，不为本轮核查重复整套已过矩阵。以上只绑定各自源码，不能外推下一修复版本。

## 确定可自主修复的缺陷

| 文件与证据 | 触发与影响 | 最小修复与必要验证 |
|---|---|---|
| `upgrade.sh:47` 固定 `chownSync(p,1000,1000)` 后0600；`install.sh:16` 写入安装者UID/GID，Compose按 `BAIZE_UID:BAIZE_GID` 运行 | 非1000应用用户执行含canonical sidecar的失败升级回滚，无法读取新写的保留期证明；不是既有1000验收失效 | 停止应用前读取并严格验证既有app的numeric Config.User，证明文件使用实际UID/GID；保持0600/fsync、全部seal/journal/物理删除校验。静态与mock命令编排可先验，真实非1000 CH回滚须root串行资源闸，尚未运行 |
| `run.bat:1–6` 没有切换到脚本目录 | 从其他目录双击/调用时在调用者目录执行npm ci/migrate/build，可能误操作其他项目 | 首先 `cd /d "%~dp0"` 并失败退出，保留每步错误传播；Windows实际运行仍需有效执行器，Linux静态检查不能算Windows验收 |

两个最小修复已落地：upgrade.sh在stop/backup前验证既有app numeric UID:GID，回滚证明按该身份chown；run.bat首先进入脚本目录并失败退出。`bash -n upgrade.sh scripts/ops-upgrade-custom-user-test.sh` 与 `git diff --check` 实际EXIT0；这是静态检查，真实回滚及Windows运行尚未执行。每日备份已有手动脚本与OS定时器说明（deployment.md）；未找到随仓库交付的专用定时模板。可补受保护、固定checkout路径的定时示例，不自动安装宿主cron、不输出凭据；这是交付完善项，不是数据库备份实现缺失。

## 真实外部、设备与资源边界

- Google/GSC/GA4、MaxMind授权库、付费SERP、SMTP、企业微信/Server酱/SSO、商业模型：安全连接器与本地模拟结果存在，真实账号/许可/投递/质量未测；不购买或创建生产凭据。
- Ollama真实推理：既有官方二进制下载CONNECT403，属于当前网络工具阻断，不是缺账号；不改网络策略。
- Windows：已连接设备的执行器在命令执行前出现exec-server setup错误；run.bat没有真实运行证据。微信小程序需实际设备/平台账号；SDK注入传输测试不替代真机。
- 跨宿主灾备、完整集群故障及多设备/读屏/主题/CMP矩阵未测；同宿主独立CH恢复不能冒称上述范围完成。
- strict5000 FAIL与1C2G/实时SLO未证实继续保留。2GiB前置磁盘门槛不能保证阶段峰值；既有ENOSPC失败不抹除，不以新增压力轮追绿。
- 预构建镜像公开发行/GHCR、公开仓库或外网部署受用户禁止，本轮不属于自主待做操作。托管CI、同步和触发必须遵守父线程当次授权，本核查没有触发。

后续只针对上述已证实缺陷做最小修复与定向验证，资源由集成负责人串行批准。旧通过、旧失败、新未运行分别记录，不把清单中的历史“待镜像”字样当作重新构建所有旧SHA的需求。

## 交回的定向运行入口（尚未运行）

已有授权隔离栈须使用非1000 UID/GID，且真实采集、迁移后存在CH canonical站点。保持其源/目标CH URL、密钥和数据卷独立，不在原dev服务或其他项目运行：

```bash
APP_ROOT="$BAIZE_ISOLATED_CHECKOUT" BAIZE_OPS_ISOLATED_STACK=1 \
  bash "$BAIZE_ISOLATED_CHECKOUT/scripts/ops-upgrade-custom-user-test.sh"
```

脚本先拒绝非隔离/默认1000/无canonical fixture，再复用现有真实schema+HTTP503失败回滚测试；最后由实际app用户验证proof UID/GID、0600与可读性。它不建立源站点、不创建生产凭据；所需隔离安装和真实seed由root资源闸安排。

## 每日备份定时示例（交付模板，未安装）

将下例中的checkout绝对路径改为本人已有私有安装。定时器运行用户必须与安装用户一致，先手动备份成功；需要系统提供flock。日志目录须预先创建0700，日志0600，不打印.env或密钥。该模板不更改宿主cron，也不自动删除备份/独立日志/版本密钥。

```cron
# 每天03:15；串行同一安装的备份，失败保留日志供人工检查。
15 3 * * * /bin/bash -c 'umask 077; cd /absolute/private/baize-analytics && /usr/bin/flock -n .baize/daily-backup.lock ./scripts/backup.sh >> .baize/daily-backup.log 2>&1'
```

数据库包与独立密钥包、长期最新删除日志需分别保存在受保护持久存储并按既有恢复流程对账；本例没有实现异地复制，不能据它称跨宿主灾备完成。

## 非1000隔离栈最小启动方案（只读准备，尚未执行）

root冻结本批新源码并构建对应镜像后，在单独artifact checkout执行。Compose project必须新建 `baize_lifecycle_...`，端口选未占用loopback；PG/Redis/CH各自新卷，不连接原devPG/Redis/CH。配置 `BAIZE_UID` 与 `BAIZE_GID` 为明确的非1000数字身份，例如12345:12345；master key保持0600并属于该身份，checkout与公开应用文件可读。复用宿主安装用户0600密钥而只改容器UID会使secret不可读，不能误判为本次回滚问题。

需要 `BAIZE_IMAGE` 为本批实际新镜像、`POSTGRES_PASSWORD`、独立本地 `CLICKHOUSE_PASSWORD`、`CLICKHOUSE_USER`、`BAIZE_PORT`、`PUBLIC_URL`；秘密使用现有隔离配置文件，不能打印或放入命令参数。`COMPOSE_FILE` 选 `docker-compose.yml:docker-compose.clickhouse.yml`，`COMPOSE_PROFILES=clickhouse`。本机需Node24、Docker/Compose、fallocate和既有构建CA机制；应用与操作helper必须同一冻结源。

顺序：静态config → 新卷安装健康 → `OPS_ISOLATED_STACK=1` 的已有 `ops-canonical-stack.ts seed` 创建fixture → 上述custom-user失败升级脚本 → 核实际schema回滚、health200、proof实际owner/0600/可读 → 只清理此project。seed明确是隔离运维fixture直接authority，不把它当公共activation产品验收。

不能用 `baize-analytics:ops-fallback-c610` 作为本批被测应用：其源码/迁移只有早期30条，缺最新canonical/retention/facts协议与此修复；只能保留作历史fallback证据。当前既有 `ops-upgrade-failure-test.sh` 派生故障镜像基底固定 `baize-analytics:local`，运行前root须确保该local标签对应同一新冻结镜像，否则会混用源码。若root需要避免覆盖标签，须先把该fixture基底改为显式被测镜像，而不是用c610替代。
