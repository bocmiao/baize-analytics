# 白泽完整目标核对

审计基线：`2cf5c110bcb080ed2593999c30e16dbf786f725c`。本页核对 `PROJECT_SPEC.md`、66 项 F、10 项 P2、Lite 合同及原性能/运维计划。打包验收证明交付物可运行，不代表全项目目标关闭。历史清单的“待/当前”先核现有代码，不直接当今天的缺口。

## 已完成范围与证据边界

标准版多数功能已有实现及单元/真实 PG/CH/浏览器证据；Lite 已有独立 SQLite 事务采集、共享统计、站点授权、导出、删除/保留、签名恢复和离线迁移。三部署入口、四原生包和两 Docker 安装器在上述基线实际验收完成。1129 后端及41浏览器通过/1跳过实际在 e0a6cac，旧版本与新版本不能累计计数。

## 当前可独立继续的欠项

- DST 午夜缺失/重复曾使自然日与比较周期错误；已针对源码整改，真实 PG HTTP 边界仍需本轮验收。
- Lite 健康接口 schemaVersion 曾硬编码1而实际2；源码整改及真实 SQLite HTTP 回归通过。
- 会话中途401恢复、安全回跳、退出失败反馈/互斥、站点信息重复提交及 Lite 不支持的 user_id 输入；源码整改，新增完整浏览器流程等待验收。
- 原生启动的数据/密钥重叠前置拒绝、中英文部署陈旧说明、应用 save 镜像选择和必要配置说明已整改；新说明的实际 no-build/pull-never 生命周期仍需演练。
- 完整 tracker 原5087B只满足5KiB，不满足十进制<5000B；当前候选为完整tracker的预压缩gzip4998B（非原始JS、非min变体），只有2B余量；不能删功能/版权追数字。独立审查要求保留第三方原许可注释，新构建产物尚需受影响浏览器验证。
- 最新源码的有限规模性能、idle/background/WAL/延迟及完整栈资源隔离仍需验证；历史90dd114代表样本不外推，strict5000默认失败未关闭、不无意义重跑。
- 当前 strict 浏览器缺执行证据；源码 canonical guard 实际true，旧报告把跳过原因说成guard未激活不准确，实际是E2E_STRICT_FACTS未设置。保留原skip，补受影响专项，不修改guard绕过。
- Lite 对标准版的能力差异须按批准Lite合同分类：明确排除的复杂路径/漏斗/回放/热图/分布式/CH，以及事件目标和站点删除的明确限制，是设计取舍；无明确Lite承诺的标准功能不能自行改列已定漏项或扩大Lite。当前逐项复核未找到额外实证已承诺但漏做的Lite核心项；健康版本与unsupported输入属于已确认整改。

## 需要外部条件的缺口

真实 Google/GSC/GA4、MaxMind 授权库、付费 SERP、SMTP/通知、企业 SSO、真实商业/本地模型质量、微信设备/账号、Windows/macOS/ARM/Alpine、真实面板/系统服务/域名 TLS、跨物理宿主灾备及完整设备/读屏兼容矩阵。百度官方连接器未实现且缺明确获授权协议/原生样本；不能凭自定义CSV导入声称原生兼容。不创建长期凭据或真实生产部署。禁止Actions/CNB不列为需要自行开启的缺口。

## 逐功能实现对照

“存在”仅指实现和既有本地证据存在，不代表该项任意设备、规模及最终版本的完整验收证书。Lite 29项共享/专用实现、9项部分、27项不支持、1项共享P2未单独审计；这些为代码范围分类，不是通过计数。设计取舍、未明确承诺的新建议及已承诺漏项分别核对冻结90dd114合同原文。当前委派上下文不含原始Lite用户指令，未猜测用户授权；可见批准计划内尚无额外实证漏项。

| 项目 | 标准版 | Lite | 外部条件/代码边界 |
|---|---|---|---|
| F01 页面浏览（PV）追踪【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F02 访客标识【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F03 会话划分【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F04 停留时长【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F05 滚动深度【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F06 出站链接点击【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F07 文件下载【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F08 404 追踪【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F09 UTM/Referrer/渠道【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F10 终端信息采集【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F11 地理位置【P0】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | GeoIP always unavailable; intake eventDimensions geo={}；MaxMind真实许可库及定位准确率 |
| F12 Web Vitals【P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F13 自定义事件【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F14 收入事件【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F15 用户标识 identify【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | identify/user_id rejected |
| F16 表单提交【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F17 机器人过滤【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F18 IP 匿名化 / DNT / Consent【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F19 脚本自托管与体积【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F20 批量上报与可靠性【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F21 总览 Dashboard【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F22 实时看板【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | no realtime/SSE endpoint or report capability |
| F23 来源分析【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F24 页面分析【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F25 路径分析（桑基图）【P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | paths capability false; no path analysis endpoint |
| F26 受众分析【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F27 自定义事件报表【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F28 转化目标【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 部分实现 | only event goals; page/form goal types rejected |
| F29 漏斗分析【P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | funnels capability false; event goal only |
| F30 留存/同期群【P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | retention/cohorts report false; data retention is a separate implemented operation |
| F31 搜索关键词【P0/P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 部分实现 | traffic referrer context only; no GSC/Baidu keyword API；Google GSC真实账号授权/配额 |
| F32 AI 引荐（GEO）渠道【P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F33 自定义报表保存【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | no saved report table/API/UI capability |
| F34 定时推送【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | no schedule/channel delivery tables/API；SMTP/WeCom/Server酱真实交付 |
| F35 CSV 导出【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 部分实现 | CSV is retained raw events, not same shape as standard aggregate CSV/full site export |
| F36 公开分享链接【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | no share tokens/table/API |
| F37 iframe 嵌入【P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | no iframe share API |
| F38 流量异常告警【P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | no alert/notification domain |
| F39 目标达成/漏斗骤降告警【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | no goal/funnel alert domain；真实通知交付 |
| F40 脚本掉线检测【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | intake status exists but no scheduled dropout alert；真实通知交付 |
| F41 多站点管理 + 分组【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 部分实现 | multi-site/tags/read-update supported; site deletion explicitly rejected |
| F42 成员与角色【P0/P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | site_members authorization exists; no member/invite/account provisioning APIs；真实邀请邮件 |
| F43 审计日志【P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | no audit_logs table or general mutation audit |
| F44 API【P0/P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | cookie query API only; rejects bearer/API token, no MCP |
| F45 用量统计 + 保留策略【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F46 一键删除访客数据【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F47 排除内部 IP【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F48 GA4 历史聚合报表导入【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | no GA4 aggregate history tables/API；Google GA4真实账号/配额 |
| F49 整站数据导出【P1】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 不支持/未实现 | full:true rejected; raw retained-event export or operator signed backup only |
| F50 Cookie 同意横幅【P2】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享P2，未单独审计 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F51 GSC 集成【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | no GSC external connector；Google GSC真实账号 |
| F52 百度搜索资源平台【P1】 | 官方读取未实现；自定义手动模板导入已实现，非原生兼容 | 不支持/未实现 | no Baidu connector/manual search import API；官方文档化API/授权/字典或真实原生CSV样本 |
| F53 站内 SEO 健康检查【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 部分实现 | provided HTML local audit + observed paths only; no live crawl/robots/network evidence；授权真实站点兼容矩阵 |
| F54 关键词排名监控【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | no SERP integration；付费SERP真实账号 |
| F55 SEO→转化打通【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | no SEO search-to-conversion linkage；真实搜索账号数据 |
| F56 BYOK 设置【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 部分实现 | encrypted BYOK fixed OpenAI provider; attempt/day budgets not original monthly monetary/tokens or multiple providers；真实商业模型/独立人工灾备 |
| F57 智能日报解读【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | manual answer only, no scheduled daily AI；真实模型输出质量 |
| F58 异常归因【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | manual aggregated totals interpretation, no automatic anomaly drill-down；真实模型解释质量 |
| F59 优化建议引擎【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | manual answer only, no tracked suggestion workflow；真实模型建议质量/效果不得声称因果 |
| F60 自然语言问数【P1】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | manual fixed aggregate question, no semantic MCP/SQL tools；真实模型质量/其他MCP客户端 |
| F61 一键安装【P0】 | 实现存在；连接器本地证据与真实外部未测分离 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate.；Windows实际执行器/跨平台环境 |
| F62 首次运行向导【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 部分实现 | private nonce atomic owner/session wizard implemented; separate member provisioning absent |
| F63 GeoIP 自动下载【P0】 | 实现存在；连接器本地证据与真实外部未测分离 | 不支持/未实现 | no GeoIP download/load in Lite；MaxMind实际授权下载/地域库 |
| F64 产品落地页【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 共享或专用实现存在 | Shared tracker/UI or core Lite domain implemented; this read-only mapping is not a new per-feature execution certificate. |
| F65 中英 README/docs【P0】 | 实现及本地测试证据存在；不表示任意规模/设备/部署验收完成 | 部分实现 | shared bilingual UI/README; Lite-specific docs chiefly Chinese |
| F66 upgrade.sh【P0】 | 实现存在；连接器本地证据与真实外部未测分离 | 部分实现 | schema migration automatic; CLI backup/restore to new dirs and manual switch; no dedicated full Lite upgrade/rollback command；跨宿主灾备及实际运营环境 |

## P2 对照

| 项目 | 当前范围 |
|---|---|
| P2-01 | 严格CH主体实现；性能/资源SLO未达，历史strict5000FAIL保留 |
| P2-02 | 标准实现；Lite拒绝 |
| P2-03 | 标准实现；Lite拒绝 |
| P2-04 | 标准实现；Lite无实验端点 |
| P2-05 | SDK已实现；微信真机未验 |
| P2-06 | 插件真实本地WP已验；更多主题/CMP未验 |
| P2-07 | 标准SSO连接器已实现真实企业未验；Lite禁用 |
| P2-08 | 中英固定产品已实现；设备/读屏矩阵未完整 |
| P2-09 | 标准本地模型连接器实现；真实下载/推理网络阻断；Lite无Ollama |
| P2-10 | 共享独立consent banner实现 |

## 实现差异

- 标准exact访客集合替代HLL；持久PG任务替代BullMQ；部分精确边界/筛选重建保留明细。这些是明确实现差异与性能风险，不自动认定功能缺失。
- 当前用户授权Lite后允许SQLite；原规格架构不用SQLite不能忽略后续授权。
- F15不自动缝合登录前匿名历史是当前明确隐私选择；不能据旧目标文字自行恢复匿名身份拼接。
- F19旧CI文件在归档目录且托管已禁止；不把禁止Actions/CNB当需要自主重新开启。

外部审计原始JSON、逐文件哈希、实际执行记录位于 `/workspace/baize-release-evidence-2cf5c11` 和 `/workspace/baize-layout-evidence-20261012`；仓库本页不包含私有凭据或日志正文。新增源码修改的实际SHA及测试结果以本轮提交和验收记录为准。
