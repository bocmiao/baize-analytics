# UI 截图验收（scripts/ui-preview.ts）

起一个一次性 Lite 实例、灌入 15 天真实分布的合成访问数据、等待聚合完成后，
对全部主要页面（明/暗主题 × 桌面/移动）输出 PNG 截图。用于 UI 改动的前后对比验收。

## 用法

```bash
npx tsx scripts/ui-preview.ts .baize-preview/shots
# 可选：PLAYWRIGHT_CHROMIUM_EXECUTABLE 指定 Chromium（未装 playwright 浏览器时）
```

输出目录含 `landing / login / setup / overview / overview-dark / pages /
sources / audience / events / settings / overview-mobile` 等截图。
数据为合成值；截图仅用于视觉验收，不代表真实统计口径。

## 覆盖范围

- 实例：`createLiteApp`（SQLite、零外部依赖），安装凭证走 tests/helpers fixture
- 数据：15 天 × 会话分布 × 来源渠道 × 设备/语言/屏幕，直接走 /api/collect 真实 intake
- 截图：Playwright chromium，reducedMotion=reduce，等 fonts.ready

## 相关工具

- `scripts/audit-css-classes.mjs`：组件 className 与样式表覆盖的交叉审计
