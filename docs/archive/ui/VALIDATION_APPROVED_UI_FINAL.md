# 已批准首页精修：最终验收状态

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

2026-10-11。本文件记录现有正式应用的有限首页精修与实际验证，不是全站视觉重做、原型替换或全项目完成声明。最终固定源码为 `81415f400980bb2783a7bcb7e133ee561f99c603`；早期工作树截图仍按当时web源码摘要和manifest归属，不重标为最终提交。没有触发托管CI。

## 五项有限精修范围

1. 手机日期/站点上下文合并到More，异常状态保持常显；KPI起始位置约195px。
2. 洞察收起时三卡布局，漏斗压紧到约232px，热门内容在首屏下方露出。
3. 趋势显示本期/上期的interval totals，说明单位与粒度；不累加UV、不平均均值冒总量。
4. 保留单套38分组导航，设置与账户在底部；没有重复导航或不可访问的隐藏入口。
5. 洞察以已证实事实作标题，仅保留一个证据入口，避免重复解释抢占主要内容。

另修已真实复现的200%文本More溢出（612px）；它是附加的确定缺陷修复，不改写上述五项批准范围。

## 实际结果，失败不覆盖

| 轮次 | 实际结果 | 范围与限制 |
|---|---|---|
| 先前不可变完整轮 `7f67be11dbedbaadb3240334a59223fe0f8c2ebb` | EXIT1；247单元与443集成PASS；浏览器29/31PASS，2FAIL，0skip | 闭合偏好控件的group selector及旧水位颜色断言失败；原报告保留。不能称精修后全轮通过。 |
| 最终浏览器首轮 | EXIT1；28/31PASS，3FAIL | extended-analysis、responsive-replay、workspace-navigation失败，原 `/tmp/baize-approved-ui-final-browser-first.log` 保留。 |
| 最终浏览器第二轮 | EXIT1；30/31PASS，1FAIL | workspace-navigation仍失败，原 `/tmp/baize-approved-ui-final-browser-second.log` 保留。 |
| 200%文本真实诊断 | EXIT1；定位实际More溢出 | 实际612px溢出是产品布局问题，非仅测试等待问题；原 `/tmp/baize-approved-ui-text-scale-diagnostic.log` 保留。 |
| 200%文本窄修复验 | EXIT0；1真实ChromiumPASS | workspace-navigation专项9.5秒，runner12.2秒；原 `/tmp/baize-approved-ui-text-scale-fixed.log`。只证明该专项，不能替代全31。 |
| 第三次完整浏览器 | **实际EXIT0；31PASS/0FAIL/0skip，2.1分钟** | 29真实Chromium+2日期函数；`/tmp/baize-approved-ui-final-browser-third.log`。前两轮FAIL仍保留。 |

当前精修lint、typecheck及build三项实际EXIT0；不将这些静态/构建结果加入应用测试计数。此前完整轮690应用检查、浏览器31检查分别记录，不把修复后专项累计到不可变旧轮。

## 真实数据与待验边界

首页视觉fixture通过真实collector→PostgreSQL→worker→API→Chromium，完整60天两期数据查询30天，PV511/UV30、前期PV120、四页面与desktop/Android；不是API mock或生产演示常量。无GeoIP时地域明确未知，空站点、SEO未配置及AI未配置仍可见。截图实际源码摘要、PNG hash、视口和语言以对应manifest为准；原图和失败均保留，不将英文或375px截图重标中文390px。

Google/GSC、模型及付费外部运输的模拟集成不能算真实账号验收；无购买凭据、外网部署、公开仓库或托管运行。Windows/原生平台和跨宿主灾备的既有未测边界不变。strict5000实际FAIL及性能/资源限制继续保留：页面和专项通过不证明吞吐、实时SLO、1C2G或规模达标。

## 最终固定源码全轮与镜像

固定源码 `81415f400980bb2783a7bcb7e133ee561f99c603` 正式空库全轮实际EXIT0：61文件247单元+161文件443真实集成=690后端PASS；31目录检查（29真实Chromium+2日期函数）PASS，0fail/0skip。原日志 `/tmp/baize-approved-ui-full-81415f4.log`，报告目录 `/tmp/baize-final-local.Ia7UnM`；lint/type/build等静态检查不计入690。

同源镜像及独立签名恢复实际EXIT0，结果 `/tmp/baize-approved-ui-image-81415f4/result.json`、`native-entry.txt`，`source-image.diff`为空。397文件manifest、56迁移；镜像 `sha256:1ce85f36babc8552498eb7ee05fc34fc8601a7c51e145f1346311a77ab59100a`，manifest SHA256 `8ad788a120a7e03dc5e7821f787318c217797e7b16f99fca8e165c76e4680dba`。独立目标CH在同一物理宿主，源不变、最新journal删A保B；缺sidecar、篡改和worker故障均拒绝。它不证明跨宿主灾备。

完整tracker gzip5087字节满足5KiB但不满足5000字节；min4506字节。本轮未追加旧故障全矩阵或5000负载，旧strict5000FAIL仍有效。安全证据由集成负责人归档，不复制密钥或原始服务状态。

先前54b036f不可变全轮EXIT1：247单元、443真实PG/CH集成PASS，浏览器29/31PASS，2FAIL（AI证据表闭合、连接器标题区定位）。原失败日志与JSON保留，本轮通过不覆盖其失败。
