# 白泽隔离inbox阶段检查点

2026-10-11 UTC。本轮文档提交前HEAD f3b3d33；精确最终HEAD以git rev-parse HEAD为准。最新候选源码9689ae027474a78ee2205a75f05475c928d0fd14；冻结运行目录/tmp/baize-inbox-combined-9689ae0。不覆盖早期SESSION_HANDOFF与旧FAIL。

## 已保存与结果

- 正式应用源码72ea929已有369单元/491集成/31目录=29Chromium+2日期函数、0skip；新镜像安装及独立恢复证据保留，本轮没有借旧结果宣称新整轮。
- 4d1affa独立admission：36专项0skip；同SHA300两模式PASS；原5000 FAIL4100received/published、18pending429、0未发。源/清理精确。
- 9689ae0组合消费：48专项0skip（14原PG+8 admission+8 combined PG+18真实CH）；同SHA300两周期PASS。5000 FAIL4350received=validated=published、13pending429、0未发；query/probe/publisher失败0；排空119.741秒、7finalchecks PASS，最终HTTP23.406秒，ownedcleanup全true。默认正式入口未改。
- 根/六代理已回交，当前没有运行中的重型测试。已提交源码/原始JSON/阶段摘要/STATUS；日志仍在/tmp，gitignored日志不冒称已入Git。

## 同步与保全

最后确认远端ee996754595d25f13aadac507dc4a2a6dc6b06b0；旧执行器could not read Username，无HTTP状态/已证实refresh路线。不得新token/换账户/CNB绕过。所有后续仅本地main，未称push成功。

原89184字节bundle与单ZIP保持：/tmp/baize-checkpoints-preserved-20261011/baize-ee996754-to-a6178a0b.bundle，原SHA2569b864009a378e229bb8e08de47b6e94172133f2489dc5f303177ae519d51d0aa；/workspace/baize-checkpoints/baize-ee996754-to-a6178a0b-single-bundle.zip 87479B/SHA256a81e0ed984ae15ef87b56e977ab4d37efbac009c30876a3ccff58c49f0da442d。父实际两次下载失败；坏编码片段废弃。不再换格式/猜接口/手工Base64。最新Git-object bundle另建同preserved目录，以manifest记录精确base/target/字节/hash/git bundle verify=0，不包含runtime。

## 下一步边界

当前不存在已验证能解决长期门占用的另一项最小调参。需要新封印依赖/单语句读取协议才可能免全正文搬运，详见PERFORMANCE_INBOX_PHASE_REVIEW.md；先独立协议/故障证明，不默切default、不削完整性。B正式fsync/pending恢复未接，非外部账户阻塞，明确未实现；当前性能问题也不是外部条件阻塞。

真实账号/模型、微信真机/Windows执行器/cross-physical恢复未测按STATUS保留。GitHub Actions/CNB/sync始终禁止，父最终统一放行。获准UI冻结不再扩审美。末次盘空间约/workspace2.3GiB、/tmp6.3GiB，下一重型前重新预检，无全局prune/删有效卷/源码/证据。用户原任务未声称全完成。
