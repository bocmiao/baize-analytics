# 贡献与验证

主体 AGPL-3.0-only，独立 tracker MIT。仅提交自有或许可兼容的代码，新增依赖需说明许可证与隐私影响。所有功能免费，不设置付费开关。

先阅读 docs/PROJECT_SPEC.md、docs/IMPLEMENTATION_NOTES.md 与 docs/development.md。使用当前隔离 checkout 开发，不默认创建 worktree。提交前运行 lint、typecheck、单元、真实 PostgreSQL 集成、浏览器 E2E 与 build；涉及运维运行生命周期检查。模拟连接器测试不能宣称真实账号验证通过。PR 写明实际命令、结果和未实测依赖。不得把秘密、原始 IP、个人数据 fixture 加入 Git。
