# f8c9c12 后端优化轮收尾验证

## 固定源码与实际结果

验证源码为 `f8c9c12a54c843f55e1351882a8ff27735b45816`，通过 git archive 创建不可变测试副本；后续 `3c4ac24`、`ae5ede9` 仅加入两张获准视觉参考素材，不改变应用树。本轮没有产品修复、额外性能调参或新的5000负载。

| 阶段 | 实际执行结果 |
|---|---|
| 空库本地正式入口 | `APP_ROOT=<冻结副本> SOURCE_SHA=f8c9c12… bash /tmp/baize-final-full-runner.sh`；执行仓库 `scripts/validate-local-final.sh` / `scripts/ci-common.sh regular`，最终EXIT0 |
| 静态与发行构建 | lint、typecheck、SDK、journal lint、应用构建全部完成；构建保留大chunk警告，不称已优化体积 |
| 单元 | 61文件、247 PASS / 0 FAIL / 0 SKIP / 0 unhandled |
| 真实集成 | 161文件、443 PASS / 0 FAIL / 0 SKIP / 0 unhandled；新Compose PG/CH/Redis从空卷启动，无开发机旧schema依赖 |
| 浏览器目录 | 30 PASS / 0 FAIL / 0 SKIP，1.7分钟；28项使用真实Chromium，2项为日期函数检查；严格CH事实读取、缺正文拒绝、真实采集/看板等路径在内 |
| 独立应用入口 | db:migrate及编译生产入口完成；浏览器并非仅静态页面测试 |
| 新镜像与独立恢复 | 既有 `/tmp/baize-round2-final-image.sh`，绑定同一f8源码，EXIT0；56迁移、395应用文件，source/image精确一致 |
| 清理 | 两轮各自Compose项目/卷正常清理，原baize-dev-postgres/baize-dev-redis/baize-analytics-clickhouse-test保持运行 |

395项应用manifest SHA256为 `e299977340ea7b7d223df62fc29aed550921c9116d43dfc90a4a6d6e5db11aab`；测试前后相同。生成构建、报告、截图发生于隔离副本，不把生成文件称为全部Git对象未变。新镜像ID `sha256:51f06040aacd9a8ce358afe46d132b540b077d78499491592c30cdfad02618e9`。

## 镜像与恢复覆盖

实际验证054两索引、055nullable bigint/text配对约束（3有效/5无效输入）、预算默认配置120000ms/20000SELECT/2GiB。tracker完整MIT随脚本和HTTP许可资源提供，标准脚本gzip5087字节（小于5KiB，不小于十进制5KB）、min脚本4506字节；不改变原体积口径。

独立ClickHouse25.8目标服务无发布端口、使用独立卷。原生pg_dump/restore、canonical CLI与restore-runtime实际执行；非空carry/session headers、remaining/cache签名包、整个已发布闭包均恢复。最新journal删A留B，缺sidecar、证明推进、未知未来schema、篡改历史包、既有目标覆盖及worker失败均拒绝；修复后实际恢复、源数据/历史namespace不变均核验。新remaining-member集合SQL经非空remaining/carry恢复路径执行；100行边界由已归档专项覆盖。这是同机独立目标，不是跨物理机灾难恢复证明。

镜像开始前可用盘6.5GiB，目标CH启动后最低实际采样约0.89GiB，正常结束清理后4.6GiB；不能将预检门槛当峰值资源保证。只非force删除确认无容器引用的两张旧白泽镜像，未全局prune、未删原服务卷、Git/bundle/历史证据。

## 本阶段交付与明确限制

此次有界集合SQL保持每批100、PK/FK、准确rowCount、逐项归属、receipt/HMAC/fence、CH正常EOF与独立读回、同事务发布和删除屏障。小负载A/B只证明局部member写入约79%降低，整体性能收益未证实；见 `PERFORMANCE_REMAINING_MEMBERS_AB.md`。本轮停止后端优化，没有实施可信会话闭包/贡献复用大架构。

原5c02abf固定50events/s的1000PASS、5000FAIL保留：5000均接收，36延迟，120秒未排空，末次backlog2600，最终完整性未通过。旧87e1f64容量探索10events/s/30秒查询：PG有限1000/5000PASS，strict1000PASS、strict5000FAIL。上述不是当前f8生产SLO；f8只有有限300事件完整性诊断，不外推持续50events/s、日均百万或1C2G。dirty claim仍重建保留范围，精确认证/派生发布成本与高负载边界未闭。

真实GoogleOAuth/GSC/GA4账号、SERP/BYOK真实商用模型、授权GeoIP数据库、邮件/企微真实投递、小程序真机、真实CMP/主题组合、读屏及跨物理机恢复仍未测。百度普通站长公开搜索报表读取接口未证实，自定义CSV真实样本待提供，不虚构端点。Windows原生执行器pre-start -32603 helper_unknown_error；Ollama实模型下载网络阻断，均不是笼统缺账号。WordPress实际本地验收已完成，不回退成未测。

## 已批准UI与下一轮队列

用户正式批准同一主题A洞察栏展开/B收起重排，偏好记忆和手机抽屉；这不是两个复制页面。远端素材 `ae5ede955873606dcf8d99618920a3ecd08224ab` 已正常fetch/ff，本轮实际解码并用view_image打开两PNG：A1504×1046、B1536×1024。解码路径 `/tmp/baize-approved-20261011/reference-a.png` / `reference-b.png`；原图仍安全保存在private仓库SVG容器内。

A PNG SHA256 `7b1402b8b984a0131fd0dcacd9618d1da22f8d72fcdc0e6d17b96ae345db4528`；B `399379ec0f5e7375b23ba486e0afee9e79b2f6d9439fdfc1a6d957e023b5afdd`。

视觉实施尚未开始，正式UI与v2原型没有改动。下一轮按实际参考图和已安装frontend-design/web-design-guidelines显式读取技能，先正式首页展开/收起/手机真实数据截图交父视觉复核，再统一全站；保留全部入口、权限、筛选、口径、可访问性，纠正参考图日期/重复来源/轴标签及硬编码数字。所有显示数值由真实API计算，零/未知/partial/error不可混淆。本轮浏览器通过不代表设计完成或用户满意。

## 证据与托管

原始unit/integration JSON、regular安全日志、manifest与汇总见 `test-evidence/main-f8c9c12-full-*`；镜像/安装/独立恢复结果、实际native断言、清理和哈希见 `test-evidence/main-f8c9c12-image-*`。运行state、服务原日志、env、密钥和运行备份包不入仓。

未调用任何GitHub Actions或CNB同步/触发/重跑。托管验收继续由父统一放行；正常private main提交不改变该限制。历史FAIL记录、原始规格和容量探索保持原样。
