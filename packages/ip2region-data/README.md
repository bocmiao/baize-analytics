# IP2Region 离线地域与运营商库

数据来自 [lionsoul2014/ip2region](https://github.com/lionsoul2014/ip2region)，固定版本为 `d003e9ea1cbce169488cea7d7de3ac6d6fd00249`。原始许可证保存在 [LICENSE.md](LICENSE.md)，采用其 Apache-2.0 许可选项。当前发布的 IPv4 和 IPv6 XDB 均包含国家、省份、城市、运营商及 ISO 国家代码，不需要第三方账号或在线查询。

本目录只包含来源与许可证。约 48 MB 的数据库安装在实例数据目录，不进入 Git 或应用镜像。读取器根据官方 XDB 布局和查询算法作 TypeScript 适配，使用现有 ipaddr.js 严格解析地址，并增加格式、向量、记录边界校验；没有改动 XDB 数据。

安装与核验：

```sh
node --import tsx scripts/geoip-install.ts --data-dir /app/data
node --import tsx scripts/geoip-install.ts --data-dir /app/data --check
```

离线导入使用 `--from /path/to/snapshot`，目录必须包含 `ip2region_v4.xdb`、`ip2region_v6.xdb` 和 `LICENSE.ip2region.md`。每个文件都必须匹配 [manifest.json](manifest.json) 中的长度、SHA-256 和对应 Git blob；下载仅使用固定提交下的官方 HTTPS 地址。

两个地址族和许可证都校验通过后，才原子切换 `geoip/ip2region/current.json`。重复安装只复用完全匹配的版本目录。运行中读取器不依赖查询时的网络；关闭地域功能会清除内存读取器。管理员可在“地域数据库”页面启用、下载或更新本版本内置的已验证快照，MaxMind 仍可单独选择。

数据库估计的是网络归属地；并不代表访客精确位置。历史记录中没有保存的归属地不能补算；内网、保留地址和库中未知信息继续保留未知。以后更新快照时，必须同时更新 manifest、运行时代码中的固定摘要与已知 IPv4/IPv6 查询用例。
