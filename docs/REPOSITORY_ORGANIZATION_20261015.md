# 仓库整理与保留依据（2026-10-15）

本轮从 `f26db98fbb727a1b5c6e42d5eeefda2a8bbcd0e6` 独立继续，没有访问或迁移原 Windows 草稿。原 Node 标准版、Lite、源码、迁移、SDK、测试和现有存档保留；PHP + 数据库版在独立 `php/` 实现，安装入口分别见 [Node 指南](deployment-methods.md) 与 [PHP 指南](PHP_INSTALLATION.md)。

## 目录与文档入口

原基线实际受控文件为 **196 份 Markdown**，其中 `docs/` 顶层 **133** 份；`scripts/` 受控文件为 **89** 个，其中顶层 **67** 个。这里采用 Git 路径计数，不把此前其他工作区的“110 个脚本”未经核查地当成本工作区事实。

将 39 份明确绑定旧日期、固定 SHA 或已结束轮次的文档归入 `docs/archive/`：交付 10、阶段验收 17、UI 5、交接 3、日期复核 4。现行规格、实现清单、API、部署和维护指南继续留在原位置。增加 [文档导航](README.md)，使安装与日常维护先于历史开发记录。

[归档索引](archive/README.md) 逐项记录原路径、新路径和归档理由；[机器清单](archive/moves-20261015.json) 另含原 Git blob、迁移前后 SHA-256。迁移只增加历史提示，并更新 Markdown 链接及明确的仓库路径。归档正文中的测试失败、未测范围、时间、数量和版本身份保留；不能因为归档而把旧测试算作新版本通过。

| 路径 | 职责与保留理由 |
| --- | --- |
| `src/`、`db/`、`packages/`、`sdk/`、`plugins/`、`tests/` | 原 Node 应用、数据库迁移、tracker/地理组件、SDK、插件与验收；不因新增 PHP 而删除或更换运行时 |
| `php/` | 独立 PHP-FPM + 数据库应用及其 CLI 维护入口，使用专属安装与迁移合同 |
| `docs/archive/` | 固定版本的交付、验收、设计及交接记录；由原路径映射查找 |
| `docs/test-evidence/` | 基线 767 个受控证据文件，包含成功、失败和源码绑定记录 |
| `docs/performance/` | 基线 399 个受控文件；保存性能实验、原合同负载与边界，不当作现行容量承诺 |
| `docs/screenshots/` | 基线 126 个受控文件；保留各轮截图与对应上下文 |
| `docs/validation/` | 基线 226 个受控文件；保留构建、安装、恢复、归档与交付清单 |
| `docs/research/`、`docs/ui-prototypes/` | 有用途的研究与方案资料，不能直接等同生产实现 |
| `docs/ci-reference/` | 停用 Actions 的历史参考；不迁回 `.github/workflows`，不恢复或触发托管 CI |

证据目录没有被当作杂物删除。此轮仅为跟随归档更新其中 Markdown 的引用，没有改写原始 JSON、哈希清单、图片或旧交付归档。新增测试证据属于各实施任务，不会覆盖旧版本身份。

## 脚本保留与运行边界

对旧脚本按实际职责保留。构建、维护、故障验收和实验存在文件引用及运行合同，不能仅根据文件名含 `test`、`experiment` 或 `old` 就移动或删除。

| 脚本组 | 作用 |
| --- | --- |
| `build-*`、`runtime-stage*` | tracker、应用与更新执行器构建，以及运行镜像分阶段收集 |
| `release-*`、`package-*`、`verify-distributions.mjs` | Node/PHP 分别打包、运行清单验证和发布包启动接口 |
| `backup.sh`、`restore*`、`ops-*`、`canonical-*`、`history-cli.ts` | 数据、独立删除日志、文件/密钥、严格存储及恢复/升级的维护与故障验收 |
| `lite-*`、`migrate.ts`、`partitions.ts` | Node Lite 维护及原 Node 数据库迁移、分区管理 |
| `benchmark/`、`prototypes/`、`*-experiment.ts`、`*-pipeline-benchmark.ts` | 与研究和原始证据绑定的隔离实验、固定负载工具；不自动执行 |
| `ci-common.sh`、`ci-compose-runner.sh`、`validate-local-final.sh` | 本地正式验证入口 |
| `bootstrap-cnb.sh`、`sync-main-cnb.sh` | 既有人工运维工具；保留并不授予本任务触发或同步托管 CI 的权限 |
| `check-doc-links.mjs`、`check-doc-archive.mjs` | 本次新增的相对文档目标检查，以及归档正文/原 Git blob 的一致性校验 |

没有发现可仅凭当前证据安全删除的无关受控脚本；本轮不把历史研究工具从其引用位置盲目搬走。`runtime-stage.mjs` 原本已排除文档、测试和基准数据，因此此次文档归档**不声称减小现有镜像**。

## 原 Node 发布包修复

文档曾称附带 Supervisor 示例，脚本却只把 systemd 示例列入白名单。现已将 `deploy/baize.supervisor.conf.example` 加入明确白名单，并验证来自同一冻结 Git blob，保持原字节。systemd、Supervisor 和两张 README PNG 不进行文本改写。

所有白名单 Markdown 现在都保留包内存在目标的相对链接；没有随 Node 包交付的 PHP 指南、源码、导航和历史材料链接到同一冻结 SHA 的私有仓库。Markdown 正文只变更这些链接目标，README 另有原有的离线/联网说明。Node 包不会为了这些链接递归携带 `php/`、历史证据或整仓文件。

Node 运行包仍需要其经过锁定核对的生产 `node_modules`，这与 PHP 包排除 `node_modules` 是两个不同的运行合同。发布清单已有 `.env`、缓存、密钥、备份和外逸链接拒绝；本轮另补拒绝根目录的 `private` 与 `credentials`。不会把当前工作区数据、秘密或备份递归复制进包。

## 本轮验证与边界

实际执行以下检查：

```sh
node scripts/check-doc-links.mjs
node scripts/check-doc-archive.mjs
node --test scripts/package-release-test.mjs
```

本轮检查摘要见 [repository-organization-20261015.json](test-evidence/repository-organization-20261015.json)。另逐项核对基线证据：1,518 个文件没有缺失，其中 1,496 个非 Markdown 原始文件的 Git blob 完全一致。

归档校验对 39 份原始 Git blob 逐份恢复允许的路径变更和历史提示，检查正文一致、清单哈希匹配、旧路径已迁移。打包回归 9 项通过，包含实际 Git 导出、Supervisor 与图片原字节、同 SHA 链接改写、私密目录拒绝、内部/外逸链接、密封清单变更检测和 `umask 077` 下真实 tar 提取。

相对链接检查覆盖仓库中的 Markdown 链接、引用式链接及 HTML 图片/锚点文件目标；不声称验证网络链接、标题锚点、旧 Library 下载仍有效或托管工作流的实时状态。旧资料路径出现在原始 JSON、源码摘要及包内清单时保留原文，由归档映射解释其历史位置。

本轮没有新建 Node 镜像或重新签发旧运行包，没有触发 Actions/CNB，没有部署生产环境。PHP 的实现与真实数据库测试由其专属交付记录报告，不由本次仓库整理推断通过。
