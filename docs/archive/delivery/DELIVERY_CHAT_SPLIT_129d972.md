# 白泽bundled分片与聊天附件边界

> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](../../STATUS.md)；原路径映射见 [归档索引](../README.md)。原始失败、未测项及证据保留。

六个完整原包已成功保留于本人私有Library，但父线程user_message一次六包、一次只四个原生包的聊天附件发送均被平台拒绝，确切错误 `A Library file exceeds ChatGPT upload limit`，原包附件accepted=0。Library写入成功与聊天附件accepted不同；前一报告中的下载链接是本人认证Library入口，不是公开分享链接。本次不重传原包、不改权限、不上传公开网站、不重试失败helper。

按用户要求优先两份不需Docker的bundled运行包：Lite10片、标准11片。每片最大7,864,320 bytes（7.5MiB），尾片分别3,944,107和5,680,263 bytes。它们是原tar.gz的连续原始字节，不是可独立安装的压缩片。全部分片、按顺序及逐片SHA256的manifest、reassemble.py、说明和SHA256SUMS.parts已分别保存至本人Library独立分组；完整返回ID见 [分片Library清单](../../validation/new-build-129d972-20261013/split-bundled/PARTS_LIBRARY_INDEX.json)。Lite文件夹14件、标准15件；parent可分别附组，避免一次上百附件。目前尚未由parent验证分片聊天附件accepted，不能预先声明该边界已解决。

先实测空间13,310,001,152B可用，额外预算512MiB；生成分片并保留两份拼接验证副本后仍远高于2GiB保护线。两份原包与历史证据均保留。实际执行合并脚本后，SHA256和cmp逐字节一致：

| profile | 完整bytes | SHA256 |
| --- | ---: | --- |
| Lite | 74722987 | `39d4f00aa9e2a9c2655c9895f0721e39aa034281401f93e765353c051c3e961f` |
| Standard | 84323463 | `654b90b6556694d4b3bae7cca114f2d31b4a900121036b5796cdd4441089aef5` |

Windows使用 `py -3 reassemble.py parts-manifest.json`，macOS/Linux使用 `python3 reassemble.py parts-manifest.json`。同一组所有.partNNN、manifest与脚本放在同一目录；Python3.8+，无需秘密或提权。脚本按manifest顺序逐片拼接，检查每片长度/哈希及完整包长度/原SHA256，仅生成完整tar.gz，不解压、不执行包内容，不覆盖已有输出。两份完整原包的正向验证及拒绝覆写已有文件、坏分片校验失败清理本次输出、路径越界拒绝三项负向检查均通过。支持跨平台的是合并脚本；应用仍仅验证Linux x64 glibc，其他平台/生产边界不变。

本次只优先两bundled包，另四完整原包继续Library保留，未生成它们的分片。将来只在明确需要时继续，避免大量无用附件。安装前先合并成功，再按完整原包文档使用。
