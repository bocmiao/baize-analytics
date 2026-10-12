# 060 默认关闭候选专项验收

日期：2026-10-12 UTC。源码指纹与原始JSON见 [证据目录](performance/fact-validation-manifest/correctness/)。本文件随候选源码提交，不伪造自引用SHA。

- 46单元：清单域/成员篡改、未知版本、空批及新旧备份profile，PASS，0失败/跳过。
- 13真实PG17/CH25.8：开关等价、正文缺失、重复/额外/遗漏响应、清单篡改、PG回滚孤儿、物理删A保B与空批、恢复旧行HMAC，PASS。
- 4真实PG/CH：原有事务内selected-source与生产worker物理删除接线分别开/关，PASS。旧已签正文仍存在时删除边界拒绝正常读取，受控重建仅取未删除成员；不是全新攻击框架或所有整库回滚组合覆盖。
- 14真实PG/CH：旧fact-store、独立目标CH恢复及最新journal删A保B、历史严格备份，PASS。新v3包和目标证书实际检查，源保留。
- 1真实PG/CH升级流程：pre055 v1原包升级后独立恢复、合法旧v2签包与新v3读取、stale证明拒绝，PASS。新v2专项验证读取/readiness，不能称新增独立v2物理恢复实测。
- typecheck与候选相关lint，EXIT0。初次WIP类型检查因测试调用不存在的eraseEventIDs而EXIT2；改为真实CH物理故障注入，未改产品断言或添加测试专属产品方法。另一次夹具unknown类型修复保持相同正文count断言。

原批32数据库专项与46单元均0失败/跳过，不累加之前重复执行次数。060在隔离schema实际迁移。正式全量仍绑定72ea929；本候选尚无新全轮、新镜像或正式5000验收。签名清单不等于当前性，原门、选集与来源检查保留。旧包固定投影不改，未知格式不得降级。

后续先相同已发布数据真实HTTP交替开/关对照（047宽度固定3且规范化复用关闭），再按收益决定正式负载。小样本读取不是持续容量结论。旧strict5000所有FAIL和B原型received语义证据完整保留。

## 小范围真实HTTP结果（68fd912）

[原始结果](performance/fact-validation-manifest/http100/)：100事件、3500事实成员，同一已发布数据交替关闭/开启各3次。结果摘要完全一致、coverage1、receipt与源码不变、清理全部成功。关闭中位1634.84ms，开启1400.95ms（观察到约14.3%下降）；认证中位204.48→80.73ms。各次相同3次CH请求/5836900响应字节。读时无采集/worker/删除并发，不推断持续容量或统计显著性。

首轮调用方完整SHA标签抄错；原JSON未改，另以2090个Git blob检查确认实际快照来源且清理通过，但不把该轮列为正确标签的正式对照。修正标签的第二轮才采用上述摘要。后续CLI增加服务创建前真实commit与全归档blob预检；不存在SHA负例实际EXIT1且未创建服务。没有通过重写原结果掩盖错误。

待三个精确发布阶段回滚专项完成后，才进入同源码原5000基线/候选；目前未运行、成败未知。

## 精确发布阶段回滚补验

三个真实阶段：INSERT正常EOF后、独立读回正文/key/SHA验证后、清单签名完成但receipt INSERT前。各自回滚后PG batch/member零、CH存在孤儿；同事件新attempt重试提交后物理两attempt，但实际读取恰一行、查询参数仅包含新已提交attempt。产品源码未改。

首次定向3项失败/13未选中：夹具硬要求CH UInt64 JSON计数字符串，实际为数字，失败在物理count=1断言。改为有界计数数值解析，仍严格断言1/2行及1/2attempt，没有放宽计数。完整16项随后PASS、0失败/跳过；两份原JSON保留。当前独立数据库用例累计35项（16+4+14+1），不重复累加旧13执行次数。这不替代新HEAD应用全轮。

## 原合同5000：42d1b8e不可变对照

[两组plan/result/wall、完整UTC窗口与文件哈希](performance/fact-validation-manifest/formal5000/comparison.json)。配置唯一差异 `factValidationManifestReuse=0/1`：100×50、1秒/批、并发2、等待队列8、10秒查询、120秒排空、原220秒压力deadline、coverage复用1、pagePath批处理1、publication并发2、047读取宽度3/规范化复用0均相同。Node24.19.0、4CPU/32GiB cgroup；绝对时间、UUID数据、初始空闲空间及实际样本数不同，不能说逐字相同数据或完全无噪声实验。

关闭：4950 accepted、99发送/202、index81 queue_full_unsent；开启：5000 accepted、100发送/202、0未发。两组均0拒收/请求失败/查询失败，原限制内排空、最终coverage1/精确PV、九PG正文零、outbox全部done、canonical含bootstrap正确、来源水位完整、源码和清理全通过。整体验收关闭FAIL、开启PASS。

UTC两组seed/查询窗口都在2026-10-12 01时，不跨小时/日。两组sourceDigest前后均 `dd93b44d0e8e1d6bcb2deab05861ba50725cf59eeaae82dd98744f603d73e13a`，2097个Git blob验证。起止及精确窗口完整保留在摘要，不事后替换原文件。

最终HTTP 27.903→14.299秒；整体墙钟237.884→243.407秒，候选并未整体更快。候选实际采集至118.076秒、排空97.998秒，原目标调度不变但排队请求可迟发；不能宣称持续50events/s或生产SLO。认证阶段现有hook仅覆盖wire/record；新清单HMAC验证在该hook之外，未观测部分不能说为零。

此结果未默认启用。产品默认 `BAIZE_FACT_VALIDATION_MANIFEST_REUSE=0`，显式1才启用，须已执行060；新候选全应用/浏览器/镜像恢复尚未完成。父暂未直接读取未推原JSON，只能独立审查目前收到的结果记录。旧239/72及B全部FAIL仍保留，不重复压测追绿。

资源：只将本项目下载缓存1442文件可恢复私有归档，archive194576674B，SHA256 `079584ce0d82dc13ee45a67ed2f9b6d6d13ca62c7548667e6de08d41e8b8dac9`，逐文件校验后移除原cache。测量可用空间增加238755840B，不声称500948992B全部释放；完整原路径/归档/恢复命令见资源摘要。有效镜像、node_modules、三服务卷及所有源码证据保留。
