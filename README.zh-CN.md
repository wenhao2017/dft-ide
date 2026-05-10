# DFT IDE

[English README](README.md)

DFT IDE 是一个 VS Code 扩展，用来把 VS Code 打造成面向 DFT 工作流的本地工作台。它提供项目主页、DFT 流程导航、COMMON 公共配置、Design 和 Verification 工作流页面、项目/工作区打开、本地页面状态持久化、Git 同步辅助、OBS 查看器集成、执行辅助能力，以及预留的后端 API 对接点。

当前代码仍是 demo/foundation，不是完整生产级 IDE。代码结构已经按项目驱动方式组织，后续可以让不同项目加载不同的 COMMON、Design、Verification、Formal、STA 上下文。

## 功能概览

- 自定义 DFT IDE Activity Bar 容器和流程 Tree View。
- React webview 项目主页，支持项目搜索、项目选择、本地状态目录配置和流程快捷入口。
- COMMON 流程用于维护公共路径、设计树路径、归一化表格路径、OBS 公共数据和 Git 同步入口。
- Design / Verification 流程基于共享 `FlowShell`，并通过共享设计树面板选择模块范围。
- 通过 IPC 支持文件/目录选择、本地路径校验、文件打开、OBS 路径选择和只读 OBS 预览文档。
- 页面状态默认保存到 `.dft-ide/local-state`，也可以通过 `dftIde.localConfigPath` 指定外部基目录。
- 配置读写使用 JSON 文件，并通过浅合并避免不同步骤互相覆盖字段。
- 设计树可保存到显式设计树文件；没有配置设计树文件时，会回退保存到 COMMON 本地状态草稿。
- 保存设计树时会同步生成 Design / Verification 的模块级配置骨架。
- Git 能力基于 VS Code 内置 Git 扩展，支持分支/状态读取、变更文件预览、add/commit/push 和打开 Source Control。
- 执行辅助包括打开 VS Code 终端、mock 任务状态轮询、取消 mock 任务，以及保存最近执行历史。
- OBS 查看器支持 SpaceToken 获取、AES-128-CBC `fs-signature` 生成和外部 viewer URL 打开。
- 预留项目 dashboard、项目选择、执行结果上传等后端 API 对接点。

## 技术栈

- VS Code Extension API：扩展激活、命令、Activity Bar、Tree View、Webview Panel、设置、工作区、文本编辑器、终端和 Git 扩展集成。
- TypeScript，并启用 `strict`。
- React 19：webview 应用框架。
- Ant Design 5 和 `@ant-design/icons`：UI 组件和图标。
- Zustand：webview 侧状态管理。
- `react-hook-form`、`zod`、`@hookform/resolvers`：表单和校验模式。
- `@tanstack/react-query`、`@tanstack/react-table`：已安装，预留给服务端状态和复杂表格。
- esbuild 和 `npm-run-all`：扩展端与 webview 端打包。

## 项目结构

```text
.
|-- assets/                         # 扩展图标
|-- deploy/                         # Portable IDE 打包说明/脚本
|-- out/                            # esbuild 生成产物，不要手工编辑
|-- src/
|   |-- extension.ts                # VS Code 扩展宿主入口和 IPC 处理
|   |-- services/
|   |   |-- donauService.ts         # Donau mock 任务提交/状态服务
|   |   |-- gitService.ts           # VS Code Git 扩展封装
|   |   `-- obsService.ts           # OBS SpaceToken/signature/viewer 集成
|   `-- webview/
|       |-- main.tsx                # React webview 入口
|       |-- App.tsx                 # 主题、路由和顶层布局
|       |-- components/             # Welcome、共享控件、流程步骤、旧 wizard demo
|       |-- flows/                  # COMMON、Design、Verification 容器
|       |-- hooks/                  # 流程配置和 VS Code 路径 hooks
|       |-- services/               # webview 侧 API 客户端
|       |-- store/                  # Zustand store
|       `-- utils/                  # VS Code API 和 IPC 辅助
|-- package.json                    # 扩展 manifest、脚本和依赖
|-- package-lock.json
`-- tsconfig.json
```

## 开发命令

安装依赖：

```bash
npm install
```

构建扩展端和 webview 端：

```bash
npm run compile
```

类型检查：

```bash
npm run check
```

同时监听两个 bundle：

```bash
npm run watch
```

在 VS Code 中调试：

1. 用 VS Code 打开当前仓库。
2. 执行 `npm run compile`，或保持 `npm run watch` 运行。
3. 按 `F5`，使用 `Run DFT IDE Extension` 启动配置。
4. 在 DFT IDE Activity Bar 视图中打开 Home、COMMON、Design 或 Verification。

打包 VSIX：

```bash
npx @vscode/vsce package
```

`vscode:prepublish` 会执行 `npm run compile`。打包后的扩展应包含 `package.json`、`README.md`、`CHANGELOG.md`、assets 和编译后的 `out/` 产物；源码、source map、部署文件、本地编辑器配置和开发依赖会被 `.vscodeignore` 排除。

## 扩展宿主

主文件：`src/extension.ts`

扩展宿主负责所有 VS Code API 调用，并注册：

- Activity Bar 容器：`dftIdeExplorer`
- Tree View：`dftIde.views.flows`
- 命令：
  - `dftIde.openWelcome`
  - `dftIde.openFlow`
  - `dftIde.createWorkspace`
  - `dftIde.createProject`
  - `dftIde.applyLayout`
  - `dftIde.restoreLayout`

扩展宿主会创建并复用一个 webview panel，向 webview 发送 `showWelcome` / `loadFlow` 消息，处理 IPC，管理本地配置目录，应用/恢复专注布局，封装 Git 操作，打开终端，并启动 OBS viewer URL。

## Webview 应用

主文件：

- `src/webview/main.tsx`
- `src/webview/App.tsx`
- `src/webview/components/Welcome.tsx`

webview 会接收 `getWebviewHtml()` 注入的初始全局变量：

- `window.DFT_IDE_API_BASE`
- `window.DFT_IDE_INITIAL_VIEW`

`App.tsx` 负责主题适配、顶层路由，以及渲染 `Welcome`、`CommonFlow`、`DesignFlow`、`VerificationFlow` 或旧 wizard fallback。Formal 和 STA 当前是规划入口，后续可按 Design / Verification 模式补齐。

共享状态位于 `src/webview/store/wizardStore.ts`：

- `activeProject`
- `flowContext`
- `taskPayload`
- wizard step helpers

## IPC 通信模式

Webview IPC 辅助函数位于：

```text
src/webview/utils/ipc.ts
```

需要响应的调用使用 `ipcRequest()`。扩展宿主必须返回：

```text
{command}Response
```

并携带相同的 `requestId`。

不需要响应的动作可以直接使用 `vscode.postMessage()`，例如打开文件、打开 SCM 视图或触发 VS Code demo。扩展侧处理逻辑位于 `src/extension.ts` 的 `currentPanel.webview.onDidReceiveMessage`。

当前 IPC 能力包括 Git 信息、路径选择、路径校验、文件打开、OBS 只读预览、OBS viewer 启动、项目工作区打开、配置保存/读取、设计树保存/读取、本地配置目录设置、Git 同步、执行终端打开、执行历史保存/读取、mock 任务提交/取消，以及 VS Code 能力演示。

## 本地状态

流程和页面配置默认保存到当前项目根目录：

```text
.dft-ide/local-state/
```

用户可以通过以下设置指定外部基目录：

```json
"dftIde.localConfigPath": ""
```

当配置了外部基目录时，扩展会按项目名和项目根路径 hash 自动隔离不同项目的数据。页面状态不参与 Git 管理；扩展会在需要时把 `.dft-ide/` 或对应 local-state 相对路径写入项目 `.gitignore`。

`resolveConfigPath(flow)` 会把稳定页面 key 映射成 JSON 文件。例如：

```text
common -> .dft-ide/local-state/common.json
design -> .dft-ide/local-state/design.json
verification -> .dft-ide/local-state/verification.json
design/<module>/config -> .dft-ide/local-state/design/<module>/config.json
```

`mergeConfigFile()` 会对已有 JSON 和新数据做浅合并，避免不同步骤覆盖彼此字段。

## 设计树

Design 和 Verification 使用 `src/webview/components/shared/DesignTreePanel.tsx` 选择和维护模块范围。

如果 COMMON 配置中包含 `designTree`，扩展会把它解析为文件路径；如果它是目录，则使用该目录下的 `design_tree.mock.json`。保存设计树时会写入该文件。没有配置设计树路径时，设计树会作为 `designTreeDraft` 保存到 COMMON 本地状态。

保存设计树时还会更新 Design / Verification 的模块配置骨架，包括模块 key、标题、类型、当前模块，以及每个模块自己的 config 文件。

## Git 集成

Git 操作封装在 `src/services/gitService.ts`，并使用 VS Code 内置 `vscode.git` 扩展 API。Webview 前端应通过 IPC 调用 Git 能力，不要直接依赖 Git API。

当前能力包括：

- 根据当前工作区/资源识别仓库。
- 读取分支、commit、upstream 和变更文件状态。
- COMMON Git 同步弹窗中的变更文件预览。
- 打开 Source Control 视图。
- add、commit、pull、push、fetch、checkout 和创建分支辅助。

## OBS 集成

OBS 相关能力分布在：

- `src/services/obsService.ts`：扩展宿主侧 token、signature、viewer URL 逻辑。
- `src/webview/components/shared/ObsViewer.tsx`：webview 侧对象浏览 mock UI 和 OBS 路径选择。
- `src/webview/components/shared/PathInput.tsx` 与 `useVscodePath()`：选择或打开 `obs://` 路径。

相关设置：

```json
"dftIde.obs.page": "",
"dftIde.obs.groupName": "",
"dftIde.obs.aesKey": "",
"dftIde.obs.aesIv": "",
"dftIde.obs.getSpaceTokenPath": "",
"dftIde.obs.viewerUrlTemplate": "{obsPage}?spaceName={spaceName}&spaceToken={spaceToken}&w3id={w3id}",
"dftIde.obs.w3id": "",
"dftIde.obs.spaceName": ""
```

`obsService` 会请求 SpaceToken，使用 AES-128-CBC 生成 `fs-signature`，然后打开外部 viewer URL。AES key 和 IV 使用 UTF-8 编码后都必须正好是 16 字节。

## 后端对接

项目 dashboard 数据由 `src/webview/services/projectService.ts` 管理。

当 `dftIde.apiBase` 为空时，webview 使用本地 mock 项目。当配置了后端地址时，会调用：

```text
GET  {apiBase}/api/dft-ide/projects/dashboard
POST {apiBase}/api/dft-ide/projects/{projectId}/select
POST {apiBase}/api/dft-ide/projects/{projectId}/executions
```

后端相关数据访问应继续放在 service 函数中，便于 mock 和真实后端平滑替换。

## 布局模式

扩展提供面向 DFT IDE 的专注工作台布局设置：

```json
"dftIde.layout.autoApply": false,
"dftIde.layout.hideMenuBar": false,
"dftIde.layout.hideActivityBar": false
```

命令：

- `DFT IDE: Apply Layout`
- `DFT IDE: Restore VS Code Layout`

webview 也可以通过 IPC 切换专注布局。扩展在应用布局前会备份已有全局设置，恢复时尽量还原。

## 新增流程

通常需要修改：

1. 在 `src/extension.ts` 的 `FLOW_CONFIGS` 中增加 Tree View 入口。
2. 在 `src/webview/App.tsx` 的 `flowMeta` 中增加标题、副标题和主题色。
3. 在 `src/webview/flows/` 下创建流程容器。
4. 在 `App.tsx` 的 `renderFlowContent()` 中增加渲染分支。
5. 在 `src/webview/components/<flow-name>/` 下增加流程组件。
6. 步骤型流程优先复用 `FlowShell`。
7. 使用 `useFlowConfig()` 和 IPC 辅助保存页面状态，不要把项目数据硬编码在 UI 组件中。

## IDE 打包交付

Portable IDE 打包说明和可选脚本位于：

```text
deploy/README.zh-CN.md
deploy/package_ide.py
```

推荐交付方式是 VS Code Portable Mode：以官方 VS Code ZIP/TAR.GZ 为底座，创建 portable `data/` 目录，把当前扩展打成 VSIX 并安装到该 VS Code 中，写入默认 DFT IDE 设置，最后交付整个可直接启动的 IDE 目录。

## 开发注意事项

- 不要直接编辑 `out/` 下的生成文件。
- 扩展宿主代码运行在 Node/VS Code Extension Host 中，不要使用浏览器专属 API。
- Webview 代码运行在浏览器环境中，应通过 IPC 调用 VS Code 能力。
- 源码中直接 `import` 的运行时依赖要写入 `dependencies`；构建/测试依赖写入 `devDependencies`。
- 优先复用 Ant Design 和 `components/shared` 中的共享模式。
- 项目相关数据访问应封装到 service 中。
- 本地化文本请使用 UTF-8。当前环境下部分既有源码注释/字符串可能显示为 mojibake，触碰时要保留原意。
- 较大改动提交前建议同时运行 `npm run compile` 和 `npm run check`。
