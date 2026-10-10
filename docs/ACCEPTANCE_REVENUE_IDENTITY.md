# 收入归因与身份专用视图验收

`GET /api/v1/sites/:siteId/revenue` 使用与看板相同的查询、时间边界和筛选口径，返回各币种金额、逐小时币种/订单趋势、最近一次非直接渠道及页面实例归因。收入不跨币种相加；旧汇总缺少币种时明确不支持。返回 requested/effective 时间与 rangeStatus，未来时间不会生成假零趋势。

`GET /identities`（相同站点前缀）只在 standard 模式提供脱敏 userKey；关联 identity_bindings 的事件时间段，跨设备按同一身份合并，匿名历史、切换账号后的片段以及 tombstone 不属于该身份。各行包含会话、页面、自定义事件、各币种收入、首次/末次事件。`GET /identities/:userKey/activity` 返回脱敏事件、绑定段 visitorKey 与实际观测到的会话边界/标识，不返回原 user_id 或持久化身份 hash。

注册→付费使用可选择的 `registrationEvent`（默认 `signup`）。signupCount 是所选窗口有注册事件的独立身份数，paidAfterSignup 是同一身份在注册事件时间之后收到正收入的身份数，conversionRate 为两者比例。先付费、直接付费、零收入和负退款不当成注册后付费；多设备共享已验证的时间绑定身份。evidence 明确只覆盖所选明细保留窗口，不推断窗口之前的注册或之后的付费。daily_salt 不支持此身份分析。

所有接口校验站点权限。身份查询最多 90 天、10000 事件，保留期不足或截断明确状态/coverage，注册转化指标在 coverage 不为 1 时为 null。身份 path/channel/UTM 筛选尚未支持，返回 `unsupported_identity_filters`，不会静默忽略。收入筛选沿用看板实际事件筛选。

实际原生 PG 的 `tests/integration/revenue-identity.test.ts` 五项通过：货币/归因/订单趋势，匿名及账号时间段隔离/删除，daily 模式及筛选拒绝，跨设备注册先于付费并排除直接付费，以及冻结时钟的未来窗口裁剪。初次 fixture 缺少 stats_hourly.generation 导致 setup 失败，已修 fixture 并复测通过。浏览器专用视图由 web 代理接入，本文件不将未运行的浏览器结果算作后端通过。

分位修复：TDigest 库 continuous 模式按 centroid 中心线性插值，25 个值 100 加 1 个值 10000 的 p75 曾被计算为 5430.77。现在按保存的 centroid 权重计算 Type-7 样本排名，再在相邻排名之间插值，重复点质量不被摊到离群值之间。不展开样本，保留跨桶不等样本权重。压缩 centroid 仍以均值近似，不能恢复被压缩的原始分布。新增重复点/尾部权重测试和既有六点 median=350 回归通过；真实 collector→worker→stats 的 25:1 样本 p75/p90=100 通过。
