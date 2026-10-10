# 第二轮最终镜像验收计划（尚未执行）

2026-10-10。当前仅准备，不构建镜像、不启动容器或数据库、不触发托管CI。最终源码须由集成负责人提供正常提交后的完整不可变 `APP_ROOT` 和 SHA；本计划不把研究建议、在制050–053或旧镜像视为新源验收。

已关闭的基础运维证据继续有效：f4镜像完整安装、PG文件/密钥分离备份、独立卷恢复、缺失日志拒绝、真实worker失败拒绝、升级及数据库/应用回滚EXIT0。f4独立CH服务器外层恢复通过，但追加原生全正文恢复EXIT1；source-only顺序变体EXIT0无提交归属；b7完整不可变源码原生恢复EXIT0。逐轮见 `test-evidence/docker-native-order-results.json`。不无限重跑这些已关闭场景，也不把b7原生结果当第二轮新生产镜像结果。

## 最小新增矩阵

| 阶段 | 必须真实观察 | 失败处理 |
|---|---|---|
| 冻结源预检 | SHA、lock、Dockerfile摘要；源码manifest；实际050–053 DDL及签名包闭包兼容接口由各负责人交付 | 缺迁移/未知正文闭包则不构建；不能仅放宽schema allowlist |
| 一次新镜像 | 默认Docker代理和CA校验；构建EXIT、image digest；镜像内manifest与冻结源逐文件相等 | 保留日志，不用旧镜像或tsx替代compiled Node |
| 实物交付/安装 | nonroot可读AGPL/MIT完整notice、真实tracker gzip双口径、WP白名单ZIP；隔离新卷compiled Node健康、真实admin/site/tracker采集 | 不修改secret文件权限；不公开端口，仅127.0.0.1应用端口 |
| 受影响恢复路径 | updated canonical-ops-runtime、所有已发布正文闭包/050–053完整PG元数据；第二CH服务器独立卷；原PG fingerprint认证先于目标保留期变更；当前独立日志在COMMIT/ready之前精准执行 | 缺正文/签名/来源/最新proof或worker失败则明确失败，无成功marker/流量切换 |
| 源不变/隔离 | 不同source/target服务hostname与volume；目标CH无发布端口；源正文摘要、authority epoch、history摘要前后相同 | 目标非空拒绝；不擦源namespace、不继承源cutover授权 |
| 清理/报告 | 每阶段实际EXIT、源码/镜像digest、实际迁移文件清单、仅owned资源清理 | 保留旧FAIL及未执行项；不声称跨物理机集群灾备 |

完整旧故障矩阵只在安装器/升级/备份安全逻辑或新迁移实际改变相应契约时重跑；默认新增重点为新镜像实物、启动及updatedruntime独立CH恢复。若负责人要求完整回归，先列具体变更依据并串行执行，不启动第二套负载。

## 冻结后命令形态

```bash
export APP_ROOT=/tmp/<root-provided-immutable-artifact>
cd "$APP_ROOT"
node scripts/ops-artifact-manifest.mjs > /tmp/<sha>-source.sha256
# Root释放唯一heavy gate后：使用现有install.sh构建及安装隔离栈；
# 镜像manifest在容器内同命令输出，与source diff，记录实际image ID。
# 使用既有ops-canonical-entry-test.ts与独立目标CHserver override：
APP_ROOT="$APP_ROOT" FROZEN_SOURCE_SHA=<exact-sha> \
  BAIZE_OPS_TARGET_CLICKHOUSE_URL=<owned-private-target-url> \
  BAIZE_OPS_POSTGRES_CONTAINER=<owned-or-explicitly-authorized-pg> \
  node --import tsx scripts/ops-canonical-entry-test.ts
```

命令中的URL/PG测试环境由现有本地验收配置提供，不在文档嵌入凭据；不继承CNB/GitHub token到容器。新CH HTTP预算/完成语义须由第二轮实际单元/真实运输测试证明，不能从安装健康推导已通过。OAuth/GSC真实账号、付费SERP/AI仍未实测；模拟连接器集成与产品覆盖提示不能升级为外部实测。

## 磁盘与串行闸

只读观察 `/workspace` 32GiB，当前约11GiB可用（观察时点，非执行保证）。构建前、目标server启动前、恢复/故障派生前再次核对，保留2GiB最低余量。估算一次新image/buildstage加独立CH/PG测试卷可能消耗数GiB，Docker存储驱动copy-up使`docker system df`不足以代表宿主余量；以宿主`df`为闸。保持当前已验fallback image，不做global prune。空间不足时停止昂贵阶段，报告明确owned image/cache/volume ID后由root批准精确清理；不得降闸或删其他代理服务。唯一heavy owner由root指定，CI/browser/负载与镜像矩阵串行。

050–053接线准备已落实：namespace guard仅新增四个准确文件名；新版scope明确增加intake/bot、SEO evidence、GSC window、annotations，对五张表的完整PG行以有界cursor纳入签名快照fingerprint。旧049及更早包继续其原始fingerprint口径，不把旧包声明为包含第二轮元数据。native入口夹具已增加真实非空五表种子及恢复后断言，尚未运行。目录当前预期54个迁移文件（010有两个不同文件）；最终必须由实际runner输出文件列表与count，不用最大序号53冒称53个文件。
