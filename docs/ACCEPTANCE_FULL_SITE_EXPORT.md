# F49 整站事实导出补齐验收

本批新增site-export.ts静态38表/列允许清单。每张允许表最多100000行，SQL最多取100001行以判定超限；超过即固定export_limit_exceeded，任务失败且不发布部分文件，不静默截断。published迁移未重写，没有新增生产凭据或部署。

原导出遗漏的长期事实已纳入：visitor_first_seen、identity_map/identity_bindings、收入订单、GSC/GA4聚合、SERP历史、SEO扫描、AI不可变证据/建议/预算，以及机器人统计、定义、实验事实、审计与无密钥的通知/分享/外部配置元数据。原raw/events、EAV、会话、小时/日汇总、vitals、回放/热图仍保留。38表逐列固定投影，未来新增字段不会自动进入文件。

只读取当前站点；无site_id的experiment_assignments通过experiment父表关联，建议与证据、实验贡献与实验、通知/计划与其父记录检查站点边界，发现跨站FK异常拒绝完成。不导出系统users/auth_sessions/site_members/api_tokens/site_invites/OAuth/SSO/实例密钥，连接器和通知渠道只保留无secret配置/元数据，不输出encrypted/密码/token_hash/API或License Key。原始任务lease、outbox、路径与存储内部任务状态不作为可重放迁移任务导出。manifest明确排除项、源与实际输出行数、100k上限和恢复政策。

每日盐模式复用tracker MIT stableIdentityKey规则清洗历史JSON与EAV：稳定身份别名、邮箱形状值不进入文件，非敏感boolean等事实保留；身份绑定/映射/跨日first_seen/实验身份等不支持的表明确列privacy_omissions，不能通过导出绕过不支持跨日留存的隐私边界。标准模式保留站内已脱敏身份事实；不把业务identify的HMAC当成明文用户标识。

事务保持beginPartitionSnapshot→lockSite的分区gate/站点锁，所有表使用现有exportClient，不另借pool；同一RR快照读取多表，原lease令牌、完成前检查、删除撤销下载及独立文件清理保护继续生效。真实metadata显示source=postgres/transaction_snapshot_requires_postgres，不能宣称治理导出已经读CH。日报summary/previous也复用既有c，避免持gate后借同池连接。

## 实际测试

新增governance-full-export.test.ts使用隔离真实PG schema和生产createApp：管理员→站点→真实/api/collect（pageview/identify/custom event/vitals/revenue）→生产worker，再为每个长期事实表建立明确本地数据库fixtures。GSC/SERP/AI fixtures不是提供商响应，不算真实外部账号或模型质量测试。

- 所有38个允许表均有实际记录；实际JSON导出，CSV由独立解析器读回，逐表对账一致。audit_logs因第二次导出新增审计记录，验证原记录均保留及新增一条，而不是掩盖该预期差异。
- 来源、金额、身份绑定、建议evidence FK及允许表manifest逐项核对；其他站点内容、用户认证信息、密钥字段及加密凭据不进入文件。
- 每日盐历史customer_id/设备别名EAV及证据实际PG fixtures被清洗，boolean保留，身份表清空并manifest说明。
- 真实PG插入100001条rank_history后全量导出固定失败，无下载文件，没有只导出前100000条。
- 实际跨站evidence FK异常导致任务失败，不输出另一站点证据。

首次新增专项4测试3通过/1失败（07:44:40）：测试误期望identify存明文business-user，实际生产是HMAC。修正为对真实identity_bindings.user_id及64位hex核对，保留导出完整性与不泄密断言，不改生产身份保护。随后专项4/4通过（07:45:20，3.05秒）；影响范围governance*与api-errors于07:48:01实际8文件38通过、0失败/跳过（11.48秒）。严格列投影最终版本于07:48:43重跑8文件38测试通过、0失败/跳过（9.56秒），所属lint与全仓类型检查EXIT0。

```sh
./node_modules/.bin/eslint src/server/site-export.ts src/server/governance-worker.ts tests/integration/governance-full-export.test.ts
npm run typecheck
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev ./node_modules/.bin/vitest run tests/integration/governance*.test.ts tests/integration/api-errors.test.ts
```

这是整站非secret事实的JSON/CSV读取与逐表对账，**没有新增自动JSON导入器**，不能称自动迁移恢复已实现。数据库备份/恢复是独立ops验收；此文件不包含盐/凭证/权限，继续开发使用原身份关联需独立安全备份与密钥流程。恢复必须先应用独立删除日志、重建统计/失效缓存和旧任务，不直接重放导出中的历史计划或任务记录。大规模持续导出内存/吞吐不由这38个小fixture及单表100001边界测试证明。


## F60 forward additive fact (030)

After F48's independently verified39th GA4 window table, F60 adds the40th explicit safe table `ai_question_evidence(call_id,site_id,evidence,created_at)`. No secret, raw auth identity, system user, unknown/future column or dynamic SQL table selection is added. Composite FK requires the call to belong to the same site; trace JSON uses the existing secret/privacy scrub. The full-export actualPG JSON/CSV readback fixture populates this fact too. Its four tests pass within the F60 five-file24/24 run09:12:14UTC; original earlier failures/results above remain unchanged. This is fact readback, not a promise of JSON automatic import.


## AI deletion/restore guard correction

Current-epoch filters were added for initial AI calls, suggestions and final traces after root found that derived AI facts were missing from deletion invalidation. The conservative same-client site AI purge physically erases old snapshots, prose and suggestions while retaining quota ledgers. Full JSON/CSV after actual visitor deletion contain no old AI content; old cached files are physically unlinked, and inserting old AI rows back cannot bypass epoch guards or changed=false journal replay. The production max1 API/privacy test4/4 passed09:30:55UTC. This corrects the lifetime boundary; prior40-table readback passes alone did not prove deletion safety. See `ACCEPTANCE_AI_QUESTION_EVIDENCE.md` for exact scope and the distinction between SQL fact restoration/helper tests and whole-Docker backup/restore.


Privacy/export final regression: the combined eight-file run at09:35:22 UTC passed29/29, including actual max:1 production question → JSON/CSV export → deletion during provider response → old files revoked and physically removed → fresh AI tables empty → restored old rows rejected by epoch and erased by journal replay. The fifth API case also rejects deletion during fresh suggestion recheck without returning old comparison evidence. Initial14/15 run failed because shared dev PG lacked031 `analytics_fact_runs`; after the authorized migration command, all original assertions passed. Full details and exact command are in ACCEPTANCE_AI_QUESTION_EVIDENCE.md. This tests row reinsertion plus journal/helper restoration, not a new pg_restore/Docker claim.
