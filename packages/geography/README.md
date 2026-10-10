# 地图数据来源

此目录只保存官方 Apache ECharts `4.9.0` npm 发布包中的原始地图 JSON，以及该发布包的 LICENSE/NOTICE。没有引入旧版 ECharts 程序代码或修改应用依赖。

来源：`https://registry.npmjs.org/echarts/-/echarts-4.9.0.tgz`。下载仅使用已有允许的 npm registry 域名；tarball SHA512 与 registry 元数据、npm pack 输出一致。`provenance.json` 保存发布包 integrity 和每个保留文件的 SHA256。资产保持原样，没有自绘省界或添加演示地区。

许可：Apache-2.0，保留同目录 LICENSE 和 NOTICE。地图数据与应用的 AGPLv3 主体分开保留其原始许可；独立 tracker 的 MIT 不受此数据目录影响。该 vendored 数据不属于 package-lock 中的运行依赖，发行清单应将此目录及其许可同时纳入。

`china.json` 含34省级区域，`province/` 含34个原始省级地图。格式是带 UTF8Encoding 的压缩 GeoJSON，由当前 ECharts6 `registerMap` 正常解析。真实地域计数来自 `/api/v1/sites/:siteId/geography`，地图本身不包含网站访问数据。

实际兼容性验收：`tests/unit/geography-assets.test.ts` 验证所有文件 SHA256、34区及四川名称，使用项目当前 ECharts SVG SSR 真正生成中国地图路径/标签；1项通过。浏览器交互验收由 web 测试负责，不以 SSR 替代。
