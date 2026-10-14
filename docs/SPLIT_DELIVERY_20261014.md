# 四个大包的 Library 分卷交付（2026-10-14）

四包已按用户要求分卷保存到 Library，未改变原归档；原两个 NodeReady 未重复上传。分卷是正式小文件创建接口的新交付，每项均明确成功，未改变凭据、权限或传输目标。此前 prepared PUT Forbidden 仍是旧传输路径失败，没有宣称已修好。

下载说明附件：`baize-split-download-kit-20261014.zip`，10590 bytes，Library ID `libfile_fd149a08c84c8191830dd8ac4f485185`，SHA256 `7a01dacc0537f8faf0ac7eba21cb71572662483e6a709da01b71bf89319e3d10`。附件包含 19 卷 Library ID、分卷和整包校验、Windows/Linux 还原方法及脚本。仓库可读索引见 [LIBRARY_INDEX.md](test-evidence/split-delivery-20261014/LIBRARY_INDEX.md)，机器清单见 [SPLIT_MANIFEST.json](test-evidence/split-delivery-20261014/SPLIT_MANIFEST.json)。

所有四包已实际重组、匹配全包 SHA256 并校验 gzip/tar；随附 Python 3.11+ 工具也实际重组四包通过，缺卷/已有目标拒绝验证通过。PowerShell 方法没有 Windows 实机测试。分卷只是还原文件，不安装、部署或执行任何平台任务。Git 只保存小型说明和清单，不保存归档或二进制分卷。

原两个 NodeReady 已在 Library，未重复上传。1Panel 已有兼容 Node 24 时优先用 NodeReady；没有 Node 时选 bundled-node（自带 Node，标准版仍需外部 PostgreSQL）；采用 Docker 部署时选 docker-offline。标准 Docker 含应用、PostgreSQL、Redis；Lite Docker 只含应用/Node。四包任选一种适合自己的，不必全部下载。

四个大包通过正式小文件 Library create 路径保存为 19 卷，每卷最多 32 MiB（33554432 bytes）。每包先实际重组核对原 SHA，再检查 gzip/tar；随附 Python 还原工具也实际还原四包验证通过。原归档没有改动或删除。两个 Docker recovered 包来自保留的精确镜像，已实际 docker load 核对 image IDs；它们的新字节/SHA 不冒称等于丢失的旧 /tmp 归档。

| 还原后的文件 | 字节 | 卷数 |
| --- | ---: | ---: |
| `baize-standard-bundled-node-linux-x64-38c9c61.tar.gz` | 80098280 | 3 |
| `baize-lite-bundled-node-linux-x64-38c9c61.tar.gz` | 75196927 | 3 |
| `baize-standard-docker-offline-38c9c61-recovered.tar.gz` | 292387008 | 9 |
| `baize-lite-docker-offline-38c9c61-recovered.tar.gz` | 125912375 | 4 |

## 下载

在 Library 按完整文件名下载所选包的全部 .part001 至最后一卷，放在同一可写目录；不要改名，不要跨版本混合。SPLIT_MANIFEST.json 给出逐卷 Library ID、字节和 SHA256；SHA256SUMS.parts 是分卷校验表，SHA256SUMS.archives 是四个完整归档校验表。小分卷不是可单独解压的压缩包，先合并，勿逐卷解压。

## Windows

解压本说明附件，把所选分卷放在同一目录。在该目录打开终端，安装了 Python 3.11 或更新版本时（推荐跨平台路径）：

```powershell
py -3 restore.py baize-lite-bundled-node-linux-x64-38c9c61.tar.gz
```

或在 PowerShell 使用不依赖 Python 的二进制流合并脚本：

```powershell
powershell.exe -NoProfile -File .\restore.ps1 -Package baize-lite-bundled-node-linux-x64-38c9c61.tar.gz
```

不修改系统 ExecutionPolicy；如果你的策略不允许脚本运行，使用 Python 方法，不使用 Bypass。PowerShell 路径代码已交付，但本环境没有 Windows，因此没有声称 Windows 实机运行通过。Python 合并算法已在 Linux 对四包实际还原验证。

核对还原归档：

```powershell
Get-FileHash -Algorithm SHA256 .\baize-lite-bundled-node-linux-x64-38c9c61.tar.gz
```

结果须与 SHA256SUMS.archives 中该文件一行一致。脚本逐卷查缺/查错并核对全包 SHA；已有目标或 .assembling 文件会停止，绝不自动覆盖。Python 方法还验证 gzip/tar，且最终目录需支持硬链接（例如 NTFS/ext4）；失败会保留现场。如果是 FAT/exFAT 移动盘，请用支持的本地目录或 PowerShell 方法。不使用文本 Get-Content / Out-File 拼二进制。

## Linux

在含说明附件和所选分卷的目录运行（Python 3.11+）：

```bash
python3 restore.py baize-lite-bundled-node-linux-x64-38c9c61.tar.gz
```

没有 Python 时，按精确次序二进制合并这三个 Lite bundled-node 分卷：

```bash
(
set -euo pipefail
archive=baize-lite-bundled-node-linux-x64-38c9c61.tar.gz
test ! -e "$archive" && test ! -e "$archive.assembling"
set -C
cat "$archive.part001" "$archive.part002" "$archive.part003" > "$archive.assembling"
expected=$(awk -v name="$archive" '$2 == name { print $1 }' SHA256SUMS.archives)
test -n "$expected"
printf '%s  %s\n' "$expected" "$archive.assembling" | sha256sum -c -
gzip -t "$archive.assembling"
tar -tzf "$archive.assembling" >/dev/null
ln "$archive.assembling" "$archive"
rm -- "$archive.assembling"
)
```

其他包换成其完整文件名和清单中全部编号；9 卷包必须包括 .part001 到 .part009。优先用脚本自动按清单排序和校验。缺卷、分卷 hash 错或总包不符都应停止，从同一 Library 文件重新下载，不跳过校验。

## 合并后安装

合并仅恢复归档，不会安装服务、创建账号、执行 shell 或更改任何配置权限。Windows 可下载合并，但运行包面向 Linux x64，需把完整归档传到部署机再以 tar --same-permissions 解压，不能把 Windows 解压后的权限当作密封包原始权限。

原生包在 Linux 解压后，按项目 docs/PANEL_INSTALLATION.md 配置独立持久目录、私有 runtime.env 和面板受管启动；不要 npm install 或 build。Docker recovered 归档是镜像 save，使用 docker image load，配合同冻结源码的 Compose/scripts；不可将镜像归档误当作原生运行目录。已有实例走备份和兼容增量升级，禁止清空数据重装。

本次没有改变凭据、权限或传输目标，没有使用旧签名 URL；所有分卷由正式 Library 创建接口明确返回保存成功。此前 PUT Forbidden 仍作为传输路径历史失败保留，不能宣称旧路径已经修复。没有发布 Release、GitHub Actions/CNB 或部署生产。
