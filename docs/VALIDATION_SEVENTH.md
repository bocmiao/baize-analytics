# 第七冻结应用验收

不可变索引快照的 **318 项应用测试通过：84 单元（20 文件）+234 集成（65 文件）**；另外 **20 E2E 通过：18 真实 Chromium 流程+2 日期函数检查，50.8 秒**。真实 PostgreSQL/ClickHouse/Redis、编译后的 production 入口、lint、类型、构建均执行。详见 [JSON 结果](test-evidence/seventh-validation.json)、[应用命令日志](test-evidence/seventh-318-application-ci.txt)、[浏览器日志](test-evidence/seventh-clean-e2e.txt)与[源码校验清单](test-evidence/seventh-source.sha256)。专项重复项不另累计。

不能将本次写成单次 shared CI EXIT0：原共享命令在318全部通过、编译入口健康后因本地 Chromium 环境变量拼错而 EXIT1。修正为 PLAYWRIGHT_CHROMIUM_EXECUTABLE，并保留独立 TEST_DATABASE_URL（无URL search_path）后，在新隔离应用 schema 迁移、启动同一编译产物与完整20 E2E实际 EXIT0。第一次恢复遗漏独立测试URL导致18通过/2失败；旧失败记录保留，未改产品或断言来通过。

更早两次失败同样保留：旧共享 public schema 与 pre031 迁移夹具导致229/233；修正后插件覆盖 gzip MIME 又导致228/234。gzip MIME已修，六个相关真实采集浏览器场景通过，新全234通过。历史迁移使用已发布194ac24的冻结worker oracle，只在测试夹具使用，没有替换生产worker。

本批包括030 AI typed trace/chart与删除派生失效、031 disk-backed worker及租约/HWM、032保持激活保护的 CH 权威基础、标准MCP与英文固定产品提示。**不是全部F/P2完成**：033及后续034/035/036/037、新CH全切换、回放物理清理、独立恢复、最终镜像均属下一工作树集成；旧AI多目标转化率的会话口径已经发现并在下一批修正，本批不宣称该语义完整验收。CNB已核223的托管结果不能替代此源码；GitHub Actions仍禁用。上一第五镜像c610不覆盖本批。
