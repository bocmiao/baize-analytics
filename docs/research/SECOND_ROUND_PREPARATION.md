# 第二阶段准备：只读盘点，不替代原验收

用户授权顺序：先结束 `7fbb561` 的在跑负载与新镜像本地验收并保存证据，再有边界复查原 F01–F66/P2；父线程提供第二轮竞品和技术研究结论，随后落实与打磨应用 UI。任何阶段不触发 CNB 同步/流水线或 GitHub Actions，不购买服务、安装外部技能或创建生产凭据。

## 当前执行器技能盘点

2026-10-10 仅只读检查，未修改技能或读取凭据。`skills.list executor` 返回空；cloud 仅环境运行与 onboarding setup。仓库及检查的 `.agents/skills` 未发现应用设计技能。

| 已存在技能 | 位置 | 适用性 |
|---|---|---|
| documents | `/home/agent/.codex/skills/builtins/documents/SKILL.md` | DOCX，不是 React UI |
| pdf | `/home/agent/.codex/skills/builtins/pdf/SKILL.md` | PDF 渲染，不是应用布局 |
| presentations | `/home/agent/.codex/skills/builtins/presentations/SKILL.md` | Slides，不能外推网站风格要求 |
| spreadsheets | `/home/agent/.codex/skills/builtins/spreadsheets/SKILL.md` | 表格文件，不是应用看板实现 |
| cloud-environment-runtime | 当前 cloud skill package c0 | 运行环境指导 |
| onboarding:setup | 当前 cloud skill package c1 | 环境初始化；用户已授权的应用开发不受旧初始化-only范围限制 |

当前没有可应用的 frontend-design/UI/UX 技能。若父所在执行器另有技能，获得其具体原文后再按适用指引使用；不假称已用、不盲装，也不把幻灯片格式规则当网站规范。没有应用 UI 技能不阻止依据实际研究、现有 React/CSS/ECharts 与可访问性验证进行改进。

## 冻结源性能诊断准备

`7fbb561` 的 5000 事件测试仍运行。中途 1000→2000 的耗时增加已经实际记录，但不冒称最终通过、性能 SLO、瓶颈占比或容量上限。

A 仅只读源码发现：统计读取会 hydrate 全部 selected 保留事实闭包。044 按 run/kind、逐上传批读取 CH 与成员并验证；047 五 kind 同样读取，其中会话/检查点归属 INSERT 和 carry key owner SELECT 存在行级 SQL。嵌套读取已复用同事务 TEMP；前周期比较仍另开读取事务。`ClientRead` 仅表示 PG 等客户端，不证明 CPU/网络的耗时比例。

后续可实测的最小优化候选：

- 对每个有界批次做 set-based owner 插入和 anti-join 校验；保留 exact owner、HMAC、hash、count 和墓碑拒绝。
- 有界预取批次成员，不放大总正文/内存读取预算；CH 每个已发布 attempt 仍明确白名单。
- 当前/前周期查询共享同请求、同站点、同持锁 RR client 的认证上下文；不跨请求或 commit 缓存证明，不跳过最终 epoch/删除/来源检查。
- 不能只按时间过滤批次而丢失跨界 session、carry 或历史贡献；需要可信范围和闭包证明。

这些是准备方向，尚未实施或验证优化效果。原负载和镜像验收使用冻结源继续，不用后续优化覆盖基准，也不改变原实验限制。

## 原计划覆盖复查：待实作的窄范围

以下为 B/C/E 只读回交并经根核对的源码缺口，不是新的通过证据。原负载和镜像结束后分文件落实；不重开已关闭删除、签名恢复或许可审计。

| 负责人 | 入口与缺口 | 后续验收 |
|---|---|---|
| B | `Connectors.tsx` 模型设置未提交 `automaticAnomaly`，Google 设置未提交 `dailyGsc`；后端缺省 false，使界面保存无法启用这些既有任务 | 真实界面保存、读回非秘密设置、调度流程；外部运输仍明确模拟 |
| E | 保存报表只传日期，未初始化当前页面、渠道和 UTM 筛选；已有报表更新及成员角色更新 API 缺用户界面入口 | 保存当前筛选后重开；管理员修改角色、权限变化 |
| C | 热图点击排除规则缺核心已支持的 ignore/private/mask 标记；安装界面缺可选同意横幅片段，横幅固定中文 | 浏览器验证私密点击不采集、同意前拒采、可选横幅和中英固定文案 |
| D | 回放窄屏适配缺少明确布局处理 | 先以真实窄视口确认溢出，再修复并验收；不把源码推测冒称已复现 |
| 根/E | 主清单仍有旧 canonical/问数/恢复“在制”文字 | 同步为当前已验主体与准确规模、镜像、真实外部边界；保留历史失败 |

模型连通测试 API 已有但无界面按钮，其空站行为须先确认再补入口。SEO 转化对照已接线，但专用真实数据库/浏览器证据需有界核查。二者不属于需要购买外部账号才能编写或验证的功能。
