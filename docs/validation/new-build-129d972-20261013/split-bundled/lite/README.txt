白泽 lite bundled-node 129d972 原包的可逆原始字节分片。
这些片段不是独立压缩包，不能单片安装。
下载本组全部 10 个 .partNNN、parts-manifest.json、reassemble.py 到同一个目录；勿混入其他组。
Windows: py -3 reassemble.py parts-manifest.json
macOS/Linux: python3 reassemble.py parts-manifest.json
脚本按manifest顺序拼接、逐片和完整包SHA256校验，不解压、不执行包内容、不需秘密或提权。需Python3.8或更新，输出同名完整tar.gz，已有输出则拒绝覆写。
校验成功后才按完整包安装说明解压/运行。支持跨平台的仅为合并脚本；应用仍只验Linux x64 glibc。
原包SHA256=39d4f00aa9e2a9c2655c9895f0721e39aa034281401f93e765353c051c3e961f
