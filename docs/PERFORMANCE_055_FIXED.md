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
