# 白泽 Baize Analytics

永久免费、自托管、隐私优先的中文网站分析平台。TypeScript / Fastify / React + Vite / PostgreSQL / Redis。所有功能免费，外部 AI、SERP 等服务成本由部署者承担。

当前为私有仓库中的开发版本；实现与验收以 docs/IMPLEMENTATION_CHECKLIST.md、实际测试记录为准。设计规格不代表已完成。不开源发布、不自动外网部署。

## 本地运行

安装 Docker 与 Compose v2，在已有私有 checkout 执行 `./install.sh`。默认监听 http://localhost:3000，首次访问创建管理员、站点并获取 tracker。密钥自动生成；重复安装保留本地数据和配置。当前镜像本地构建，不发布注册表。

开发与验证见 [development](docs/development.md)，安装、备份、恢复和升级见 [deployment](docs/deployment.md)，兼容性见 [compatibility](docs/compatibility.md)，规格见 [PROJECT_SPEC](docs/PROJECT_SPEC.md)。

主体 **AGPL-3.0-only**，独立 tracker **MIT**。无收费功能门槛。第三方依赖许可证按 lockfile 核查；未完成正式发行级 SBOM 审计前不声称审计完成。
