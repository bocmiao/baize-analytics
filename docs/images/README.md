# 当前界面截图

拍摄日期：2026-11-10（Asia/Shanghai）。运行环境为 Linux NAS 上的 Node 标准版、PostgreSQL 17 和 Redis 7，基于 `3dac02284c4dee43b891a65c85e8b1da46a1bc7c` 及本次仓库整理、暗色和响应式修复。

| 图片 | 浏览器视口 | 内容 |
| --- | --- | --- |
| [baize-desktop.png](baize-desktop.png) | 1440 × 1000 | 桌面总览，浅色主题 |
| [baize-mobile.png](baize-mobile.png) | 390 × 844 | 手机总览，浅色主题 |

截图来自真实登录后的界面，没有替换统计接口、注入样式或后期修改页面内容。演示站点标注了“测试数据”，通过实际采集接口写入 713 条合成事件，再由后端生成报表；当前区间为 265 次浏览、265 位访客，上一等长区间为 119 次浏览。

这些数据用于展示页面布局，不代表正式网站流量。另一个独立站点完成了真实浏览器 tracker 的页面访问和自定义事件测试，见 [NAS 验证记录](../validation/NAS_SSD_20261110.md)。

图片 SHA-256：

```text
5d062ea503cc972dab6571d6a5e94fe192d39cfac2c4bf2840455de209ec6345  baize-desktop.png
52d0ac9b624a945386d818b3c7ecc2b2eda9bc4625712722c4885cd8e5e35200  baize-mobile.png
```
