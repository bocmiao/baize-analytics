# 界面截图与来源

最新截图拍摄日期：2026-11-11（Asia/Shanghai）；保留的较早截图拍摄于 2026-11-10。运行环境为 NAS 固态硬盘上的 Node 标准版、PostgreSQL 17 和 Redis 7。图片为实际浏览器截图，没有替换接口结果、注入样式或后期修改页面内容。

## 本轮最终截图

源码提交：`765647ac1b0c9fbd0b88891fcd2ab9943d61759c`。

```text
镜像 sha256:74ed450a52dac3717ecfed8ca3b953e7e34870b24c11a83afc37b6eb6278f506
```

| 图片 | JPG 实际像素 | 内容 |
| --- | --- | --- |
| [baize-reports-desktop.jpg](baize-reports-desktop.jpg) | 1440 × 1000 | 桌面流量趋势、指标切换与日期比较入口 |
| [baize-settings-mobile.jpg](baize-settings-mobile.jpg) | 375 × 900 | 手机站点设置、站点信息与追踪代码区域 |

新版站点选择器显示名称与域名，折叠按钮独立放置。页面加载、图表复用和最新验证见 [加载与切换验收](../validation/BAIZE_NAVIGATION_PERFORMANCE_20261110.md)；较早的全页面统一记录见 [全页面界面验收](../validation/BAIZE_ALL_PAGES_UI_20261110.md)。

## 保留的概况截图

以下图片来自同日较早的 `b1ed60c`，保留用于说明概况布局，不标为最终版本截图：

| 图片 | 浏览器视口 / JPG 像素 | 内容 |
| --- | --- | --- |
| [baize-desktop.jpg](baize-desktop.jpg) | 1440 × 1000 / 1440 × 1000 | 桌面概况首屏 |
| [baize-mobile.jpg](baize-mobile.jpg) | 375 × 812 / 375 × 812 | 手机概况首屏 |

对应镜像：`sha256:def710577736fc4d1c59d9c8a479368800a76c57c1800f0469d3ed74ec565157`。此前验收见 [产品界面整理](../validation/BAIZE_PRODUCT_UI_20261110.md)。

## 数据说明

截图使用标为“合成验收（socket模拟）”的独立测试站。固定输入通过真实采集处理器写入；模拟连接地址用于验证 IPv4、IPv6、去重和离线地域查询。图中数字不代表用户网站的真实访客或实际地理位置。

独立 IP、运营商及流量预测已接入统计逻辑。预测采用历史同期估算；缺少 IP 标识或地域的旧记录仍显示不可用，不补造历史数据。详细统计与功能验证分别见 [流量统计记录](../validation/51LA_COMPLETION_NAS_20261110.md)和 [NAS 功能记录](../validation/51LA_FUNCTIONAL_NAS_20261110.md)。

图片 SHA-256：

```text
86f2eb08d8c31c2eaf505e066d5bf81cf0574cfa197699a5057076c6d70e98bc  baize-reports-desktop.jpg
e7dd64e7c2ca3bd1ad868b3e48b05440fbd5f04b3f7c264cc8bb081dca7fc75e  baize-settings-mobile.jpg
8df5bcc2dfbd576ce5ed5a162ddf88a54cbc19558ebb647eca1b8c871ee60c38  baize-desktop.jpg
7d2f9c1d4bbb73bc66031a0ac93f8f1795c976cd4a58edd31168316b872b30b0  baize-mobile.jpg
```
