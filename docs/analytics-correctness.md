# 统计口径与数据完整性

## Worker 发布规则

Worker 在 PostgreSQL REPEATABLE READ 快照内读取站点 generation、epoch、租约 owner、完整保留期事件及最大 outbox ID。按受影响范围与可认证的历史事实计算汇总。发布时持有同站点 advisory transaction lock，并检查相同 epoch、相同 owner、租约有效，以及 `processed_generation <= 快照 generation <= 当前 generation`。

后续采集可以继续提升 generation，不阻止较早的完整快照发布。发布仅设置 processed_generation 为该快照 generation，且只完成 `outbox.id <= 快照最大 ID` 的任务；后续事务留下的 generation 和 outbox 保持待处理。删除、恢复、重放和升级改变 epoch，使旧 Worker 不能发布。Worker 进程中断后由租约回收；连续三次处理错误进入站点级死信，管理员可查看和重放。

会话按事件时间排序，标准模式可跨本地午夜，每日盐模式不缝合跨日访客。页面实例分别关联心跳和收入，心跳以页面实例和原始可见区间去重。收入按币种独立保存；标准模式订单按站点 HMAC 去重，每日盐模式订单只按事件本地日期去重。相同订单金额或币种不一致时拒绝，重复订单的新 event_id 只保存幂等收据，不添加事件或任务。

## 查询、历史与精度

UV、会话和分位数由真实成员与贡献计算，不能简单相加每日 UV 或平均每日比率。筛选和非整点范围需要足够明细或认证事实；过期明细和无法证明的历史返回 coverage 与不可用状态。

收入按币种独立累计。旧汇总缺少币种时返回 unsupported_legacy_currency 和 revenueCurrencyCoverage；前端上报金额是业务方自述数据，不代表已付款或财务对账。

## 分位数

查询时间窗口的 `precision: exact` 表示边界未被静默向整小时扩张，并不表示压缩分位精确。vitals 显式返回 `quantileMethod: weighted_centroid_type7` 与 `quantileStatus: approximate_tdigest_centroid_means`。未压缩 singleton centroid 的计算等价于原样本 Type-7 排名插值；重复点按完整权重保持质量阶跃。不等日期/桶的样本数不会先平均各桶分位。压缩后的 centroid 以均值代表其质量，原始桶内分布不可恢复，因此属于近似估计。

## 关系化事实与历史覆盖

analytics_effect_facts 保存事件时间贡献与成员关系，analytics_vital_samples 保存数值样本。UV 在数据库内按访客去重；转换率按同一会话窗口计算分子和分母，多个目标不能重复计数。旧档缺少会话 cohort 时不能推断转化率。

最新发布 run 负责 retained_from 之后的范围，包括边界小时；此前完整小时通过历史引用保持来源。旧原始明细过期或新空 run 发布不能自动抹掉仍有效的历史引用。缺少真实 backing 返回不可用，不显示 UV=0。

删除必须先持久化独立日志，再在同一事务和站点门内失效相关事实。完整访客删除擦除贡献及样本，并保留其他访客的可认证历史。身份时间段删除可能改变整个会话；原始时序已经过期时，无法唯一还原的会话指标标为不可用。恢复后重放最新日志再重建，不能通过整站清空唯一历史来源来绕过一致性检查。
