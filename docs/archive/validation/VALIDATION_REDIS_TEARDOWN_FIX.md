# Redis测试清理竞态窄修

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

固定测试源码 `2753b5a90747a0b7d058159df0b445d6045efcec`。仅测试fixture、清理回归和证据修改；src/db/packages/scripts、依赖和生产限流与2d05e7c完全无diff。不重跑完整应用、浏览器、镜像或恢复，也不外推旧完整绿灯。

## 保留的托管失败

父下载并核实CNB `cnb-hnk-1k4kumcim` /2d05e7ca实际EXIT1：集成453passed/1skip，1suite清理失败，request-rate-limit两项业务断言均通过。afterAll的ioredis.quit抛“Stream isn't writeable and enableOfflineQueue options is false”。跳过为strict-identity-restore的已知Docker能力限制；浏览器未运行。证据`test-evidence/cnb-2d05e7c-redis-teardown-fail.json`来自父实际日志核验，不冒称本执行器重新下载。

## 修复与确定性证明

断连后的status可暂时仍ready；检查status再QUIT存在状态竞态。测试fixture清理统一无条件disconnect，无网络命令/状态检查/等待队列，重复调用可释放客户端；未捕获业务断言或其他hook错误。两项单元明确构造disconnect后stale-ready且QUIT必抛、status getter访问必抛/未创建客户端，验证清理重复调用仍安全。

`npm run typecheck`、三个改动测试文件的eslint与diff-check实际EXIT0。不可变git archive2753b5a，独立PG17/Redis7/CH25.8 Compose栈：宿主2轮、容器3轮，每轮2清理单元+原2真实PG/Redis集成=4PASS0fail0skip；合计20重复执行断言，**只有4个不同测试**。每轮仍实际disconnect并断言管理请求503/request_rate_limit_unavailable。独立Redis数据库避免轮间共享公共窗口，未改变单轮跨实例/真实issuer/TTL/XFF/429/恢复/断连断言。

容器使用仓库Dockerfile.ci及docker-compose.cnb.yml，服务名PG/Redis端点及npm ci，命令定向为 `npm exec vitest -- run tests/unit/redis-fixture-cleanup.test.ts tests/integration/request-rate-limit.test.ts`。仅临时command覆盖，未修改共享CI配置；这不是ci-common regular全轮，不安装浏览器。代理CA沿已有机制复制，不读凭据、不放宽TLS。源码/结果JSON见`test-evidence/redis-cleanup-2753b5a-*`，实际全部EXIT0，自有runner镜像/容器及栈清理，原三dev服务保留，剩余约6.3GiB。

新托管验收尚未运行，父决定同步及最终CNB；本任务未触发任何CNB/GitHub Actions。strict5000原FAIL与外部设备/账号未测不变。
