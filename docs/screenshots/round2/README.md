# 第二轮真实浏览器布局证据

前：07f9ada 原真实 responsive-replay 用例，375/768/1440×900。后：1e39942 原真实 workspace-navigation 用例，320/390/768/1280/1440×900，另390×900 computed字号200%。后图来自实际随机站点 navigation.example.test、Asia/Shanghai 日期2026-10-11、真实HTTP采集2PV及coverage1，无UI数据替换。computed颜色/键盘实数见 docs/test-evidence/main-1e39942-computed-style.json。

前后为不同测试随机站点和数据；768/1440可比较同宽导航与布局，375/390非同宽。截图用于层级、文本、横溢及任务布局观察，不以像素差异证明业务数据回归。图表截图前并未独立等待ECharts全部绘制，不能充图表渲染专门验收。200%是逐元素真实computed font-size倍增（含fixed px），不是浏览器400%缩放、真机或读屏验收。

1e39942套件28/29通过，回放焦点失败原样保留；新地域提示缩减与focus修复尚未体现在本批图中，下一真实验收绑定新SHA，不改写这些旧图。
