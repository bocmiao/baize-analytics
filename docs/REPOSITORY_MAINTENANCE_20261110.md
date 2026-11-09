# 仓库整理记录（2026-11-10）

本次从当前工作树移除 848 份历史截图、日志及验证产物，共 110,280,496 字节；另移除 5 个未引用的前端文件，共 97,850 字节。合计 853 个文件、110,378,346 字节。

历史附件完整保留在提交 [`3dac02284c4dee43b891a65c85e8b1da46a1bc7c`](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c) 中。下表链接固定到该提交，原文件和 JSON 校验信息未改写，10 份相关文档的附件链接已同步替换。旧验证结果只对应原记录的日期和版本。Git 历史不重写，因此这里减少的是当前工作树及后续源码包的体积。

| 历史资料组 | 文件数 | 字节 |
| --- | ---: | ---: |
| [docs/test-evidence/pr2-jade-20261016](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016) | 355 | 50,549,841 |
| [docs/test-evidence/php-20261015](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/php-20261015) | 150 | 17,933,192 |
| [docs/test-evidence/overview-20261015](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015) | 182 | 12,206,986 |
| [docs/test-evidence/pr3-ui-20261017](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr3-ui-20261017) | 39 | 4,203,036 |
| [docs/test-evidence/incremental-update-review-20261013](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/incremental-update-review-20261013) | 6 | 4,228,445 |
| [docs/screenshots/08eab82](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/08eab82) | 11 | 1,925,682 |
| [docs/screenshots/10eb88a](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/10eb88a) | 8 | 1,789,057 |
| [docs/screenshots/19d97af](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/19d97af) | 8 | 1,792,928 |
| [docs/screenshots/1c1cb65-final](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/1c1cb65-final) | 9 | 2,114,583 |
| [docs/screenshots/66150be](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/66150be) | 9 | 2,124,528 |
| [docs/screenshots/ce42c9f](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/ce42c9f) | 9 | 2,111,443 |
| [docs/screenshots/d67bb8a-failed-full](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/d67bb8a-failed-full) | 19 | 2,973,513 |
| [docs/screenshots/cnb-height-fix](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/cnb-height-fix) | 2 | 144,869 |
| [docs/screenshots/c7ccdea-current-ai](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/c7ccdea-current-ai) | 2 | 636,027 |
| [docs/screenshots/round2](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/round2) | 10 | 787,941 |
| [docs/screenshots/approved-ui](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/approved-ui) | 12 | 1,171,660 |
| [docs/screenshots/incremental-update-20261013](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/incremental-update-20261013) | 4 | 647,927 |
| [docs/screenshots/incremental-update-closure-20261014](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/incremental-update-closure-20261014) | 4 | 712,886 |
| [docs/screenshots/incremental-update-final-20261013](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/incremental-update-final-20261013) | 4 | 708,229 |
| [docs/design/v3/compare-handoff](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/design/v3/compare-handoff) | 5 | 1,517,723 |

`compare-handoff` 的 5 张图片与仍保留的 `docs/design/v3/compare/` 逐一相同。两个退役组件和三份退役样式均无导入或其他文件名引用：

- `src/web/DenseOverview.tsx`
- `src/web/WorkspaceControls.tsx`
- `src/web/design-ref.css`
- `src/web/workspace-clean.css`
- `src/web/workspace-density.css`

保留当前 README 图片及对应来源记录、许可和 SBOM、构建与发布脚本、运维脚本、测试及其输入、数据库迁移、安装指南使用的截图、设计规范与可交互原型。39 份受哈希约束的归档文档及迁移清单保持原样。

Docker 构建上下文排除历史截图、验证产物和设计原型；`docs/images` 与 `docs/licenses` 仍保留。此项减少传输和构建层开销，不代表运行镜像按同样大小缩减。

后续临时截图和测试日志放入忽略的 `.baize/` 或 `test-results/`。PHP HTTP／浏览器测试和 approved-ui 测试的默认输出已改为 `.baize/test-evidence/`，仍可通过原有环境变量指定其他目录。需要长期公开的当前界面图更新到 `docs/images/`；历史验收材料使用固定提交链接，避免把旧图当作当前版本截图。
