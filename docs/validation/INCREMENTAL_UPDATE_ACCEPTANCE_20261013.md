# 标准版与 Lite 实例增量更新：接续验收

> 历史附件已移至固定提交存档，以下结果仍只对应本文日期。原始图片、日志和 JSON 保持不变，见[仓库整理记录](../REPOSITORY_MAINTENANCE_20261110.md)。

2026-10-13 在新隔离云环境接续，未返回旧环境重试或删除旧包。补丁原始字节数194849，SHA256 `7f6b3a5feefc8846838eaaa80b0b34a084cbb9759803f26e97baa273189362b9`；五片、完整编码及原补丁哈希均匹配，`git apply --check`通过后应用。接续来源为`d4115f7a6bedaa0ae95c64f30cfdc22d99dde56b`，生成新的普通提交，未重建其作者身份。

## 最终实现和产物来源

实现与六个本地产物冻结在`52c2ddfd7aaf54cf272b41c50ee89bd16061c0df`。后续验收记录提交只增加证据，不改运行代码或这些包的源码身份。没有创建GitHub Release、发布签名源、使用生产配置或执行主机首次接入。

新增更新页保留既有紧凑分析布局，展示预计总下载量及变化内容、清单/签名/镜像配置明细。小量显示bytes/KiB，说明小改动仍需清单验真和重试流量。标准Docker备份密钥包按每次操作UUID隔离，修复升级后回滚时同名目录冲突；回滚预检显示通过，下载显示不适用。

## 实际测试

| 检查 | 结果及边界 |
| --- | --- |
| typecheck、lint、build、diff检查 | 通过；最终源码构建包含独立执行器 |
| 完整回归 | 1168项：1164通过、0失败、4环境门槛跳过 |
| 补充真实备份/恢复专项 | 对应四个文件13项全部通过、0跳过；使用实际PostgreSQL17客户端和隔离PG/CH/Redis服务 |
| 汇总去重覆盖 | 按文件、测试全名和同名参数化用例序号合并，1168项全部通过；不是声称一次完整运行无跳过 |
| 运行包专项 | 9项通过；文档从冻结Git blob导出，实际归档解压后验证完整清单和mode |
| 标准Docker | 真实白泽、PG-only备份、签名层增量、新进程版本/清单/启动身份/DB健康、回滚及更新前后两笔写入保留通过；密钥包修复后连续回滚通过 |
| Lite Docker | 真实白泽和SQLite备份、签名层增量、健康、回滚及两笔写入保留通过；连续回滚通过 |
| 四个运行包独立启动 | 各自包内release-start.sh、外置私有env/数据/密钥、标准真实PG与Lite SQLite健康通过，无开发会话依赖 |
| 最终UI | 标准/Lite各1440px和320px，真实应用登录后截图；确认框、键盘Tab、reduced-motion、无横向溢出及页面异常通过；已目视复核整页 |

完整与补跑原始报告、合并方法、Docker结果、包启动和产物哈希见[验收证据目录](../test-evidence/incremental-update-20261013/)。原生真实增量、断网/哈希/并发拒绝及服务组强杀恢复由前一环境已有验收记录支持，本次未把Docker层测试冒充文件级delta、正式发行或生产主机首次接入。

## 包大小

| 本地归档 | bytes |
| --- | ---: |
| baize-standard-node-ready-linux-x64-52c2ddf.tar.gz | 40105047 |
| baize-standard-bundled-node-linux-x64-52c2ddf.tar.gz | 84792909 |
| baize-lite-node-ready-linux-x64-52c2ddf.tar.gz | 40085770 |
| baize-lite-bundled-node-linux-x64-52c2ddf.tar.gz | 84770303 |
| baize-source-52c2ddf.tar.gz | 31943296 |
| baize-updater-52c2ddf.tar.gz | 329108 |

归档位于新环境`/workspace/baize-transfer/packages/`，同目录`ARTIFACTS.json`及`SHA256SUMS`记录实际大小、SHA256、源码和镜像身份。四个运行包离线包含实例增量更新指南；源码归档包括受控构建来源，独立执行器归档包含许可证与第三方通知。

## 容量、推送和剩余交付限制

初始工作区可用约30GiB，Docker为vfs。全程保留至少2GiB底线加1GiB缓冲。仅对本次生成的12个无用传输tar做gzip level1压缩，解压SHA256匹配后移除原tar，恢复归档保留；实际文件名/大小/方式见`recoverable-cleanup.json`，净释放3213150126bytes。数据库、密钥备份和旧环境包未清理；最后检查工作区仍有约6.4GiB空闲。

仓库没有`.github/workflows`，`.cnb.yml`仅有web_trigger/web_trigger_validate，无push/cron触发。普通提交使用`[skip ci]`，未运行Actions/CNB或改变权限；普通推送前后另核对远端main，禁止force。

四张最终截图已保存在[截图目录](https://github.com/bocmiao/baize-analytics/tree/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/screenshots/incremental-update-20261013)。Library当前支持的准备上传辅助流程在读取工具列表阶段网络失败；扩大网络权限的同一路线仍失败，未进入上传/最终保存，不能声称截图已保存Library。这是剩余交付阻塞；截图文件和Git证据已保留，可在Library连接恢复后保存。
