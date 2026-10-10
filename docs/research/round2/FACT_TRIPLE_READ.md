# 同类型三批 CH 正文读取后续切片

2026-10-10 UTC。`0e3a125` 已保存完整1c负载失败；该失败不被本候选覆盖。当前三批读取代码是未提交WIP：轻量7单元、类型和lint通过，真实PG/CH专项5文件21项已实际PASS/0skip，含新增3项、原fact-store14项、source1项、strict worker1项、partial deletion2项；源码摘要绑定未提交工作树（`fact-triple-real-source.json`），不能替代新完整冻结或负载。

候选将044同kind读取由原最多2批改为一次最多3批，目的是减少HTTP往返。不是跨请求缓存，不修改manifest SQL或站点锁生命周期，也不提高统计/完整性承诺。

每批仍最多100行，101行sentinel仍用于显式发现超量；单响应16MiB限制保持。整个组合完成hash、producer HMAC、receipt归属、epoch与删除fences认证后才yield，不能先输出前批掩盖后批失败。组合失败必须失败关闭，不能回退PG假零或留下后台读取。

候选大小依据：当前最大单行33027个 UTF-8 字节，base64 编码最多44036字节；三批含sentinel按303行计算，编码正文合计44036×303=13342908字节，另计固定UUID、hex键和JSON framing，低于16MiB。forward-slash转义设置为0以避免额外膨胀。实际响应仍须通过原16MiB检查；此估计不是所有未来正文永远适配的保证，实际超限继续拒绝，不能静默丢行。

真实target正确性已通过上述专项；新完整冻结及完整窗口1000/5000收益仍待测。减少RTT不等于整体查询提速、内存/SLO达标或修复1c5000失败；原4900accepted/2unsent/39delayed、排空deadline及未执行最终断言完整保留。后续只按实际不可变source与原同口径基准记录结果，不重开已闭合产品范围，不触发托管。
