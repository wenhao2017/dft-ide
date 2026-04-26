# DFT IDE

[English README](README.md)

DFT IDE 是一个 VS Code 插件工程，用于把 VS Code 定制成面向 DFT 工作流的本地工作台。当前工程已经包含项目主页、DFT 流程导航、公共配置、设计流程、验证流程、项目创建、VS Code 原生能力示例，以及后端 API 对接预留点。

当前代码是一个 demo 基础工程，后续可以继续演进为项目驱动的 IDE：用户选择不同项目后，COMMON、Design、Verification、Formal、STA 等配置和流程都可以按项目加载不同上下文。

## 技术栈

- VS Code Extension API：插件激活、命令、Activity Bar 容器、Tree View、Webview Panel、通知、Quick Pick、终端、设置、文件打开、工作区 API。
- TypeScript：扩展宿主侧和 webview 前端都使用 TypeScript。
- React 19：webview UI 框架。
- Ant Design 5：表单、卡片、列表、按钮、布局、流程页面等 UI 组件。
- Zustand：webview 侧轻量状态管理，用于当前项目和流程上下文。
- react-hook-form + zod + @hookform/resolvers：表单状态和校验示例。
- esbuild：分别打包扩展宿主代码和浏览器端 webview 代码。
- npm-run-all：并行执行扩展和 webview 构建脚本。

已安装但当前还没有深度使用的依赖：

- @tanstack/react-query：预留给后端数据请求、项目/配置加载、任务轮询、缓存失效等场景。
- @tanstack/react-table：预留给复杂表格，例如报告、pin 表、coverage、任务历史等。

## 项目结构

```text
.
|-- assets/                         # 插件图标资源
|-- out/                            # esbuild 生成的构建产物
|-- src/
|   |-- extension.ts                # VS Code 扩展宿主入口
|   |-- services/
|   |   `-- donauService.ts         # Donau 任务提交/状态查询 mock 服务
|   `-- webview/
|       |-- main.tsx                # React webview 入口
|       |-- App.tsx                 # 主题、路由和顶层布局
|       |-- components/
|       |   |-- Welcome.tsx         # 项目主页
|       |   |-- shared/             # 通用组件
|       |   |-- design/             # Design 流程步骤
|       |   |-- verification/       # Verification 流程步骤
|       |   `-- wizard/             # 早期 wizard demo 流程
|       |-- flows/                  # 流程容器
|       |-- hooks/                  # 通用 React hooks
|       |-- services/               # webview 侧 API 客户端
|       |-- store/                  # Zustand 状态
|       `-- utils/                  # VS Code API 和 IPC 工具
|-- package.json                    # 插件清单、脚本和依赖
|-- package-lock.json
`-- tsconfig.json
```

## 开发命令

安装依赖：

```bash
npm install
```

构建一次：

```bash
npm run compile
```

同时监听扩展和 webview 构建：

```bash
npm run watch
```

类型检查：

```bash
npx tsc --noEmit
```

在 VS Code 中调试：

1. 用 VS Code 打开当前仓库。
2. 先执行一次 `npm run compile`，或者保持 `npm run watch` 运行。
3. 按 `F5` 启动 Extension Development Host。
4. 在 DFT IDE 侧边栏中打开主页、COMMON、Design 或 Verification。

注意：Extension Development Host 和真实安装后的插件体验不完全一致。窗口状态、webview 状态恢复，在正式安装插件后通常更接近真实用户场景。

## 构建产物

当前有两个 esbuild bundle：

- `out/extension.js`：VS Code 扩展宿主侧 CommonJS bundle。
- `out/webview.js`：React webview 浏览器端 bundle。

`vscode:prepublish` 会执行 `npm run compile`，打包插件前会自动生成这两个产物。

## VS Code 扩展宿主

主文件：

```text
src/extension.ts
```

主要职责：

- 注册 DFT IDE Activity Bar 容器和 Tree View。
- 注册命令：
  - `dftIde.openWelcome`
  - `dftIde.openFlow`
  - `dftIde.createProject`
  - `dftIde.applyLayout`
  - `dftIde.restoreLayout`
- 创建和管理 webview panel。
- 处理 webview 发来的 IPC 消息：
  - 路径选择
  - 打开文件/目录
  - 创建项目
  - mock 任务提交和状态轮询
  - VS Code 原生能力示例
- 应用可选的 DFT IDE 工作台布局设置。

## Webview 应用

主文件：

- `src/webview/main.tsx`
- `src/webview/App.tsx`
- `src/webview/components/Welcome.tsx`

Webview 是一个嵌入 VS Code Webview Panel 的 React 应用。扩展宿主会通过注入全局变量传递初始化信息：

- `window.DFT_IDE_API_BASE`
- `window.DFT_IDE_INITIAL_VIEW`

运行时通信通过 `vscode.postMessage` 发送到扩展宿主侧处理。

## 项目 API 对接

项目列表 API 客户端位于：

```text
src/webview/services/projectService.ts
```

当 `dftIde.apiBase` 为空时，主页使用本地 mock 项目数据。当配置了后端地址后，webview 会调用：

```text
GET  {apiBase}/api/dft-ide/projects/dashboard
POST {apiBase}/api/dft-ide/projects/{projectId}/select
```

期望的 dashboard 响应结构：

```ts
interface ProjectDashboard {
  projects: DftProject[];
  currentProjectId: string | null;
}

interface DftProject {
  id: string;
  name: string;
  rootPath: string;
  owner: string;
  updatedAt: string;
  stage: string;
  description: string;
}
```

VS Code 设置项在 `package.json` 中声明：

```json
"dftIde.apiBase": ""
```

## 状态模型

主 store：

```text
src/webview/store/wizardStore.ts
```

重要状态：

- `activeProject`：当前选中的项目 id、名称和根路径。
- `flowContext`：当前流程分类和可选 project id。
- `taskPayload`：早期 wizard 流程使用的共享任务 payload。

后续接入项目级配置时，建议优先从 `activeProject` / `flowContext.projectId` 加载配置，不要把项目相关数据硬编码在具体步骤组件里。

## 新增一个流程

通常需要改这些地方：

1. 在 `src/extension.ts` 的 `FLOW_CONFIGS` 中增加左侧树入口。
2. 在 `src/webview/App.tsx` 的 `flowMeta` 中增加标题、描述和主题色。
3. 在 `src/webview/flows/` 下新增流程容器组件。
4. 如果是步骤型流程，复用 `src/webview/components/shared/FlowShell.tsx`。
5. 在 `App.tsx` 的 `renderFlowContent` 中增加渲染分支。
6. 在 `src/webview/components/<flow-name>/` 下新增具体步骤组件。

Formal 和 STA 目前已经作为规划入口出现在 UI 中，后续可以参考 Design / Verification 的方式继续补齐。

## IPC 通信模式

Webview 到扩展宿主的工具函数位于：

```text
src/webview/utils/ipc.ts
```

需要等待响应的动作使用 request/response 风格，例如选择文件路径。不需要响应的动作可以直接 `vscode.postMessage`，例如打开文件或触发 VS Code 能力示例。

扩展宿主侧的消息处理位于 `src/extension.ts` 中的：

```text
currentPanel.webview.onDidReceiveMessage
```

## DFT IDE 布局模式

插件提供了面向 DFT IDE 的工作台布局设置：

```json
"dftIde.layout.autoApply": true,
"dftIde.layout.hideMenuBar": true,
"dftIde.layout.hideActivityBar": true
```

命令：

- `DFT IDE: Apply Layout`
- `DFT IDE: Restore VS Code Layout`

应用布局前会备份已有全局设置，执行恢复命令时会尽量还原。

## 开发注意事项

- 扩展宿主侧代码运行在 Node/VS Code Extension Host 中，应使用 VS Code API，不要使用浏览器专属 API。
- Webview 侧代码运行在浏览器环境中，应通过 IPC 调用 VS Code 能力。
- 源码中直接 import 的三方包，需要显式写入 `package.json`。
- 通用 UI 和流程骨架尽量放在 `components/shared`。
- 项目级数据建议封装到 service 中，方便后续用真实后端替换 mock。
- 较大改动提交前建议同时运行 `npm run compile` 和 `npx tsc --noEmit`。
