# 白泽当前状态

核查日期：2026-10-11 UTC。**这是唯一当前状态入口**；规格、逐项清单及其他验收文件中的“当前/最新”属于其 SHA 的历史时点。历史失败不删除、不改写、不累加计数。

## 源码与同步

- 实时本地HEAD以 `git rev-parse HEAD` 定位；本页记录的最新隔离候选源码为 `9689ae027474a78ee2205a75f05475c928d0fd14`，文档提交以 `git log -1 --format=%H -- docs/STATUS.md` 定位，不伪造自引用哈希。
- 最后由父与本地引用确认的远端 main：`ee996754595d25f13aadac507dc4a2a6dc6b06b0`。这是已确认基线，不声称刚完成网络检查。后续本地提交**未确认同步**。
- 最新完整正式应用验收绑定不可变源码：`72ea9291b69c30cba5369a63f44c0b2842bcbcd3`。后续隔离原型不属于该全量结果。
- Git 当前失败为 `could not read Username`，无 HTTP 状态；未找到可靠原预配代理 URL 或自动刷新步骤。当前 origin 是 HTTPS/github.com/bocmiao/baize-analytics.git，无 helper/rewrite；父协调同环境正常授权路线，不新增凭据、不借 CNB 绕过。原 bundle 保留，损坏编码段废弃。
- 私有 main、无 PR/force。GitHub Actions 禁止；CNB 同步/运行仅由父在本批收齐后统一批准。未公开仓库、发布镜像或外网部署。

## 正式功能与边界

| 产品组 | 正式实现，已有本地验证 | 尚未完成或真实外部未验 |
|---|---|---|
| 统计分析 | PV/UV、事件时间会话、迟到乱序、多标签/SPA、时长、来源/内容/设备/地域、实时、比较、Vitals、Bot解释；PG/严格CH权威读取、认证贡献与增量闭包 | strict持续高负载未达；真实GeoIP准确性未验 |
| 事件转化 | 类型化事件、目标、漏斗、路径、留存、实验、回放/热图；分币种收入、订单去重、会话归因、身份分段 | 实际支付对账、复杂真实站点兼容未验 |
| SEO | GSC/GA4连接器、SERP、受限扫描/定点复检、自定义搜索数据导入 | 真实Google/付费SERP未联调；百度公开搜索分析读取API未证实，官方读取连接器未实现 |
| AI/API key | BYOK加密、受限问数及图表、证据/建议复检、日报异常分析；token/实例管理隔离、审计原子轮换 | 真实模型效果未测；Ollama下载被现有网络拒绝，不是缺账号 |
| UI | 获准白底靛蓝主题、洞察重排/状态记忆、手机抽屉、38入口、中英文、真实状态及键盘图表 | 读屏/更多浏览器和真实设备未全矩阵验收 |
| 多站点/权限 | 角色、邀请、撤销、站点token、审计、限流、密码边界及旧分享兼容 | 真实企业微信SSO未联调 |
| 运维 | Docker安装、迁移、升级失败恢复、签名备份、独立CH目标恢复、最新删除日志 | Windows原生执行器 -32603 setup错误阻塞；跨物理机灾备未测 |
| 删除隐私 | 入口内存脱敏、每日盐别名清洗、墓碑、身份精准删除、实验贡献清理、文件物理删除、AI旧证据失效、恢复防复活 | 任意自定义业务字段不保证自动匿名化 |
| 导入导出/报表告警 | 异步CSV/JSON、分享/嵌入、保存筛选、周期报表、统一统计口径、通知重试；WordPress真实本地运行 | 实际邮件/企业微信/Server酱投递及微信小程序真机未验 |

**必须了解的限制：**

- SEO 每次最多 **30页**，分析初始 HTML，**不执行 JavaScript**；未抓到/被robots跳过不是通过，不承诺排名收益。
- GA4 **仅聚合报告**，不是逐事件迁移。五种精确窗口独立去重，不能相加每日UV；最多3660天，每报告10万行、单HTTP响应5MB，超限拒绝。
- 站点导出每表最多 **10万行**，不是无限导出或整实例备份；实例恢复用独立备份流程。接口权限与范围见 [API](api.md)、[迁移](migration.md)。
- daily_salt **不支持identify、跨日UV去重或跨日留存**；不以稳定别名绕过限制。
- AI连接器/模拟通过不代表真实模型已联调或结论正确；不把归因当因果。

## 最近实际验收（不混算历史）

| 绑定来源 | 实际结果 | 边界/证据 |
|---|---|---|
| 正式应用72ea929空库全轮 | EXIT0；369单元、491真实PG17/CH25.8/Redis集成；31目录检查=29真实Chromium+2日期函数，0失败/跳过 | lint/type/SDK/build/migrate/compiled entry同入口通过；[完整原始结果](performance/producer-canonical/full-72ea929-pass/) |
| 同源新镜像与独立恢复 | 新镜像安装Healthy；后续独立目标签名恢复EXIT0，源不变、最新日志删A保B、失败拒绝及修复后重建 | 初次安装后磁盘门槛EXIT1、一次缺串行闸拒绝保留；不是整条helper或新升级矩阵全PASS。[收尾](VALIDATION_72EA929_CLOSING.md)、[原始镜像证据](performance/producer-canonical/image-72ea929-independent-pass/) |
| 原参数strict5000/72ea929 | **FAIL**；4700接收、6批未发送，已接收排空/完整性通过；最终HTTP18.187秒 | 不改deadline/drain，不外推日均百万、1C2G或生产SLO。[原始失败](performance/producer-canonical/strict5000-72ea929-failure/) |
| B隔离inbox字节预算专项 | 14真实PG PASS、0fail/skip，EXIT0；新增6项与旧8项同次执行 | 该轮publisher仍模拟；随后3项真实CH专项见下方，不外推正式接入或容量。[摘要绑定及原始JSON](performance/producer-canonical/inbox-byte-cap-pg-pass/) |

新镜像：`sha256:daafc23c1fc444c1bd176207b26917c32b141f14753a5eafa2a2d92e0602b660`；426文件manifest与72冻结源码一致。恢复在同宿主独立目标CH实例验证，不冒称跨机器灾备。

## 当前候选与下一闸

B为**隔离PG durable inbox研究原型**，区分received/validated/published，未替换正式collect或202语义。最新9689ae0已48专项PASS/0skip（14原PG+8 admission+8 combined PG+18真实CH），同SHA300 separate/combined两组完整性PASS；不是新整产品全轮。

本轮三次不同候选原参数5000均FAIL，证据完整保留：

| 源码/候选 | 实际收到并发布 | 拒绝/未发 | 最终HTTP | 状态 |
|---|---:|---|---:|---|
| b7f0362 共用站点入队门 | 4850 | 1×429（未记具体码）/2未发 | 25.486秒 | 历史FAIL |
| 4d1affa 独立短入队门 | 4100 | 18×pending_backpressure/0未发 | 15.601秒 | 历史FAIL |
| 9689ae0 独立入队+合并消费 | 4350 | 13×pending_backpressure/0未发 | 23.406秒 | 当前FAIL |

三轮已收到部分排空/完整性通过，不代表5000容量通过，更不能称原正式accepted通过。最新合并门穿越482→227但累计等待仍约184秒，不能继续凭缩短事务次数、加队列或改drain追绿。详见[独立门验收](VALIDATION_INBOX_INDEPENDENT_ADMISSION.md)、[最新合并候选](VALIDATION_INBOX_COMBINED_PUBLICATION.md)。下一路径须有可证明的新读取/认证协议，当前只有限评估，不默改生产。

既有标准prepared真实CH写/读回/白名单、孤儿不可见、精准物理删A保B、缺正文重试拒绝已有验证。生产独立fsync日志未接762与prototype清理；原wire/HMAC身份来源、真实identify/revenue副作用、签名pending备份/恢复、全局公平/队列年龄仍未交付。PG prototype journal不是独立文件日志，不称正式集成。

逐项F01–F66/P2见[清单](IMPLEMENTATION_CHECKLIST.md)；[README原阶段记录](README_VALIDATION_HISTORY.md)与各证据目录保留历史。当前同步仍阻塞；原bundle及单文件ZIP保留，两次任务文件查看器下载均实际失败，不再猜接口或手工编码，不称上传/推送成功。
