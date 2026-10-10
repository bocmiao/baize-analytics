# 第十一批：新源本地验收与第二轮研究入口

2026-10-10 UTC，全部为原私有云环境本地执行；没有托管触发、同步、部署或新的外部凭据。

## 冻结应用全套实际结果

源 `b7a0a5f68e6b45a9522add37ca6c58b7747b055e`，独立 Git archive `/tmp/baize-main-restore-order.yoemc5m1`；命令 `bash scripts/validate-local-final.sh`。全新、测试独占 Compose PG17/CH25.8/Redis7，固定锁文件已有安装及系统 Chromium；没有重新下载依赖/浏览器。lint、类型、build、独立 SDK、journal、迁移、编译入口启动均通过。

- 单元 **114/114**，33 文件；真实集成 **395/395**，146 文件，均零失败、零跳过。应用合计 **509**，不是将专项重复累加。
- E2E **27 中 25 通过、2 失败、零跳过**：通过中 **23 真实 Chromium、2 日期函数**。
- 总入口实际 **EXIT1**。失败为新增 report-members、responsive-replay，两者在语言切换 `location.reload` 后测试仍使用默认站点，而非原采集目标。完整失败日志、报告、trace/截图路径保留在 [原始汇总](test-evidence/main-b7a0a5f-local-final-failed.json)。测试容器、网络和卷已清理，原开发服务保留。

## 窄修定向浏览器实际结果

源 `07f9ada`，独立 archive `/tmp/baize-main-07f9ada.rn9ev0r4`，只改两项测试在语言切换后重新绑定实际目标站点，原报表/权限/响应式/键盘/私密回放断言保留，并补真实站点/PV 断言。新测试独占空 Compose，实际 build、迁移、生产编译入口、Chromium。

`node node_modules/@playwright/test/cli.js test tests/e2e/report-members.spec.ts tests/e2e/responsive-replay.spec.ts --reporter=list,json` 实际 **2/2 PASS，0 FAIL/0 SKIP，EXIT0**；测试资源已清理。见 [定向报告](test-evidence/main-07f9ada-two-browser.json)。这是两项回归，不称新的全套27检查结果。

## 独立恢复与镜像

b7 不可变全源码原生完整恢复另有实际 EXIT0，包含真实 pg_dump/restore、非空 carry/header/047/048、049 fingerprint、最新A删除/B保留、worker故障拒绝与修复恢复、同物理宿主独立CH目标服务。此专项不加到509计数。见 [逐轮汇总](test-evidence/docker-native-order-results.json)。

f4 基础新镜像生命周期 EXIT0；独立完整 native 恢复原先 EXIT1，顺序修复后先 source-only 变体、再 b7 完整源各自实际 EXIT0。旧失败保留。尚无第二轮新源生产镜像验收，不把原生入口冒充新 Docker 实物。

## 继续工作与未完成

- b7 的100行精确归属批量已通过真实PG/CH；严格1000同脚本性能复测正在运行，尚无结果。7f严格5000实际FAIL不抹去，未达实时SLO或1C2G承诺。
- [三份第二轮原文与落实索引](research/round2/IMPLEMENTATION_INDEX.md)按上传字节保存。CH命令正常EOF、独立负载、SEO/GSC契约、接入/Bot/诊断、导航与UI等新实现正在分工，不计作已验收。
- 新源码冻结后的空库/完整浏览器/最终镜像仍待。所有自主工作收工后才由父统一手动CNB；GitHub Actions保持禁用。
