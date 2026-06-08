# Local Tools

本目录不提交 Git。

VSCode 1.85.1
解压后放到：
tools/vscode-1.85.1/

第三方插件
下载 vsix 后放在 项目根目录下 offline-vsix 下

分别执行以下脚本 powershell
.\tools\scripts\setup-1.85.1.ps1
.\tools\scripts\debug-1.85.1.ps1

vscode 运行调试 切换配置（"Attach DFT IDE Extension (VSCode 1.85.1)）
运行Debug

调试的 vscode 中 （ctrl+shift+p -> Restart Extension host）
Extension 重载
