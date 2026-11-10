# 参与贡献

欢迎修复问题、完善文档和提交功能改进。开始前阅读 [开发指南](docs/development.md)；可复现的问题请附版本、环境、操作步骤和脱敏日志。

应用主体采用 AGPL-3.0-only，独立 tracker 采用 MIT。请只提交自有或许可兼容的代码，新增依赖时说明其许可证及用途。不要提交密钥、原始访客 IP 或个人数据。

提交前运行：

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run build
node scripts/check-doc-links.mjs
```

数据库、采集、权限或界面行为有变化时，还应运行相关集成和浏览器测试。测试使用独立数据库，环境准备见开发指南。PR 中说明改动、实际执行的检查和仍需验证的外部依赖。

临时日志、基准结果和验收截图放在忽略的 `.baize/` 或 `test-results/`。`docs/` 保留可维护的安装、使用和开发指南；README 使用的当前截图放在 `docs/images/`。
