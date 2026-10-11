# B真实CH研究负载（未接入正式入口）

不可变源码：`b7f0362ac9b817b15692b601959969f3bdce677f`。标准prepared研究接口，不将received替代正式accepted，也不改变生产collect。5000已完成EXIT1，原失败保留，不把已接收完整性通过改称容量通过。

## 300初始化闸（不是容量结果）

实际EXIT0；300received/300validated/300published，0未发送、0请求/查询/探针失败；后台排空，7finalchecks全部通过，真实HTTP PV300/coverage1/CH。canonical301/UV7含1条bootstrap，9正式PG正文表0，outbox/generation对账。最终HTTP1448.428ms，独立PGschema/CHnamespace/app/temp均清理true，源码前后不变。[原始结果](performance/producer-canonical/inbox-b7f0362-300-pass/)。finalMetadata.inbox.readiness在final断言前采样false，断言后phaseMetrics.research.readiness=true；这是阶段采样差别，未隐去原字段。

## 与原负载的相同条件及差别

固定每批50页事件、每批新visitor、5paths、1秒调度、独立10秒真实HTTP查询、queue8/concurrency2、drain120秒；5000为100批，300仅为6批接线闸。Node与app/harness同进程，4CPUquota/32GiB内存上限；RSS不含PG/CH/Redis。

沿真实public shadow/verify/activate、五类签包/proof和受保护prune初始化strict；不直接写authority/body_mode跳过门槛。沿原后台worker，非手工触发聚合；sameclient真实preparedCanonicalPublisher完整CH读回、PG receipt/outbox提交，outbox事件型变更标记沿原collector set_config机制。

使用原WireBatch schema/defaults、同源cleanEvent纯函数、共享eventDimensions/anonymizeIP，在内存准备脱敏事件，不持久原IP/UA；脚本核对cleanEvent源码相等并记录摘要，实际维度keys从数据采样。不会以空维度降低归约工作量，也不重发collector二次处理身份。

差别仍必须声明：B收到时PGinbox耐久，不要求CH已发布；published才是CH+PG提交，统计ready再看final。B有额外prepared JSON耐久存储；仅9正式PG正文表清零，不说整库只有metadata。研究receipt为prepared SHA而非wire来源证明，未接独立fsync pending删除日志/签名pending备份、真实daily/identify/revenue副作用。pending1000/16MiB、lease30秒/maxAttempts5显式受限，未证明全局公平/年龄。旧严格5000FAIL保留，本次即使通过也不能称原公开契约已通过或生产SLO。

## 快照/同步路径

当前实际工具只有环境status及配置draft读写，没有文件系统快照创建/导出/上传接口。官方onboarding说明只有用户产品发布环境会建立快照，draft不执行也不快照；不能臆造finalize。尚未核实产品发布的排除机制，不能保证只包含bundle而排除运行卷密钥；因此当前不发布、不重建环境、不共享镜像。安全待传对象仅Git bundle（Git对象），排除runtime/keyDir/dataDir、数据库卷、凭据与环境文件；此名单不是工具已完成排除的声明。父协调原Git预配路径/平台支持传输，坏编码段不用。

## 原参数5000实际FAIL（b7f0362）

100scheduled/98sent/97研究202，4850received/validated/published，1请求HTTP429（batch89），2queue_full_unsent（90/91），50rejected。429响应错误码未记录，源码允许pending条数或字节背压，因此不把具体原因写成直接观测事实。查询12次、query/probe/publisher failures均0；backlog峰2400，最终0，drain在120秒内完成。

7finalchecks均PASS：实际HTTP PV4850/coverage1/CH，canonical4851/UV98含bootstrap，9正式PG正文表0，outbox4851全done、generation/水位精确对账。最终HTTP **25485.582ms**，总体wall **226.525秒**，Node child峰 **666872KiB**（不含PG/CH/Redis）。原始sourceDigest前后相等、所有ownedcleanup=true。`finalMetadata.inbox.readiness=false`仍是final前阶段采样，phaseMetrics末尾true不表示100批容量通过。

接收HTTP累计90728.735ms，HTTP site_lock累计84644.432ms/max10438.661ms，约93.3%（这些是包含等待的累计调用时间，不是CPU或总wall拆账）；统计HTTP累计144759.325ms/13次（含final），认证46492.477ms、TEMP27095.910ms、SQL4267.702ms，嵌套不相加。worker12次，其中10delta/2full，复用session累计230、重建99、produced effects136452、hydrated effects309705；是跨run累计工作，不是唯一会话/事件数。publisherPump独立CH成本未被HTTP ALS观测上下文覆盖，不能报零。

[原始JSON/日志/plan/wall/阶段摘要](performance/producer-canonical/inbox-b7f0362-5000-failure/)。与A72收到4700的工作集不同、B回执也不同，因此不宣称因果提速；final25.49秒仍慢。

## 下一项有证据的隔离候选（在制）

接收仍取与CH/查询共用的site独占门，并未真正解耦；本轮以此可测锁等待为依据，准备默认关闭的independent admission。只在原型：receive shared P→独立admission事务锁→plain parent读取/容量检查/插入；publish P/site→原锁但不长持parent FOR UPDATE，避免FK keyshare仍阻塞接收；delete P/site→原锁→admission→parent FOR UPDATE，等所有先开始接收提交，再完整负向清理/ACK。模式持久绑定，错误实例拒绝；来源解释变更不自动重绑旧body，发布仍fresh epoch/receipt/HMAC白名单。

新候选先确定性屏障回归（接收/发布并发、删除/接收、FK锁、容量、模式），再同SHA300阶段比较，有意义后才原参数5000。不能释放查询删除门、增加pending预算或放宽deadline凑绿。生产独立fsync pending日志/恢复尚欠，故仍不默切正式collect。
