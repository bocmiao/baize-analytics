# 白泽129d972：私有Library下载交付完成

2026-10-13 10:28:50 UTC实际执行环境命令成功，六包SHA256SUMS全部OK，manifest仍完整；收到断连通知后没有假定连接正常。直接官方Library create_library_file已按顺序对六包分别返回succeeded、匹配的bytes与真实library_file_id。本人私有Library下载链接如下；没有公开分享或权限变化。

| 文件/下载 | bytes | MiB | SHA256 |
| --- | ---: | ---: | --- |
| [baize-lite-bundled-node-linux-x64-129d972.tar.gz](https://chatgpt.com/api/library/files/libfile_2f6e4d01901c8191af5d348be102e33c/download) | 74722987 | 71.261394 | `39d4f00aa9e2a9c2655c9895f0721e39aa034281401f93e765353c051c3e961f` |
| [baize-lite-docker-offline-129d972.tar.gz](https://chatgpt.com/api/library/files/libfile_e42dd2def3b481919b1578687b11cf30/download) | 125430910 | 119.620237 | `54cccedf92198f76909d8f8b7ef2693173462017c00dc4f76f706f611750d595` |
| [baize-lite-node-ready-linux-x64-129d972.tar.gz](https://chatgpt.com/api/library/files/libfile_03d1ffa37d2081918283bff9805bf1ac/download) | 30037788 | 28.646267 | `d55000c40fd4667995ea6173c9bbceb21aa876f233a8601954847f179dd5761d` |
| [baize-standard-bundled-node-linux-x64-129d972.tar.gz](https://chatgpt.com/api/library/files/libfile_74a2234cc3a48191855bbc34bdc00f03/download) | 84323463 | 80.417121 | `654b90b6556694d4b3bae7cca114f2d31b4a900121036b5796cdd4441089aef5` |
| [baize-standard-docker-offline-129d972.tar.gz](https://chatgpt.com/api/library/files/libfile_016411fb64a881918da91cb18e99ddad/download) | 297023350 | 283.26354 | `042b69d634bb1976e5e3c3fcf118dabca9111f821c3dd4c129bb7d85ed92bafb` |
| [baize-standard-node-ready-linux-x64-129d972.tar.gz](https://chatgpt.com/api/library/files/libfile_cd59d33c298c81918236cdec79af2a55/download) | 39636861 | 37.800656 | `e990d5ac1e7ab6ec9cbb8b5d2b3b438c85e27bddd2835e783b82a30b3afd7982` |

此前helper的tools/list network失败记录保留，它不是所有Library工具不可用的证明；六包直接官方上传在后续用户明确指示下完成，无重复helper。GH Release未创建、未上传；gh auth status报GH_TOKEN invalid，只读Release列表查询报Forbidden。Git docs-only推送成功，这与二进制Release能力不同。

软件冻结129d972cde1ba8d3da97a130e3adf70f8673402d。两版完整镜像、四原生包、两offline save来自新环境源码构建；旧环境、旧包、旧sha和证据未修改。四包各602个compiled/public文件与独立宿主编译一致，标准镜像1080文件、Lite664文件同源检查零差异。四包各自shell启动、nonce认领、cookie认证、前端HTML、backup/new-target restore通过；两版offline Compose实际load与--no-build --pull never初装通过。

新源回归28通过/1跳过的唯一skip为actual older PG dump restore cannot resurrect credentials revoked in untouched source database，后续真实PG dump独立5/5批次中同名用例passed；有4项重叠，不相加，不算跨平台验证。发布器9/9通过。历史全量1160、标准浏览器48、Lite5未改计为新镜像全量回归。

Node-ready实际宿主Node24.19/SQLite3.53.3；bundled-node和镜像Node24.21/SQLite3.53.4，Linux x64 glibc最低2.28。生产、真实宝塔、Windows/macOS/ARM/Alpine、物理断电/存储故障、整台1C2G长期容量、旧5000重跑和性能重测未验证。标准500ms目标仍未通过，历史混合性能结论不改写。

本地六包继续保留/workspace/baize-new-packages-129d972/；固定2GiB保护值未改。后续下载成功不回写早先DOWNLOAD_CHANNEL_STATUS的失败历史；本清单补充后续成功状态。

