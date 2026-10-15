# 白泽概览重排与验收（2026-10-13）

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

将顶部指标改为同范围本期/前期/变化对比表，标准版另有独立5分钟心跳活跃、30分钟浏览窗口，手动刷新，不把历史筛选当实时窗口。Lite按既有capabilities门禁不显示、不请求实时窗口，未增加Lite功能。

桌面结构是趋势2/3 + 本期观察1/3，来源/热门内容/会话入口三列，地域2/3 + 设备与目标完成1/3同列堆叠。来源少时其下保留已有真实采集说明；多来源时说明压缩为折叠入口，不靠空padding撑高。手机完整显示六个指标及前期/变化，避免横滑裁掉半个数字。进一步分析保留键盘可操作的dialog，原侧栏、统计口径与React/ECharts复用机制保留。

参考布局来自父线程对用户51.LA截图实际像素查看后的明确结构与修正反馈；本执行环境只能读取两原图元数据，官方本地像素转移报download failed，未声称在此view原图。design-product-ui主skill已读，五个相关references资源不可读，记录准确边界。只借内容分组和密度，没有复制51.LA logo或资产，也没有照搬15分钟窗口、新老访客或预测。

## 真实截图与演示数据

README图片来自实际运行的新版前端、真实采集API、真实PG聚合API，非手工覆盖stats结果。演示使用固定SHA256派生的标识、访问路线、支持的referrer/UTM分类及不同心跳时长；同条件可复现分布。发送器以同设备cohort合批、每批50以下且约110ms间隔，遵守现有反机器人/请求门槛，不更改保护。第一次逐visit高速提交触发204过滤，失败批次保留在新环境，此批不算通过。

本期PV681、UV184、会话271，平均会话时长36.6秒，目标完成64；6渠道实际由dimensions分类器识别。页面UV为142/113/88/30/40/36，可见时长也不同，不再所有页面同30访客和8秒。地域是明确合成原始维度，非真实IP定位，不修改聚合算法、不写stats结果；未知位置保留。站点名称、README和截图metadata均明确合成示例。

[桌面整页](../../images/baize-desktop.png)、[手机整页](../../images/baize-mobile.png)、[桌面首屏](../../validation/overview-redesign-20261013/overview-desktop-first-screen.png)、[手机首屏](../../validation/overview-redesign-20261013/overview-mobile-first-screen.png)。旧README PNG已另存before-*，旧129d972归档、镜像、Library文件和逐件SHA保持原身份。

## 本轮已测

- 最新类型检查、lint、生产build通过；没有新增依赖。
- 11项针对性单测通过，包含未知/真实0、时区/DST/比较门槛、resize同帧合并与清理、路由字段边界。
- 新标准/PG和Lite/SQLite两浏览器场景2/2通过，标准使用真实采集/聚合API；Lite单点真实观测、未配置地域和不请求实时接口通过。
- 1440/1024/768/390/320无页面横向溢出，手机六指标完整可见；键盘抽屉Escape/焦点返回、口径展开、reduced-motion、五次指标切换保留同一ECharts实例、旧实时响应不能覆盖刷新后的新值通过。
- 另一个既有真实API场景1/1通过，遍历38入口、手机导航inert/焦点、SEO/AI未配置、空站点接入状态。该批与新场景分别记录，不把入口数量当测试数量。
- 独立受控布局场景覆盖零/未配置地理/50长中文页面/30长中文来源/503重试；受控图不当README真实API截图。运行时pageerror为空；强制503是预期错误路径。

[原始数据与UI结果](../../validation/overview-redesign-20261013/ui-results.json)、[Lite结果](../../validation/overview-redesign-20261013/lite-ui-results.json)、[输入分布](../../validation/overview-redesign-20261013/synthetic-seed.json)、[源码与编译逐文件哈希](../../validation/overview-redesign-20261013/SOURCE_BUILD_WITNESS.json)、[截图哈希](../../validation/overview-redesign-20261013/SCREENSHOT_INDEX.json)。先前fixture缺实时心跳、可访问名称、错误文本预期、旧像素阈值与并行trace目录冲突等失败记录保留在本次新环境，不改记为通过。

## 未测与交付边界

本轮未重跑历史全量1160、原标准48、Lite5，不能将历史批次计作本次验证。未测真实生产、真实宝塔、物理手机/Safari/Firefox、Windows/macOS/ARM/Alpine应用运行、物理断电/存储故障、旧5000容量或性能对照；合成演示不证明性能。标准500ms目标及旧混合性能结论不改写。

此提交先冻结UI源码、用户README与真实截图。旧129d972运行包仍是旧UI，绝不改revision冒充新版。新包必须从此后明确冻结的源码重新构建、同源校验和实际安装/恢复后交付；构建空间仅是规划可开始，非峰值保证，2GiB门槛不变。没有CI/CNB、PR、Release、生产或凭据权限变更。
