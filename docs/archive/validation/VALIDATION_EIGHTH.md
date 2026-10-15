# 第八冻结应用验收

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

空数据库、空卷、服务名网络的同一共享 Compose 入口实际 EXIT0：**377 应用测试 = 88 单元（21 文件）+289 集成（86 文件）**，0失败、0跳过。**20 E2E =18真实 Chromium 流程+2日期检查**，58.2秒。真实 PostgreSQL/ClickHouse/Redis、独立应用库迁移、编译后的 production 入口、lint、类型、锁定依赖安装、独立 SDK 分发检查、journal故障检查与构建均执行。见 [结果](../../test-evidence/eighth-validation.json)、[完整应用命令日志](../../test-evidence/eighth-empty-compose-ci.txt)、[374文件源码清单](../../test-evidence/eighth-source.sha256)。专项重叠项不相加。

命令 `CI_BROWSER_MODE=system CI_RUNNER_IN_COMPOSE=1 bash scripts/ci-common.sh regular`：现有代理拒绝 Playwright CDN，默认浏览器安装的实际403/EXIT1保留。可选system模式仅在一次性CI容器内安装签名Debian Chromium，不改环境网络/生产端口/安全配置；CNB默认仍下载bundled Playwright。不把本地system模式写成CNB本轮已通过。容器、测试卷及运行镜像均清理。

失败历史未抹除：父下载的 fa3e CNB cnb-a80-1k4in2s09 是84单元通过、234集成中222通过/3失败/9跳过，4失败套件、E2E未运行、EXIT1。独立外部schema夹具和真正pre031 PG oracle修复避免ambient残留/032依赖，不弱化产品删除检查。首次本地全Compose为88单元通过、271集成通过/6失败/9跳过；第二次288通过/1失败/0跳过。后者新来源fence优先拒绝旧PG头，而旧fixture期待缺成员错误；夹具现在先验证来源拒绝，再显式对齐fixture来源后保留原缺成员拒绝。见 [失败汇总](../../test-evidence/eighth-empty-compose-failure.json)、[首轮](../../test-evidence/eighth-empty-compose-first-failures.txt)、[第二轮](../../test-evidence/eighth-second-compose-failure.txt)。

本批新增033精确关系查询与多目标问数图口径、034回放索引、035持久AI预算、037回放保留队列、040通知证据epoch失效与删除/恢复清理；历史聚合保留唯一安全数据。实际新daily历史清洗测试暴露CH String参数消费反斜杠导致无效JSON，已参数化转义并验证中文、引号、路径原样与checksum；[原失败](../../test-evidence/history-json-param-first-failure.txt)保留。PG disposable副本的privacy启动屏障持续执行，唯一canonical/historical正文精确清洗，不整站擦除。

**不是全部F/P2完成**：生产canonical激活仍关闭；036跨cutoff会话生产闭环、038独立列证明与039切换操作、新签名非空carry包及更新Docker生命周期在下一工作树，未混入本快照。已有父确认CNB223成功不替代最新fa3e失败或本次本地结果。GitHub Actions停用归档，不启用/重跑。真实Windows run.bat仍被已授权执行器启动错误阻断，见 [状态](../../test-evidence/windows-executor-status.json)；外部真实账号/模型/真机边界继续由逐项清单记录。

提交前仅移除identity.ts行尾空格与fact-member-query测试空白行的空格；TypeScript解析打印结果逐字完全一致，原字节SHA256已校验。原测试字节哈希保留为eighth-source.sha256，提交的格式化后字节见 [commit source](../../test-evidence/eighth-commit-source.sha256)，不伪称运行镜像字节完全相同。
