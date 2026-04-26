# DFT IDE 部署说明

本文说明如何把当前插件源码和原生 VS Code 打包成一个可以直接启动的 DFT IDE 目录。

## 推荐方案

推荐使用 VS Code 官方 Portable Mode：

- Windows 使用 VS Code ZIP 版本。
- Linux 使用 VS Code TAR.GZ 版本。
- 在 VS Code 解压目录下创建 `data/` 目录后，用户数据、设置和扩展会保存在该目录内。
- 把 DFT IDE 插件以 VSIX 形式安装到这个 portable VS Code 中。
- 最终交付整个 VS Code 解压目录给用户，用户运行 `Code.exe` 或启动脚本即可。

参考：

- VS Code Portable Mode: https://code.visualstudio.com/docs/editor/portable
- VSIX command-line install: https://code.visualstudio.com/docs/configure/extensions/extension-marketplace

## 目录约定

假设当前项目路径为：

```text
D:\Downloads\dft-ide
```

准备一个原生 VS Code ZIP 版本，解压到：

```text
D:\tools\VSCode-win32-x64
```

最终输出目录示例：

```text
D:\release\dft-ide-vscode
```

## 手工部署步骤

1. 安装项目依赖：

```bash
npm install
```

2. 构建插件：

```bash
npm run compile
```

3. 打包 VSIX：

```bash
npx @vscode/vsce package
```

执行后会在项目根目录生成类似：

```text
dft-ide-0.0.1.vsix
```

4. 复制 VS Code ZIP 解压目录到发布目录：

```text
D:\release\dft-ide-vscode
```

5. 在发布目录创建 portable 数据目录：

```text
D:\release\dft-ide-vscode\data
```

6. 使用发布目录内的 VS Code CLI 安装 VSIX：

Windows:

```powershell
D:\release\dft-ide-vscode\bin\code.cmd --install-extension D:\Downloads\dft-ide\dft-ide-0.0.1.vsix --force
```

如果 `bin\code.cmd` 不存在，也可以尝试：

```powershell
D:\release\dft-ide-vscode\Code.exe --install-extension D:\Downloads\dft-ide\dft-ide-0.0.1.vsix --force
```

7. 写入 portable 用户设置：

```text
D:\release\dft-ide-vscode\data\user-data\User\settings.json
```

建议内容：

```json
{
  "workbench.startupEditor": "none",
  "window.commandCenter": false,
  "workbench.layoutControl.enabled": false,
  "breadcrumbs.enabled": false,
  "dftIde.layout.autoApply": true,
  "dftIde.layout.hideMenuBar": true,
  "dftIde.layout.hideActivityBar": true,
  "dftIde.apiBase": ""
}
```

如果后端已经部署，把 `dftIde.apiBase` 改成真实服务地址，例如：

```json
"dftIde.apiBase": "http://localhost:8080"
```

8. 创建启动脚本：

```bat
@echo off
setlocal
cd /d "%~dp0"
start "" "%~dp0Code.exe"
```

保存为：

```text
D:\release\dft-ide-vscode\启动 DFT IDE.bat
```

9. 压缩发布目录：

```text
D:\release\dft-ide-vscode.zip
```

用户解压后运行 `启动 DFT IDE.bat` 即可。

## 使用脚本自动部署

本目录提供 `package_ide.py`，用于自动执行常见打包步骤。脚本需要 Python 3.10 或更高版本。

示例：

```powershell
python deploy\package_ide.py ^
  --vscode-source D:\tools\VSCode-win32-x64 ^
  --output D:\release\dft-ide-vscode ^
  --api-base http://localhost:8080
```

参数说明：

- `--vscode-source`：原生 VS Code ZIP 解压后的目录，目录下应包含 `Code.exe`。
- `--output`：最终输出目录。
- `--api-base`：可选，后端 API 地址，会写入 `dftIde.apiBase`。
- `--skip-vsix`：可选，跳过 VSIX 打包，直接使用现有 VSIX。
- `--vsix`：可选，指定已有 VSIX 路径。

脚本会做这些事：

1. 执行 `npm install`。
2. 执行 `npm run compile`。
3. 执行 `npx @vscode/vsce package` 生成 VSIX。
4. 复制 VS Code 目录到输出目录。
5. 创建 portable `data/` 目录。
6. 写入用户设置。
7. 使用输出目录里的 VS Code CLI 安装 VSIX。
8. 生成 `启动 DFT IDE.bat`。

## 注意事项

- Windows 上建议使用 VS Code ZIP 版本，不建议用已经安装到系统的 User/System Installer 目录制作 portable 包。
- 不建议直接修改 VS Code 安装目录中的内置文件；优先通过 portable data、settings 和插件命令实现定制。
- 如果打包机无法访问 npm registry，需要提前准备好 `node_modules` 或内部 npm 镜像。
- 如果打包机无法访问 VS Code Marketplace，本方案不依赖 Marketplace，只依赖本项目生成的 VSIX。
- 如果需要更彻底地删除 VS Code 内置菜单或内置 Activity Bar 项，普通插件无法完全做到，需要维护 Code OSS / VS Code fork。
