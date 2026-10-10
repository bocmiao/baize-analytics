# 有界事实合批读取候选：只读评估

本记录仅为后续候选设计，**未实现、未实测**。当前生产读取仍最多三批；未创建055迁移，未增加byte hint、12批读取、SELECT JSONEachRow协议或备份v2。下一步优先探索普通PG与strict模式各自的低速容量包络，不增加batch数掩盖现有慢查询。

## 实际源码与证据边界

本评估绑定 `d67bb8aeda34652010125e889019392aaa0788f8`。只读核查时HEAD为 `87e1f64531d0d25b193fc2982726170179aea52f`，以下两文件与d67字节相同：

| 文件 | SHA256 | 现有合同 |
|---|---|---|
| `src/server/fact-store.ts` | `9275f8cd1944479221d5d5e39364924a3bbd969cc37c8a2de65a82af54c586d0` | `streamRunRows` FETCH3、按kind分组；每attempt LIMIT101；每输出批最多100；全部认证后yield |
| `src/server/fact-body-backup.ts` | `34958fdf534cf0f5f0428f9a81e853883c86bd547a138a90a7fe5fd1806d7aed` | v1签名包；metadataChecksum覆盖三张metadata表的完整`to_jsonb(t)`行 |

具体入口：`fact-store.ts:49`保留16MiB完整响应读取及显式server exception拒绝；`:66`提交batch receipt；`:77–86`三批读取与逐记录认证；`:88`精确删除后更新row_count/checksum。`fact-pair-response.ts`保留base64规范编码、fatal UTF8、重复key、各attempt数量检查。`fact-body-backup.ts:13–15`生成metadata checksum，`:26–28`验证原签名与目标PG快照一致。

父进程已保存的d67单轮实际结果为：1000 PASS、final HTTP约4.538秒；5000整体FAIL，4700 accepted、6 unsent、38 delayed。5000 drain reached，已接受数据六项最终完整性断言PASS，final HTTP约23.714秒。HTTP facts观察累计CH 2952次/65.57秒、约1.46GB，authentication约42.66秒、TEMP约30.39秒。阶段嵌套及并发时间不可相加为墙钟或CPU占比；结果不证明单项因果收益，也不满足5000计划或性能目标。本评估没有重新执行这些负载。

## 可选后续byte hint合同

hint仅用于调度，不能替代正文认证。producer只能从本次实际生成并上传验证的sealed body计算；迁移不得猜测legacy正文大小。NULL receipt继续原最多三批路径。新hint若将来获批，reader最多12个同kind manifest，且保守响应上界之和不得超过原16MiB；正常输出仍按原100条批次交付。

现有SELECT使用`FORMAT JSON`，除了base64数据还含meta、statistics和格式化framing。单纯相加body长度并加一个未经证明的常数，不构成完整响应上界。可选方案之一是仅对合批SELECT采用固定普通JSONEachRow编码：字段、读集、ORDER BY、每attempt LIMIT101均不变；不使用progress/pretty格式；完整EOF和终端exception检查仍必需。这只是待授权的传输编码设计，本批未变更协议。

在固定serializer合同被证明后，可按下式计算保守预算：

```
每batch hint = Σ(4 * ceil(actualSealedBodyBytes / 3) + ROW_FRAMING_BOUND)
             + 44036 + ROW_FRAMING_BOUND
```

最后一项预留第101条sentinel。现有合法normalized正文上限32768 UTF8字节，sealed envelope额外上限259字节，base64上限44036字符。普通JSONEachRow所投影字符串均为UUID、hex及base64 ASCII；可研究512字节的逐行framing保守值，但**尚未证明或验收该值**。若继续FORMAT JSON，则还必须证明全响应meta/statistics和framing上界；不能借单次实测代替保证。

hint与实际响应都必须受检查。hint低估、实际编码超过所声明预算、16MiB超限或整操作累计SELECT/decoded-byte/deadline超限均应失败，不拆分重试吞掉超限，不返回部分coverage1。任何故障sentinel或额外行也须拒绝；不要求非法正文靠分组重试变为成功。

可选独立HMAC可绑定site/run/kind/batch/attempt、不可变source provenance及hint，防止跨batch替换或修改hint。可变aggregation epoch不应混入此不可变绑定，否则正常rebase会使其失效。NULL和hint/seal应成对，非整数、越界、缺seal或不匹配在请求前拒绝。现有manifest checksum只覆盖row_key/body_hash，不自动认证新增hint。

精确删除后原hint仍是保守上界，可原样保留；不能仅凭row_count降低它。重新计算需读取并认证实际幸存正文。独立restore经现有`writeRecords`从实际目标重封装正文生成新hint；不会把源hint当目标正文真实性证明。

## 旧签名备份兼容风险

新增nullable列仍改变`to_jsonb(t)`，因此旧v1包在升级目标直接用当前完整行校验会不匹配。不能动态忽略未知列、试多个checksum或取消原HMAC验证。

可选后续设计是显式v2 metadata profile及HMAC域：新包完整认证新增字段；旧v1恢复仅对batches投影剔除明确的055新增字段，保留所有原字段、行顺序、原签名和原checksum。也可让新包继续使用固定v1列投影，但此时hint必须始终是非权威调度metadata并在恢复时重算。两种方案均未实现，需由备份owner审查旧包与新包的实际roundtrip及篡改拒绝。

## 授权前需要的验证与预期作用

必要验证包括：合法最大Unicode/slash正文、sentinel101、12批末批故障无early yield、混kind尾及NULL路径、hint低估/篡改/越界、累计预算typed拒绝、删除保守hint、恢复重封装hint、旧v1原签名包升级恢复、新包metadata篡改，以及max1事务/连接清理。此次没有执行这些测试。

预期作用仅是减少CH合批SELECT次数和网络往返；不会自动减少逐记录SHA/HMAC或TEMP写入，也不会改变PG manifest查询次数。保持站点锁、同RR snapshot、source/deletion epoch fence、完整认证与原响应/操作预算。不存在跨record、跨请求、跨epoch缓存，未修改CH ORDER BY或权威模型。若serializer或备份兼容证明不能闭合，应停止此候选，保持当前三批实现。
