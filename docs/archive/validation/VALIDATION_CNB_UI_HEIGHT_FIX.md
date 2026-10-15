# CNB 首页收起卡片高度修复验证

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

2026-10-11 UTC。仅记录本次有限布局修复和测试入口适配，不代表新的全量验收或性能达标。未触发新的托管CI，未新增凭据或挂载Docker socket。

## 原CNB运行：失败保留

父线程提供的真实运行 `cnb-qj6-1k4ki5ani`，源码 `1be2643`，实际EXIT1，耗时12.1分钟：

| 阶段 | 实际结果 |
|---|---|
| 单元 | 本次未提供已核实计数，不沿用此前本地计数 |
| 集成 | 442 PASS、1 skip；strict-identity-restore需要 `BAIZE_OPS_POSTGRES_CONTAINER` 与Docker exec，当前runner缺少Docker client/socket |
| 浏览器 | 29 PASS、1 FAIL、1 skip；收起卡片高度225.1875px小于230px；strict-storage缺少 `E2E_STRICT_FACTS` |

上述跳过不是通过。尤其独立恢复的容器能力欠缺仍保留，没有通过新增socket挂载绕过。

## 有限修复与入口适配

桌面宽度至少1200px时，收起卡片增加 `min-block-size:230px`。原230–260px验收断言保留，并添加实际尺寸诊断。已确认原布局缺乏有界的内在高度；系统字体差异是可能因素，尚未证明它是确切根因。

独立CI Compose设置非秘密变量 `E2E_STRICT_FACTS=1`，常规regular默认范围不变。共享脚本新增browser-only范围，仍执行相同lint、typecheck、build、migrate、compiled应用入口与完整E2E；容器复验可以不重复后端测试，不将未运行的后端检查算作通过。

## 当前验证边界

本地完整浏览器实际31 PASS、0 skip，耗时2.1分钟。此结果证明本地浏览器修复，不覆盖原CNB失败或独立恢复跳过。

修复源码固定为 `8ff8a9b49f56e550ad8f8666d3b695890396911e`。本地容器使用相同Compose服务名网络、真实PG17/CH25.8/Redis、shared脚本的browser-only范围（不运行单元/集成目录）。

| 本地容器轮次 | 实际结果 |
|---|---|
| bundled Chromium | EXIT1，浏览器安装前CDN HTTP403 Domain forbidden；未运行E2E，未重试该被拒域名或改变策略 |
| system首轮 | 磁盘耗尽，运行浏览器前主动停止本轮runner；EXIT143，资源中止，不算通过 |
| 释放已结束项目构建缓存后system复验 | EXIT0，31/31 PASS、0 skip；截图视检发现缺CJK字形，未当作完整视觉证明 |
| 补齐本地system fallback CJK字体 | EXIT0，31/31 PASS、0 fail、0 skip，2.0分钟；lint/type/build/migrate/compiled入口也通过 |

最后一轮公开布局诊断实测height=230、minBlockSize=230px、fontsReady=loaded，保留230–260px原断言。真实截图已打开确认中文字形与内容完整；此处使用Debian Chromium154，与CNB bundled浏览器版本不等同。只在一次性测试容器安装signed distro字体，不改产品字体或宿主配置。字体差异可能影响原内在高度，但没有CNB原始字体诊断，不能声称已证明确切字体根因。

安全日志与诊断归档 `docs/test-evidence/cnb-height-*`，不复制运行密钥、cookie状态或原始认证trace。此次未重复数据库全轮：产品改动仅overview CSS，另为测试诊断/入口与非秘密变量；backend/数据/删除/签名恢复逻辑未变。此前81415f4完整本地通过仍绑定其原SHA，不重标到8ff8a9b。未来CNB默认regular仍跑完整目录，严格browser已显式启用，独立identity restore的Docker执行能力差异仍保留。新CNB尚未运行，需父手动验证；不宣称托管通过。

旧strict5000 FAIL、外部真实账号/付费API和跨宿主灾备未实测边界不变。本轮未运行新的负载验证、购买服务或变更环境网络与凭据。
