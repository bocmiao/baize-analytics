# 同类型三批 CH 正文读取后续切片

## 当前验收入口（唯一当前表）

| 源/阶段 | 实际证据与边界 |
|---|---|
| 66150be正式全轮 | actualEXIT0/cleanup：55文件215单元+156文件426真实集成=641PASS/0skip/0unhandled；30E2E（28真实Chromium+2日期）全部PASS，约1.5分钟；lint/type/SDK/journal/build/migrate/compiledentry全部PASS |
| 66150be固定负载 | 1000PASS，finalHTTP5.047623651秒；5000整体FAIL：4350accepted/13unsent/35delayed、drainfalse120秒；已接受4350最终PV4350/coverage1/sourceCH，六完整性断言PASS，finalHTTP21.102973929秒；不是5000或SLO通过 |
| 最新镜像/远端状态 | 新镜像尚未完成；本地HEAD e441存在，HTTPS认证失败导致push尚未确认，不操作Git或托管 |
| 66150be独立静态/单元 | type/lint/215单元PASS，不代替正式全轮结果 |
| 0a提交前摘要绑定专项 | 19真实定向PASS，仅对应precommit源码摘要，不是全局计数 |
| c890后端（历史源） | 211单元+421真实集成=632PASS，未外推661 |
| 1c1cb65浏览器/镜像（历史源） | 30检查=28Chromium+2日期PASS；镜像EXIT0，均绑定1c非661 |
| 1c1cb65固定负载（历史源） | 1000PASS，5000FAIL，不称SLO达标或661结果 |

托管不触发。以下更新段全部是明确SHA对应的历史阶段原文：其中“当前/最新”仅指各历史时点，不构成另一个当前入口。bd未捕错误、0a类型FAIL、测试WIP两FAIL、1c负载FAIL及所有原来源完整保留。

## 历史SHA阶段记录与原契约

**当前66150be测试窄修**：完整type/lint/215单元实际EXIT0，src/db/packages与0a相同；19真实precommit专项仍只证明此前摘要绑定源码，不是完整全轮。0a正式入口实际EXIT2（TS2749），unit/int/browser/image未运行；随后测试WIP首次213/215单元通过、2FAIL，类型与event-capable mock窄修后215PASS。先type后追加测试导致旧报告外推的失误已记录，不掩盖。661新full/image/load待；bd未捕获错误、0a类型FAIL、测试WIP2FAIL及1c负载FAIL原证据保留。

2026-10-10 UTC。`0e3a125` 已保存完整1c负载失败；该失败不被本候选覆盖。当前三批读取代码是未提交WIP：轻量7单元、类型和lint通过，真实PG/CH专项5文件21项已实际PASS/0skip，含新增3项、原fact-store14项、source1项、strict worker1项、partial deletion2项；源码摘要绑定未提交工作树（`fact-triple-real-source.json`），不能替代新完整冻结或负载。

候选将044同kind读取由原最多2批改为一次最多3批，目的是减少HTTP往返。不是跨请求缓存，不修改manifest SQL或站点锁生命周期，也不提高统计/完整性承诺。

每批仍最多100行，101行sentinel仍用于显式发现超量；单响应16MiB限制保持。整个组合完成hash、producer HMAC、receipt归属、epoch与删除fences认证后才yield，不能先输出前批掩盖后批失败。组合失败必须失败关闭，不能回退PG假零或留下后台读取。

候选大小依据：当前最大单行33027个 UTF-8 字节，base64 编码最多44036字节；三批含sentinel按303行计算，编码正文合计44036×303=13342908字节，另计固定UUID、hex键和JSON framing，低于16MiB。forward-slash转义设置为0以避免额外膨胀。实际响应仍须通过原16MiB检查；此估计不是所有未来正文永远适配的保证，实际超限继续拒绝，不能静默丢行。

真实target正确性已通过上述专项；新完整冻结及完整窗口1000/5000收益仍待测。减少RTT不等于整体查询提速、内存/SLO达标或修复1c5000失败；原4900accepted/2unsent/39delayed、排空deadline及未执行最终断言完整保留。后续只按实际不可变source与原同口径基准记录结果，不重开已闭合产品范围，不触发托管。

## bd3f51f/a9b49e7 实际后续状态

三批候选已提交，7单元与21真实专项PASS；该专项不抵消完整冻结实际EXIT1。完整结果213单元PASS，集成424检查423PASS/1skip，uncaught PG25P04 error1，浏览器NOT RUN。runner漏env造成skip，下一复验使用正式validate-local-final.sh入口。C idlefatal修复已保存0a0c171，第四轮precommit摘要绑定19真实专项与10单元通过；新全量/镜像/负载仍待。旧1c30浏览器/image及负载FAIL继续按旧source保留；不得据候选正确性专项称负载提速/SLO。

0a0c171包含三批候选及idlefatal修复。第四轮实际19/19 PASS（11budget+4server+3triple+1strictrestore）、0skip/0uncaught，另10单元/type/lint通过；这是提交前源码摘要绑定定向证明，不是新全局计数。原前三轮FAIL及bd完整EXIT1全部保留。0a新完整空库、镜像和固定负载正在准备，不预写通过；旧c890632、1c30/image、1c1000PASS/5000FAIL各按原源码阶段保留，不外推0a。
