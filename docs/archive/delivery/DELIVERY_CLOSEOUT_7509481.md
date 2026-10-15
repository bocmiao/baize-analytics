# 白泽交付与收尾结案记录

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

本轮产物基线 main 为 `e170d79996c305b8332d6de1948c90b8e21613bc`；软件 SHA 为 `7509481a366b9ec1d0c3dc42ab31dc08d0792986`，随包文档覆盖层 SHA 为 `a683944148d0d6bbd5607c7eb8962e6374789e8e`。本记录只收尾，不重建或改变这些产物。

## 已完成，无需用户另行确认

- fetch核对远端与本地e170一致、工作区干净；12件正式产物的当前bytes/SHA256与远端提交内[交付索引](../../validation/final-7509481/DELIVERY_INDEX.json)逐件相同。两张README截图也核对原始bytes/SHA256。
- 既有构建、类型/业务、真实浏览器、四包启动/恢复、598件程序/公共资产同源及两版按随包说明实装证据均保留，原失败和补测仍分别记账；本轮不重跑这些工作。
- 所有正式运行入口独立于ChatGPT会话：Native从自带或宿主Node执行compiled入口，Docker按固定镜像CMD运行；部署需要其说明中的持久配置/数据和数据库服务。没有在生产机器安装服务。
- 核对遗留PID9932的原启动父进程9907、19:30:33启动时间、独立Lite测试数据目录和3392端口后发送SIGTERM。Node和flock均退出，3392健康端口不再监听；无运行中的Docker容器。仅剩父PID1待回收的defunct shell9907，不执行代码或I/O，未触碰PID1或其他进程。
- 本任务的源码和文档工作已结案，不再扩展功能，不请求部署或硬件选择。

## 文件投递的真实剩余边界

Library元数据连接读取成功，2026-10-12 20:00UTC之后的完整列表为空；此前保存结果为0B，错误均发生在prepare/传输/finalize之前，没有未决写入。本轮按现有prepared helper仅尝试一次14件顺序保存，截图沿用既有身份；仍得到准确错误：

```
library upload failed: hosted apps tools/list request failed: network
```

输出0B；无新增Library ID、版本或xattrs，无不确定写入。已停止该路径，没有循环重试、修改认证/权限或绕过Release Forbidden。两张既有截图的Library metadata ID仍分别为`libfile_65ce384d550c8191802f48aebeb14648`和`libfile_94dd7491a98081918d0d7bea9bb346cf`；服务未提供版本，本轮不冒认它们已更新或内容已在库中验证。

源码、普通用户文档、索引和安全文本证据已在私有仓库可取；12件当前二进制仍由索引所列本地路径保全，没有用户可下载的新增附件。唯一文件交付阻塞是prepared helper的工具目录网络。生产、宝塔、其他CPU/OS及旧容量实验边界继续按[完整验收报告](../validation/FINAL_ACCEPTANCE_7509481.md)记账，不作通过扩张。

## 可恢复清理

仅隔离可再生成的Python bytecode缓存；保留对应.py源依赖。文件内容SHA256、模式及xattrs未改变，恢复可从恢复路径复制回原路径。没有永久删除，也没有把隔离当作磁盘回收收益。

| 文件 | 原路径 | 恢复路径 | bytes |
| --- | --- | --- | ---: |
| `library_file_transfer.cpython-312.pyc` | `/workspace/baize-acceptance-e5aff3b/library-helpers/__pycache__/library_file_transfer.cpython-312.pyc` | `/workspace/baize-acceptance-e5aff3b/quarantine-closeout-20261013/library-helpers/__pycache__/library_file_transfer.cpython-312.pyc` | 17,650 |
| `library_hosted_apps.cpython-312.pyc` | `/workspace/baize-acceptance-e5aff3b/library-helpers/__pycache__/library_hosted_apps.cpython-312.pyc` | `/workspace/baize-acceptance-e5aff3b/quarantine-closeout-20261013/library-helpers/__pycache__/library_hosted_apps.cpython-312.pyc` | 17,480 |

**总量：35,130 bytes。** 正式包、最终截图、全部原始测试证据、旧版本、数据库/密钥/停止卷、Node/npm/Python必要依赖及所有未分类或可疑文件均保留；未prune。

逐件文件hash、进程范围核对、保存失败状态及清理完整记录见[DELIVERY_CLOSEOUT_STATUS.json](../../validation/final-7509481/DELIVERY_CLOSEOUT_STATUS.json)。
