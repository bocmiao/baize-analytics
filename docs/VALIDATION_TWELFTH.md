# 第十二批本地联合验收

冻结提交 ef55e12ce545dfc8c12e0ec09da2dd4bae00b850，Git archive独立目录 /tmp/baize-final-round2-i2pj2opo。实际命令 bash scripts/validate-local-final.sh，EXIT0。新卷PG17/CH25.8/Redis7；168单元、150文件400真实集成，零失败零跳过；29浏览器检查（27真实Chromium+2日期函数）全部通过。lint、类型、SDK、tracker与应用构建、迁移、compiled生产入口健康及共享regular CI本地等价命令通过。owned Compose清理后仅原三个开发服务存在。

覆盖此前be95373两项夹具失败、4ee浏览器四失败、1e回放focus失败的当前完整轮；旧FAIL报告保留，不把修复后的定向结果加到本轮计数。完整输出和两JSON在 docs/test-evidence/main-ef55e12-*。外部Google/模型transport明确模拟，PG/CH和Chromium真实；不冒充外部账号验收。

本轮包含050–053、两批正文有界预取、第二轮SEO/GSC契约、导航与语言可访问性修复。之后用户要求紧凑数据口径的UI改动、比较期共享读取和新卡片浏览器专项尚未纳入该冻结，另行验证；新镜像尚未执行。GitHubActions禁用、CNB不触发。

ce6ebcc/b0be327单站strict1000完整性通过不代表性能达标：最新排空P95 6.44秒、最终HTTP7.01秒、Node app+harness峰665MB（不含存储）。阶段总量混合初始化/采集/排空/最终，inclusive不相加当CPU；HTTP侧CH1496次18.301秒/185.8MB，认证1428次7.732秒，TEMP2517次6.893秒，SQL166次0.909秒。主要待查正文读/认证/TEMP频次，不能用预算提前失败伪装性能改善。

## 紧凑UI首轮（保留失败）

b6bb4f96a0cd10072b1a39950135b4a7c6efb671 新空Compose/实际compiled UI，30检查中28通过、2失败、零跳过，EXIT1，资源清理完成。原29中27通过；新AI截图阶段中文日期定位错误超时、新operations接入卡刷新后折叠导致locator不可见。已准备窄fixture修复，不改变产品/隐私/权限/状态断言；实际重跑尚待。SEO中文1440/390、紧凑总览与可访问workspace已产出真实截图，当前没有AI最终图，不提前勾全绿。证据main-b6bb4f9-browser-failed.json保留。

516ce9d四浏览器专项2PASS/2FAIL（总览和SEO截图通过）。AI附加截图受到真实预算429保护；时区更新后旧事实受到503保护，background:false fixture未重算。窄修只配置模拟模型测试站点预算及真实worker重算，不削产品guard；旧失败保留 main-516ce9d-four-browser-failed.json。

比较期读取复用专项：新增同一站点事务共享已认证事实SQL TEMP，严格等长当前/上一窗口与相同path过滤各自计算；只normalized比较，legacy与单范围保持原行为。真实HTTP route/PG/CH1项+2单元通过，max1无借池等待；删除epoch变化与物理丢失正文仍拒绝。该定向结果不加到ef55e12全轮568计数；不声称普通查询提速。证据comparison-shared-snapshot-real.json。

2bf840d 最新整套浏览器30/30 PASS（28真实Chromium+2日期），97.83秒、0 skip，EXIT0。包含预算429不增加provider调用、模拟fixture预算明确调整后真实1PV/0÷1图表、时区修改后真实worker重算，再完成原备注/诊断/权限断言。owned Compose清理验证。证据main-2bf840d-browser.json。

实际图像复核发现AI调用记录仍早于问数，本次下一切片进一步前置问数、后置技术记录；存储固定枚举计时标签也在下一冻结，均尚未被2bf浏览器或ef全轮覆盖。观察标签轻量13单位通过、types/lint通过；首次类型参数错误保留，不改变EOF/SQL/超时/池行为。

## 08eab82 最终同源本地全轮

完整冻结 `08eab82853ab1d625c35371085f10f136477b8b5`，实际 `bash scripts/validate-local-final.sh` EXIT0。46文件173单元、151文件401真实集成全部PASS，0失败0跳过；30检查=28真实Chromium+2日期函数全部PASS、0跳过（runner显示1.6分钟）。lint/types/SDK/tracker及应用构建、全新PG/CH/Redis卷、compiled Node、真实native operational恢复与owned cleanup均通过。原始日志/JSON/source摘要见 `test-evidence/main-08eab82-*`，阶段计数不累加，所有先前FAIL保持。

最终中文workspace、SEO、AI各1440/390和总览/回放1440/375实截图位于 `screenshots/08eab82/`，图像SHA记录在最终报告。模型/Google运输明确模拟；本地数据库、HTTP、浏览器和PG dump/restore是真实。截图不证明付费API或真实OAuth账号已测。最新全部源码生产镜像、跨物理宿主灾备及托管CI仍未在本轮执行；不把f4镜像或b7 native通过冒称该新镜像通过。
