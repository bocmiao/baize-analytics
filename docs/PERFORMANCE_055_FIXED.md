# 055 固定负载对照（5c02abf）

源码 `5c02abf45d1cdc235ac203e7d42f8f1a3420a008`。全空库验收 229 单元 +439 真实集成、30 检查和新镜像独立恢复均 EXIT0；此负载是独立验收，整体 **EXIT1**。

原固定调度不变：每秒50事件、独立10秒真实查询、并发2、队列8、排空120秒。未更改预算、认证、删除屏障、阈值或手动调用worker。1358 Git blob前后一致，两段四项清理全部成功。

| 段 | 实际结果 |
|---|---|
| 1000 | PASS；1000接收，未发送/延迟/失败/查询失败均0，排空和6最终断言通过；最终HTTP3.881271447秒 |
| 5000 | FAIL；5000全部接收，未发送/发送失败/查询失败0，36延迟；120秒排空失败；最终断言executed[]/passedfalse |

5000 intake99.217秒、drain122.440秒；lastBacklog2600/max3800。最后独立查询为PV2400/coverage0、11.566780636秒。finalassert窗口11.275541059秒**不是最终HTTP测量**，失败路径未保存最终HTTP时间。Node峰729063424B，只含app+harness，不含数据库。最大采样oldest queued170.650秒并非完整事件到统计延迟。

## 阶段观测与剩余

以下累计跨多次请求，部分为包含/嵌套计时，不能相加为CPU、单次最终查询或因果证明。

| 操作/adapter | stage | 调用 | 累计秒 |
|---|---|---:|---:|
| HTTP facts | CHtransport |616|27.313|
| HTTP facts |认证|7845|40.376|
| HTTP facts |TEMP填充|7229|22.265|
| HTTP facts |manifest SQL|7229|5.516|
| HTTP other |站点锁等待|107|77.371|
| background worker facts |CHtransport|5594|64.880|
| background worker facts |manifest SQL|6799|14.684|
| background worker facts |认证|1446|7.516|
| background worker facts |TEMP填充|1329|4.929|

旧d67固定5000的HTTPfacts CH2952次/65.569秒，现为616次/27.313秒，观测请求数下降；两轮接收量/完成进度不同，不宣称同工作量加速或SLO达标。仍需针对worker发布/读回的请求来源与查询重复认证/TEMP成本做独立定位，不能通过减认证、解除锁或放宽预算追绿。本轮不追加压测。

旧d67 FAIL（4700接收/6未发）、全部较低到达率容量探索、055前后各失败全轮仍保留。数千事件不证明PG日均百万、1C2G或持续实时SLO。托管CI不运行，视觉方向等待用户选择。

原始JSON：`docs/test-evidence/main-5c02abf-fixed-strict-1000.json`、`main-5c02abf-fixed-strict-5000.json`。Runner、summary随同归档。

## 本轮只读定位

`worker-facts.ts` 的既有输入读取走新hint12批/旧NULL3批接口；新事实发布仍按cursor FETCH100，`writeRecords`每批分别执行INSERT完整EOF及单attempt LIMIT101独立读回count/SHA/checksum，fresh fence之后才提交PGreceipt。`completeKind`只访问PG。当前facts transport指标混合命令、读回及输入读取，因此5594次不能准确分解，也不能由此说hint12没有生效。

后续最小定位应分别计量发布command/readback与旧输入reader，再决定是否值得修改publication协议；不能直接把读侧12批规则套到写侧。较小PG候选是vital归属每批集合校验替代逐行SELECT，必须保完整run/event/visitor/session/ts匹配与所有拒绝断言；该候选未实作、未测试，不会自行减少CH次数，不宣称收益。


## 88b90b8 分段观测：strict 300 诊断（2026-10-11）

这是小固定负载诊断，不替代上述1000/5000验收。不可变源码 `88b90b88a05c12b7786af086b429f645b9dfa74b`，Git blob前后摘要一致。原runner每秒50事件、独立查询10秒、队列8/并发2、排空120秒，缩短为6批300事件；后台worker运行，不手动追赶。实际EXIT0，300接收，未发送/延迟/采集失败/查询失败均0，排空成功，最终六项断言通过。采集5.158秒，排空6.077秒，最终HTTP1.214845秒、PV300/coverage1/CH来源。canonical301包含独立bootstrap1，outbox301全部done；九类PG正文均0。应用关闭、CH namespace/PG schema/临时文件清理全部完成。

| worker adapter | CH用途 | 实际请求 | 累计传输毫秒 | POST正文B | 读取响应B |
|---|---|---:|---:|---:|---:|
| facts | 旧事实输入 |8|137.547|0|9364444|
| facts | INSERT发布 |144|849.993|24337990|0|
| facts | 独立读回 |144|1192.689|0|19819290|
| facts | 其他 |1|5.198|0|284|
| remaining | 旧事实输入 |16|105.473|0|719487|
| remaining | INSERT发布 |22|141.561|1828220|0|
| remaining | 独立读回 |22|164.172|0|1391104|
| remaining | 其他 |1|8.685|0|408|

每个用途都是原有同一 `ch_transport` 事件的互斥分类，不新增计时事件。8组操作/adapter分区对账全部通过，包括calls、failed、累计耗时、请求数与各字节字段。facts发布144批读回验证14200派生行，不是14200个新采集事件；同一个输入可产生多类事实且增量期间有多次重建。

`worker_facts_wall` 5次累计9510.809毫秒、单次最大5404.256毫秒；包含PG/锁/认证/CH/校验。facts独立读回完整墙钟144次累计1274.566毫秒，包含其1192.689毫秒CH叶子计时和解析/长度/hash/checksum校验，不能两者相加。remaining对应22次墙钟172.437毫秒。累计调用时间不是一次查询延迟，也不等于CPU耗时；没有将未覆盖的worker成本归因给某段PG代码。

请求数只在facts/remaining实际fetch派发处计数；其他adapter未测字段为null，不冒充0。POST正文/SQL字节为UTF8，响应是实际读取chunk（包括失败前已读部分）；不含URL/头/TLS/压缩及网络wire开销。原 `bytes` 保持既有响应定义，不能再加 `responseBodyBytes`。墙钟与其子阶段不可累加。

本批完整单元243PASS/0FAIL/0SKIP EXIT0；7文件31真实PG/CH项PASS/0FAIL/0SKIP EXIT0；lint/typecheck EXIT0。首次单元242PASS/1FAIL是观测字段白名单旧预期，已修正复验；首次lint两项为冻结原型CommonJS require，添加仅该验证文件的规则例外后通过，未修改原型视觉/源码。初次失败和最终日志均保留。此观察范围未重跑浏览器或Docker，也未触发任何托管CI。

原始诊断、分区对账、单元/集成JSON与首轮失败日志：`docs/test-evidence/main-88b90b8-ch-phase-*`。UI v2两次视觉交付均未获用户认可，已冻结，等待成熟产品真实界面审美基准；功能测试通过不构成UI设计完成。


### 下一项优化决策与边界

当前选择的是PG逐条归属/成员/完成校验的有界集合化候选，而非扩大CH发布批次。先分别观测 `buildSessionFacts` 归约、remaining逐条ownership、成员INSERT及完成验证的调用数/累计/墙钟，确认贡献后才改为每批最多100条集合SQL；每条归属匹配、PK/FK、rowCount完整性及所有拒绝必须保持，不以ON CONFLICT吞错。这条候选不要求改变CH发布协议。它尚未实现，尚无收益证据。

每次dirty claim重建保留范围导致14,200条派生发布，不能把它们等同于300输入或简单去重丢弃。降低重复全范围重建需可信会话闭包和贡献supersession，涉及迟到、跨日carry、删除epoch和失败发布，属于更大协议变更：先给方案/风险，不直接实施。将多批INSERT/读回合并也涉及partial失败、孤儿attempt和逐批receipt；本批没有采用。

观测sample缓冲达到上限（samplesTruncated=true），总体聚合仍持续累计；invalidObservations=0。`json_serialize`仍未instrumented，其他adapter用途/请求字节未全量覆盖。因此本轮不是完整成本分解，不把9.511秒减去若干包含计时后的差值命名为PG耗时。Node最终阶段峰610942976B（app+harness，不含PG/CH/Redis）；300样本不用于容量承诺。
