# 第十二批本地联合验收

冻结提交 ef55e12ce545dfc8c12e0ec09da2dd4bae00b850，Git archive独立目录 /tmp/baize-final-round2-i2pj2opo。实际命令 bash scripts/validate-local-final.sh，EXIT0。新卷PG17/CH25.8/Redis7；168单元、150文件400真实集成，零失败零跳过；29浏览器检查（27真实Chromium+2日期函数）全部通过。lint、类型、SDK、tracker与应用构建、迁移、compiled生产入口健康及共享regular CI本地等价命令通过。owned Compose清理后仅原三个开发服务存在。

覆盖此前be95373两项夹具失败、4ee浏览器四失败、1e回放focus失败的当前完整轮；旧FAIL报告保留，不把修复后的定向结果加到本轮计数。完整输出和两JSON在 docs/test-evidence/main-ef55e12-*。外部Google/模型transport明确模拟，PG/CH和Chromium真实；不冒充外部账号验收。

本轮包含050–053、两批正文有界预取、第二轮SEO/GSC契约、导航与语言可访问性修复。之后用户要求紧凑数据口径的UI改动、比较期共享读取和新卡片浏览器专项尚未纳入该冻结，另行验证；新镜像尚未执行。GitHubActions禁用、CNB不触发。

ce6ebcc/b0be327单站strict1000完整性通过不代表性能达标：最新排空P95 6.44秒、最终HTTP7.01秒、Node app+harness峰665MB（不含存储）。阶段总量混合初始化/采集/排空/最终，inclusive不相加当CPU；HTTP侧CH1496次18.301秒/185.8MB，认证1428次7.732秒，TEMP2517次6.893秒，SQL166次0.909秒。主要待查正文读/认证/TEMP频次，不能用预算提前失败伪装性能改善。

## 紧凑UI首轮（保留失败）

b6bb4f96a0cd10072b1a39950135b4a7c6efb671 新空Compose/实际compiled UI，30检查中28通过、2失败、零跳过，EXIT1，资源清理完成。原29中27通过；新AI截图阶段中文日期定位错误超时、新operations接入卡刷新后折叠导致locator不可见。已准备窄fixture修复，不改变产品/隐私/权限/状态断言；实际重跑尚待。SEO中文1440/390、紧凑总览与可访问workspace已产出真实截图，当前没有AI最终图，不提前勾全绿。证据main-b6bb4f9-browser-failed.json保留。

516ce9d四浏览器专项2PASS/2FAIL（总览和SEO截图通过）。AI附加截图受到真实预算429保护；时区更新后旧事实受到503保护，background:false fixture未重算。窄修只配置模拟模型测试站点预算及真实worker重算，不削产品guard；旧失败保留 main-516ce9d-four-browser-failed.json。

比较期读取复用专项：新增同一站点事务共享已认证事实SQL TEMP，严格等长当前/上一窗口与相同path过滤各自计算；只normalized比较，legacy与单范围保持原行为。真实HTTP route/PG/CH1项+2单元通过，max1无借池等待；删除epoch变化与物理丢失正文仍拒绝。该定向结果不加到ef55e12全轮568计数；不声称普通查询提速。证据comparison-shared-snapshot-real.json。
