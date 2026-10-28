# 白泽 v3「素」实施规格（给编码代理）

> 设计稿：`docs/design/v3/`（把 /workspace/baize_v3/design 整个拷进仓库该目录；打开 `index.html`，每屏支持 `?theme=light|dark`）。
> tokens：`design/tokens.css`（可直接引入）与 `design/tokens.json`。
> 基线分支：`ui/v2-polish`（PR #7）。**不改后端接口和数据模型**；只改 `src/web/` 下的样式与组件结构。任何设计稿里的数字都来自现有字段，不新增后端能力。

## 0. 总体方向
从"墨玉侧栏 + 玉色大面积 + 金/朱砂装饰"改为 Vercel/Plausible 式"中性色为主、玉色只做数据与焦点"。
- 品牌识别保留：方块「泽」标识、玉色数据线、"知万物之情"口号、朱砂作为下降/错误色、金作为警告色。
- 删掉：深色侧栏、首张 KPI 墨绿实底卡、金色走势线、实时墨绿卡、登录页左侧墨绿大图、各处玉色实底按钮。
- 主按钮改为黑底白字（深色模式白底黑字），玉色不再做按钮底色。

## 1. 全局样式（src/web/style.css、design-v2.css、theme.ts）
1. 新建 `src/web/design-v3.css`：内容 = `tokens.css` + `style.css` 中的组件类（可改名加前缀 `bz-`，避免与旧类冲突）。在 `main.tsx` 第 45-46 行把 `design-v2.css` 换成 `design-v3.css`；旧文件保留到 v3 验收后再删。
2. `theme.ts` 的 `ChartPalette`：
   - jade → `--chart-1`（浅 #1F7A68 / 深 #3DBA9C）
   - 对比期 → `--chart-prev`（#B5B5B5 / #4A4A4A，虚线 4 4）
   - grid → #F0F0F0 / #1A1A1A；axis 文本 #A3A3A3 / #5E5E5E
   - area → 主色 16% → 0% 纵向渐变
   - tip 背景 = surface，边框 border，阴影 shadow-pop
   - gold/cinnabar 只在多分类时作为第 3、4 色（categorical 见 tokens.json）。
3. 字体：`--font-sans` 首选 Inter，再 PingFang SC / Noto Sans SC（仓库已有 @fontsource/noto-sans-sc，可再加 @fontsource/inter 400/500/600）。所有数字加 `.num`（tabular-nums）。
4. 字号：正文 13，表头/辅助 12，卡片标题 13/600，页面标题 20/600，KPI 值 24/600，实时大数 44/600。不再使用 28px 以上的衬线数字。
5. 圆角：卡片 12、按钮/输入 6、标签胶囊 999。阴影仅 `--shadow-xs`；深色模式无阴影。
6. 动效：统一 `--ease-out: cubic-bezier(.16,1,.3,1)`；hover 120ms、状态切换 200ms、入场 320ms（卡片 30ms 阶梯）、图表描线 700ms、数字滚动 450ms（延迟 150ms）、实时绿点 2s 呼吸、新事件 420ms 下滑淡入。`prefers-reduced-motion` 下全部关掉，数字直接终值（参考 design/motion.js）。

## 2. 外壳与导航（WorkspaceNavigation.tsx、PhoneTabs.tsx、main.tsx 的 App）
- **删除左侧深色侧栏**，改为：
  - 顶部 56px 头：`[泽] 白泽 / [站点图标] 站点名 ⌄  域名(灰)  ……  ●23 人在线 · 文档 · 主题切换 · 头像`。站点切换下拉复用现有站点列表；在线人数用现有 realtime `online`。
  - 下方 44px 横向标签：总览 / 实时 / 页面 / 来源 / 受众 / 事件 / 漏斗 / SEO / AI 助手 / 设置 / 更多 ▾。其余报表（文件下载、404 修复清单、收入归因、事件趋势、已识别用户、目标、留存、路径、实验、性能、热图等，以 WorkspaceNavigation 现有清单为准）放进"更多"下拉，按现有分组（流量与内容 / 行为与转化 / 体验…）分组显示。
  - 选中标签：文字变 `--fg`，底部 2px `--fg` 下划线，切换时 scaleX 生长 320ms。
- 内容区 `max-width:1200px; margin:0 auto; padding:24px`。
- **手机（<640px）**：头部只留标识、站点切换、在线数；标签横向滚动。`PhoneTabs` 底部 5 Tab：v3 稿用顶部横滑标签替代（与 Plausible/Vercel 一致）。⚠️ 这是对 PR #7 已做的底部 Tab 的改变，需要用户确认；未确认前保留 PhoneTabs，仅换成 v3 配色（白底、1px 顶边框、选中项黑字+玉色小点）。

## 3. 工具栏（DashboardFilters.tsx、main.tsx 的日期区）
- 每页一行：`页面标题(20/600)  ……  [时区·对比说明(灰12)] [今天|7天|30天|自定义 分段] [⚲ 筛选] [▦ 最近 7 天 ⌄]`。
- 原来的"开始/结束"两个 date input + "刷新"按钮：桌面收进"自定义"弹层（浮层卡片，内含两个日期和"应用"按钮）；手机点"最近 7 天"弹出底部抽屉（稿 overview_mobile_sheet），抽屉 360ms 上滑 + 32% 黑遮罩。
- "对比"开关合并进日期弹层里的"与上一等长区间对比"勾选；默认开（与现在一致）。
- "站内分析全局筛选"按钮改为 `⚲ 筛选` 次级按钮；激活的筛选以胶囊形式显示在标题下方，可单个 ×。
- "工作空间选项"移到头像下拉。

## 4. 总览（OverviewDashboard.tsx、overview.css、OverviewInsights.tsx、OverviewRealtime.tsx）
1. **KPI 条与趋势图合并成一张卡**（稿 overview）：6 个 KPI 等分横排（浏览量 pv、访客 uv、会话 sessions、跳出率 bounceRate、平均会话时长 averageDuration、目标完成 conversions），中间 1px 竖线分隔。
   - 每格：标签 12/500 灰 → 值 24/600 → `涨跌胶囊 + "对比上一期"`。涨绿 `--pos-soft` 底，跌朱砂 `--neg-soft` 底，持平灰底"– 0.0%"。跳出率上升应显示为"坏"（朱砂），沿用 `comparisonChange` 的方向逻辑。
   - 选中格顶部 2px 玉色条，**点击 KPI 切换下方曲线的指标**——替代现在"浏览量/访客/会话"分段按钮（只对 pv/uv/sessions/conversions 有 trend 字段的可点，跳出率和时长若 trend 无该字段则不可点、无 hover）。
   - 删除每格里的迷你走势线和"上一期间: x"文字行（上一期值放 tooltip）。
   - 手机 2 列 × 3 行。
2. **趋势图**（Charts.tsx 中 overview 用的图）：2px 玉色平滑线 + 16%→0 渐变面积；上一期灰色虚线；左侧 5 条极淡网格；x 轴首尾标签左/右对齐防截断；hover 竖线 + 白色浮层 tooltip（日期+星期 / 本期值 / 上一期值）。右上角"小时|天|周"分段（沿用现有粒度能力，没有就不放）。图例：`— 本期 2,119   ┄ 上一期 1,709`。
3. **本期观察**：从 3 个分栏卡改成一行细卡：`[✦ 本期观察 胶囊] 一句话结论（数字加粗） …… 查看依据 · 问白泽 →`。数据仍来自 OverviewInsights 现有结论，多条时用 ‹ › 轮播或展开，不新编文案。
4. **实时卡**：从右侧墨绿大卡移除；在线人数进入顶部头部（●23 人在线，点击进入实时页）。
5. **下半部 2×2 列表卡**：来源（渠道 / 来源站点 / UTM）、页面（热门 / 入口 / 退出）、地区（国家 / 省份 / 城市）、设备（设备类型 / 浏览器 / 系统）。
   - 卡头：标题 13/600 + 小标签页（选中下划线），右侧展开按钮 ⤢（打开对应完整报表）。
   - 行：高 34，行底浅玉色条形（宽度 = 值/最大值×92%，入场 scaleX 700ms，行间 40ms 阶梯），左侧 16px 图标位（渠道符号 / 国家代码 / 设备），名称、访客数（右对齐 500）、占比（灰）。
   - 卡底"查看全部 →"。
   - 子标签只放现有 stats 返回里已有的维度（sources、pages[entries/exits]、audience.country/device/browser/os）；省份/城市只在现有地理数据可用时显示，否则不放该子标签。
   - 设备占比 PR #7 做的环形图：v3 改为同款行内条形（与其他三张卡统一）；环形图可留在"受众"页。

## 5. 实时（RealtimeSummary.tsx、OverviewRealtime.tsx、realtimeTime.ts）
- 左栏 320px：卡①"● 近 5 分钟活跃"（绿点呼吸）+ 44px 大数 online + "心跳去重访客"；分隔线下"近 30 分钟浏览 · 148"+ 30 根迷你柱（最近 3 根玉色，其余灰；如果接口没有分钟分桶，就只显示数字，不画柱）。卡②"正在访问的页面"行内条形列表（由 realtime events 的 path 聚合）。
- 右栏：实时事件流表格，列 = 时间(等宽灰) / 设备图标 / [事件胶囊]+路径(等宽) / 国家(中文) / 设备(中文)；新事件 420ms 下滑淡入 + 玉色底闪一下。卡头：`实时事件流 [● 已连接]  [全部|浏览|事件]  [⏸ 暂停]`。连接断开时胶囊变灰"重连中…"。
- 页头右侧灰字"每 5 秒刷新 · 与历史日期筛选无关"（沿用现在的说明文字）。

## 6. 页面 / 来源报表（main.tsx 的 Table、PageDetail、AnalysisDetails.tsx、dimensionLabels.ts）
- **页面**：一张表卡。卡头：搜索框（⌕ 搜索路径… 快捷键 /）+ "8 个页面" + 导出 CSV（若已有导出能力）。列：路径(等宽，行底条形) / 浏览量↓ / 访客 / 入口 / 退出 / 跳出率 / 平均时长，全部右对齐等宽数字；表头 12 灰、无底色；行高 40，hover 浅灰。"/" 显示成等宽 `/` + 灰色"首页"胶囊。页顶分段：全部页面 | 入口页 | 退出页（切换排序列）。
- **来源**：顶部一张"渠道构成"卡：10px 高圆角堆叠条（6 渠道分类色）+ 图例（名称 + 百分比）。下方 2 列：渠道列表、来源站点列表（行内条形）。底部"渠道 × 落地页"表卡：说明灰字"每行是一个维度组合，访客不可跨行相加"放卡头；原生 select 换成 `页面：全部 ⌄` 式次级按钮 + 浮层菜单。所有维度值走 dimensionLabels 的中文映射。

## 7. SEO（SeoScans.tsx、SeoEvidenceView.tsx、contracts/seo-evidence.ts 字段）
- 页头：`SEO 体检 …… 上次扫描 {checkedAt，北京时间} [重新扫描(主按钮)]`。
- 4 格统计条（同 KPI 条样式）：已抓取 `fetched / pageBudget 预算` + 结束原因（endReason 中文：exhausted-discovered-links=已遍历所有发现的链接、page-budget=达到页面预算、targeted=定向复检）；错误数（severity=error，朱砂点）；需复核/建议（review/advice，金点）；跳过数（skipped，按 reason 分：robots-denied / fetch-failed / non-html / page-budget）。
- 结果表：卡头小标签 `全部 n | 错误 | 需复核 | 建议 | 通过`（按 severity/state 过滤）+ 右侧"渲染方式：静态 HTML（不执行 JavaScript）"（来自 renderMode/javascriptExecuted）。列：级别胶囊（error 朱砂、review 金、advice 灰、info 绿）/ 问题（ruleId 的中文名）/ 页面 url(等宽) / 类别胶囊（technical 技术、canonical 规范地址、presentation 展示、index-directive 索引指令）/ 建议（advice）。行点击展开 observed 与 officialUrl。
- 页底灰字："搜索平台的收录状态未接入，这里只展示白泽自己抓取到的页面检查结果。"（providerIndexStatus 为未接入时显示）。**不做健康分、不做蜘蛛对比**（后端没有）。
- ⚠️ 本次在合成数据下 SEO 页出现 "Cannot read properties of undefined (reading 'length')" 错误兜底，可能是 mock 数据缺字段；实施时请用真实接口确认，并让 SeoScans 对缺失数组做空值保护。

## 8. AI 助手（main.tsx 的 AIPanels、AiEvidenceView.tsx、StreamText.tsx、ModelConnectionSummary.tsx）
- 居中 760px 对话列，无卡片外框。顶部灰胶囊"BYOK · 使用你配置的模型"（ModelConnectionSummary 的模型名可放进胶囊）。
- 用户消息：右对齐浅灰气泡（12/12/4/12 圆角）。助手：左侧小「泽」标识 + 14/1.7 正文，关键数字加粗，流式输出时末尾玉色闪烁光标（StreamText）。
- 证据：回答下方一张行内条形卡（AiEvidenceView 的 points label/value）+ 一行"依据 · 指标 pv · 维度 source · 起止日期 · 时区 · 精确值 [展开查询 ⌄]"（来自 ai-evidence 的 metric/dimension/start/end/timezone/precision；truncated=true 时加"已截断，共 totalGroups 组"）。
- 建议问题：3 个次级按钮（SuggestionActions）。输入框：12px 圆角大输入区，右下"回答仅基于本站统计数据 [发送 ↵]"。
- 未配置模型时：空态卡"还没有配置 AI 模型" + "去设置"按钮。

## 9. 设置 / 成员（SiteFields、SourceSettings.tsx、GovernanceForms.tsx、MemberRoleEditor.tsx）
- 左 200px 子导航（常规 / 成员 / 跟踪代码 / 目标 / 隐私与保留 / AI 模型 / 数据导入 / 危险操作(朱砂字)），按现有设置分区映射，没有的分区不加。
- 右侧每个分区一张卡：`sec` 段落（标题 14/600 + 说明 12 灰）→ 2 列表单（站点名称、域名(等宽)、时区、数据保留 retention_days）→ 开关行（无 Cookie 模式 = privacy_mode cookieless）→ 卡底灰条"修改后立即生效 [保存]"。输入框焦点：边框 fg-3 + 3px 玉色 28% 光环。
- 成员卡：卡头"成员 3 人 [邀请成员]"；行 = 头像 + 姓名(500)/邮箱(灰) + 角色胶囊（owner 所有者=玉色胶囊、admin 管理员、viewer 只读）+ ⋯ 菜单（改角色/移除，沿用 MemberRoleEditor 权限）。不显示 user_id。

## 10. 空 / 加载 / 错误态（ErrorBoundary.tsx、AnalysisState.tsx、ApiReadNotice.tsx、IntakeStatus.tsx、InstallationSnippet.tsx）
- 统一 `empty` 组件：40px 圆角图标框 + 标题 14/600 + 说明 13 灰 + 操作按钮。
  - 无数据：显示跟踪代码（InstallationSnippet 现有内容，等宽代码块）+ [复制代码] + [● 等待第一条数据…]（金色点呼吸；只在现有 IntakeStatus 有"尚未收到"状态时显示）。
  - 出错（ErrorBoundary / API 失败）：朱砂 "!" 图标 + "这块数据没加载出来" + 错误说明（errorMessages.ts 中文）+ 错误码等宽灰字 + [重试]。只影响当前卡片，不整页替换。
  - 筛选无结果：⌕ 图标 + 当前筛选条件 + [清除筛选]。
  - 加载：骨架行（1.4s 线性闪光），不再用整卡转圈。

## 11. 登录（main.tsx 的 Auth / Landing、LanguagePicker）
- 去掉左右分栏和墨绿大图。全屏 `--bg` + 中心淡网格（48px，径向遮罩渐隐）。
- 中间 360px：36px「泽」标识 → "登录白泽"(20/600) → "知万物之情 · 自托管网站分析"(灰) → 白卡（邮箱、密码、通栏黑色主按钮"登录"；企业微信 SSO 仅在 /api/sso 返回可用时显示为次级按钮）→ 卡下左"简体中文 ⌄"（LanguagePicker 改为文字下拉）右"v{version} · AGPL-3.0"。

## 12. 其他报表（受众、事件、漏斗、留存、路径等）
不在本稿逐屏画，统一套用：页头工具栏（§3）+ 卡片（12 圆角 1px 边框）+ 表格（§6 样式）+ 行内条形列表（§4.5）+ 图表配色（§1.2）。漏斗用横向条（FunnelBars）改为中性灰底 + 玉色填充，步骤间灰字转化率。

## 13. 验收
1. 截图：overview / realtime / pages / sources / seo / ai / settings / login，1440 与 390，浅色与深色，与 `docs/design/v3/png/` 对照。
2. 页面中除数据线、选中态、焦点环、成功/所有者胶囊外不得出现大面积玉色；`#2F7D6D` 旧值全局搜索应为 0。
3. axe 无 serious/critical；文字对比度 ≥ 4.5（fg-3 #8F8F8F 只用于 12px 以上的次要信息，表头可用；正文不用）。
4. reduced-motion 下无动画。
5. 现有单测与 e2e 全过；e2e 里依赖旧类名/旧结构（侧栏、底部 Tab、date input）的选择器同步更新。
