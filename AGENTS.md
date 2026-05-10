# AGENTS.md

This file is a quick orientation guide for AI agents working on this repository.

## Project Summary

DFT IDE is a VS Code extension that turns VS Code into a local DFT workflow console. It provides:

- A custom Activity Bar container and Tree View for DFT flows.
- A React webview home page and flow pages.
- Common, Design, and Verification workflow screens.
- Project creation/opening helpers for local DFT workspaces.
- Local page-state persistence under `.dft-ide/local-state` or a user-configured base path.
- IPC bridges from the webview to VS Code APIs for path picking, path validation, file opening, config persistence, design-tree persistence, Git sync, OBS viewer actions, execution history, terminal opening, and mock job submission/cancellation.
- Git integration through VS Code's built-in Git extension.
- OBS SpaceToken/signature/viewer integration.
- Reserved backend API integration points for project dashboards, project selection, and execution upload.

The current codebase is a demo/foundation rather than a complete production IDE.

## Tech Stack

- VS Code Extension API for activation, commands, views, webviews, settings, workspace APIs, text documents, terminals, and Git extension integration.
- TypeScript with `strict` enabled.
- React 19 for the browser webview app.
- Ant Design 5 and `@ant-design/icons` for UI.
- Zustand for webview state.
- `react-hook-form`, `zod`, and `@hookform/resolvers` for form/validation patterns.
- `@tanstack/react-query` and `@tanstack/react-table` are installed for future server-state and richer table work.
- esbuild for bundling extension-host and webview code.
- npm scripts via `npm-run-all`.

## Important Commands

Install dependencies:

```bash
npm install
```

Build both bundles:

```bash
npm run compile
```

Type-check:

```bash
npm run check
```

Watch both extension and webview:

```bash
npm run watch
```

Package VSIX:

```bash
npx @vscode/vsce package
```

Debug in VS Code with the `Run DFT IDE Extension` launch config. It runs `npm: compile` before starting the Extension Development Host.

## Repository Layout

```text
assets/                 VS Code extension icons
deploy/                 Portable IDE packaging notes/scripts
out/                    Generated esbuild output; do not edit by hand
src/extension.ts        VS Code extension host entry point and IPC handling
src/services/           Extension-host services: Git, OBS, and Donau mock services
src/webview/main.tsx    React webview entry point
src/webview/App.tsx     Webview theme, routing, and top-level layout
src/webview/components/ UI components grouped by flow or shared usage
src/webview/flows/      Common, Design, and Verification flow containers
src/webview/hooks/      Shared React hooks
src/webview/services/   Webview-side API clients
src/webview/store/      Zustand store
src/webview/utils/      VS Code API and IPC helpers
```

## Runtime Architecture

There are two runtime environments:

- Extension host: Node-like VS Code extension environment. Main file: `src/extension.ts`.
- Webview: browser environment embedded in a VS Code Webview Panel. Entry: `src/webview/main.tsx`.

Keep VS Code APIs on the extension-host side. Webview code should call into VS Code through IPC helpers rather than importing or assuming VS Code APIs directly.

The webview receives initial globals injected by `getWebviewHtml()`:

- `window.DFT_IDE_API_BASE`
- `window.DFT_IDE_INITIAL_VIEW`

## Extension Host Notes

`src/extension.ts` is responsible for:

- Registering the `dftIdeExplorer` Activity Bar container and `dftIde.views.flows` Tree View.
- Registering commands:
  - `dftIde.openWelcome`
  - `dftIde.openFlow`
  - `dftIde.createWorkspace`
  - `dftIde.createProject`
  - `dftIde.applyLayout`
  - `dftIde.restoreLayout`
- Creating and reusing one webview panel.
- Sending `showWelcome` / `loadFlow` messages to the webview.
- Handling webview messages such as `selectPath`, `validatePath`, `openFile`, `openObsFileReadOnly`, `openObsViewer`, `openProjectWorkspace`, `saveConfig`, `readConfig`, `readDesignTree`, `saveDesignTree`, `getLocalConfigInfo`, `setLocalConfigPath`, `syncGit`, `openExecutionTerminal`, `saveExecutionHistory`, `getExecutionHistory`, `submitTask`, `cancelTask`, and `vscodeDemo`.
- Applying/restoring DFT-focused VS Code layout settings.

Flow entries in the left Tree View are configured in `FLOW_CONFIGS` in `src/extension.ts`.

## Webview Notes

`src/webview/App.tsx` owns:

- Ant Design theme setup based on VS Code theme classes.
- Top-level flow routing.
- Handling `showWelcome` and `loadFlow` messages.
- Rendering `Welcome`, `CommonFlow`, `DesignFlow`, `VerificationFlow`, or the older wizard demo fallback.

Shared state lives in `src/webview/store/wizardStore.ts`:

- `activeProject`
- `flowContext`
- `taskPayload`
- wizard step helpers

For new step-based flows, prefer reusing `src/webview/components/shared/FlowShell.tsx`.

## IPC Pattern

Webview IPC helpers live in `src/webview/utils/ipc.ts`.

Use `ipcRequest()` style helpers when the webview needs a response. The extension host must reply with:

```text
{command}Response
```

and the same `requestId`.

Use one-way `vscode.postMessage()` for fire-and-forget actions such as opening files, opening the SCM view, or running VS Code demo actions.

Extension-side handling is in `currentPanel.webview.onDidReceiveMessage` inside `src/extension.ts`.

## Config Persistence

Flow/page state is file-based and resolved from the active project root:

- Default root: `.dft-ide/local-state/`
- Optional configured base: `dftIde.localConfigPath`

When `dftIde.localConfigPath` is configured, the extension scopes data by project name plus a hash of the project root, then writes local-state files under that project-specific directory.

Examples:

- `common` -> `common.json`
- `design` -> `design.json`
- `verification` -> `verification.json`
- `design/<module>/config` -> `design/<module>/config.json`
- `verification/<module>/config` -> `verification/<module>/config.json`

`mergeConfigFile()` shallow-merges new data into existing JSON so different steps can persist separate fields without replacing the whole file.

The extension automatically ensures local state is ignored by Git by adding `.dft-ide/` or the relevant relative local-state path to `.gitignore`.

## Design Tree

Shared design tree behavior lives in `src/webview/components/shared/DesignTreePanel.tsx`.

If Common config has a `designTree` path, the extension writes tree state there. Directory paths resolve to `design_tree.mock.json`. If no design-tree path is configured, the tree is stored as `designTreeDraft` in Common local state.

Saving a design tree also updates module config skeletons for the current flow, including `activeModuleKey`, module metadata, and per-module config files.

## Git Integration

Git operations are wrapped in `src/services/gitService.ts` and use VS Code's built-in `vscode.git` extension API. Keep direct Git API usage in the extension host. Webview UI should call Git behavior through IPC.

Current capabilities include repository detection, branch/status lookup, changed-file collection, Source Control opening, add, commit, pull, push, fetch, checkout, and branch creation.

## OBS Integration

OBS service logic lives in `src/services/obsService.ts`. It reads `dftIde.obs.*` settings, requests a SpaceToken, generates an AES-128-CBC `fs-signature`, builds a viewer URL from `viewerUrlTemplate`, and opens it externally.

Webview-side OBS affordances live in:

- `src/webview/components/shared/ObsViewer.tsx`
- `src/webview/components/shared/PathInput.tsx`
- `src/webview/hooks/useVscodePath.ts`

OBS settings declared in `package.json` include `page`, `groupName`, `aesKey`, `aesIv`, `getSpaceTokenPath`, `viewerUrlTemplate`, `w3id`, and `spaceName`.

## Backend Integration

Project dashboard data is handled by `src/webview/services/projectService.ts`.

When `dftIde.apiBase` is empty, mock projects are used. When configured, the webview calls:

```text
GET  {apiBase}/api/dft-ide/projects/dashboard
POST {apiBase}/api/dft-ide/projects/{projectId}/select
POST {apiBase}/api/dft-ide/projects/{projectId}/executions
```

Keep backend-facing data access behind service functions so mocks can be replaced cleanly.

## Adding A New Flow

Typical places to update:

1. Add a Tree View entry to `FLOW_CONFIGS` in `src/extension.ts`.
2. Add title/subtitle/accent metadata to `flowMeta` in `src/webview/App.tsx`.
3. Create a flow container in `src/webview/flows/`.
4. Add a render branch in `renderFlowContent()` in `src/webview/App.tsx`.
5. Add flow-specific components under `src/webview/components/<flow-name>/`.
6. Reuse `FlowShell` for step-based flows unless the UX requires a different structure.
7. Use `useFlowConfig()` and IPC helpers for persistence instead of hard-coding project data in UI components.

Formal and STA currently exist as planned navigation entries and can follow the Design/Verification pattern.

## Packaging Notes

`package.json` contributes the extension manifest, commands, settings, Activity Bar container, and Tree View.

The compiled outputs are:

- `out/extension.js`
- `out/webview.js`

The `.vscodeignore` excludes source, local config, logs, source maps, deployment files, and development dependencies from the VSIX. Do not rely on files excluded there at extension runtime.

Portable IDE packaging notes are in `deploy/README.zh-CN.md`, with an optional script at `deploy/package_ide.py`.

## Coding Guidelines For Agents

- Do not edit generated files under `out/` directly.
- Keep extension-host code free of browser-only APIs.
- Keep webview code browser-safe and communicate with VS Code through IPC.
- Add direct runtime imports to `dependencies` in `package.json`; add build/test-only packages to `devDependencies`.
- Prefer existing Ant Design and shared component patterns.
- Keep project-specific data access inside service modules instead of hard-coding data in UI steps.
- Preserve UTF-8 for new documentation and localized text.
- This repo currently contains mojibake in several Chinese strings/comments when viewed in the present environment. Be careful when touching localized source text; preserve intended meaning and file encoding.
- For larger changes, run both `npm run compile` and `npm run check`.
