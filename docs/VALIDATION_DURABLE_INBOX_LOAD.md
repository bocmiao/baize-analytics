# B真实CH研究负载（未接入正式入口）

不可变源码：`b7f0362ac9b817b15692b601959969f3bdce677f`。标准prepared研究接口，不将received替代正式accepted，也不改变生产collect。当前5000尚在运行；不能提前记PASS。

## 300初始化闸（不是容量结果）

实际EXIT0；300received/300validated/300published，0未发送、0请求/查询/探针失败；后台排空，7finalchecks全部通过，真实HTTP PV300/coverage1/CH。canonical301/UV7含1条bootstrap，9正式PG正文表0，outbox/generation对账。最终HTTP1448.428ms，独立PGschema/CHnamespace/app/temp均清理true，源码前后不变。[原始结果](performance/producer-canonical/inbox-b7f0362-300-pass/)。finalMetadata.inbox.readiness在final断言前采样false，断言后phaseMetrics.research.readiness=true；这是阶段采样差别，未隐去原字段。

## 与原负载的相同条件及差别

固定每批50页事件、每批新visitor、5paths、1秒调度、独立10秒真实HTTP查询、queue8/concurrency2、drain120秒；5000为100批，300仅为6批接线闸。Node与app/harness同进程，4CPUquota/32GiB内存上限；RSS不含PG/CH/Redis。

沿真实public shadow/verify/activate、五类签包/proof和受保护prune初始化strict；不直接写authority/body_mode跳过门槛。沿原后台worker，非手工触发聚合；sameclient真实preparedCanonicalPublisher完整CH读回、PG receipt/outbox提交，outbox事件型变更标记沿原collector set_config机制。

使用原WireBatch schema/defaults、同源cleanEvent纯函数、共享eventDimensions/anonymizeIP，在内存准备脱敏事件，不持久原IP/UA；脚本核对cleanEvent源码相等并记录摘要，实际维度keys从数据采样。不会以空维度降低归约工作量，也不重发collector二次处理身份。

差别仍必须声明：B收到时PGinbox耐久，不要求CH已发布；published才是CH+PG提交，统计ready再看final。B有额外prepared JSON耐久存储；仅9正式PG正文表清零，不说整库只有metadata。研究receipt为prepared SHA而非wire来源证明，未接独立fsync pending删除日志/签名pending备份、真实daily/identify/revenue副作用。pending1000/16MiB、lease30秒/maxAttempts5显式受限，未证明全局公平/年龄。旧严格5000FAIL保留，本次即使通过也不能称原公开契约已通过或生产SLO。

## 快照/同步路径

当前实际工具只有环境status及配置draft读写，没有文件系统快照创建/导出/上传接口。官方onboarding说明只有用户产品发布环境会建立快照，draft不执行也不快照；不能臆造finalize。尚未核实产品发布的排除机制，不能保证只包含bundle而排除运行卷密钥；因此当前不发布、不重建环境、不共享镜像。安全待传对象仅Git bundle（Git对象），排除runtime/keyDir/dataDir、数据库卷、凭据与环境文件；此名单不是工具已完成排除的声明。父协调原Git预配路径/平台支持传输，坏编码段不用。
