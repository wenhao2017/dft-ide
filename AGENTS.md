# AGENTS.md

This file is a quick orientation guide for AI agents working on this repository.

## Project Summary

DFT IDE is a VS Code extension that turns VS Code into a DFT workflow console. It provides:

- A custom Activity Bar container and Tree View for DFT flows.
- A React webview home page and flow pages.
- COMMON, Design, and Verification workflow screens.
- Project creation helpers for a local `dft-ide-workspace`.
- IPC bridges from the webview to VS Code APIs for path picking, file opening, config persistence, Git sync, and mock job submission.
- Reserved backend API integration points for project dashboards.

The current codebase is a demo/foundation rather than a complete production IDE.

## Tech Stack

- VS Code Extension API for activation, commands, views, webviews, settings, workspace APIs, terminals, and Git extension integration.
- TypeScript with `strict` enabled.
- React 19 for the browser webview app.
- Ant Design 5 for UI.
- Zustand for webview state.
- `react-hook-form`, `zod`, and `@hookform/resolvers` for form/validation patterns.
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
src/extension.ts        VS Code extension host entry point
src/services/           Extension-host services, including Git and Donau mock services
src/webview/main.tsx    React webview entry point
src/webview/App.tsx     Webview theme, routing, and top-level layout
src/webview/components/ UI components grouped by flow or shared usage
src/webview/flows/      Flow container components
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
- Handling webview messages such as `selectPath`, `openFile`, `saveConfig`, `readConfig`, `syncGit`, `submitTask`, and `vscodeDemo`.
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

Use one-way `vscode.postMessage()` for fire-and-forget actions such as opening files or running VS Code demo actions.

Extension-side handling is in `currentPanel.webview.onDidReceiveMessage` inside `src/extension.ts`.

## Config Persistence

Config save/read/sync flows are currently file-based and resolved from the open VS Code workspace:

- `common` -> `main/common.cfg.json`
- `design` -> `design/design.cfg.json`
- `verification` -> `verification/verification.cfg.json`

If the workspace is multi-root, `resolveConfigPath()` first tries to match folder names (`main`, `design`, `verification`), then falls back to subdirectories under the first workspace folder.

`mergeConfigFile()` shallow-merges new data into existing JSON so different steps can persist separate fields without replacing the whole file.

## Git Integration

Git operations are wrapped in `src/services/gitService.ts` and use VS Code's built-in `vscode.git` extension API. Keep direct Git API usage in the extension host. Webview UI should call Git behavior through IPC.

Current capabilities include repository detection, changed-file collection, add, commit, pull, push, fetch, checkout, and branch creation.

## Backend Integration

Project dashboard data is handled by `src/webview/services/projectService.ts`.

When `dftIde.apiBase` is empty, mock projects are used. When configured, the webview calls:

```text
GET  {apiBase}/api/dft-ide/projects/dashboard
POST {apiBase}/api/dft-ide/projects/{projectId}/select
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
- For larger changes, run both `npm run compile` and `npm run check`.
- This repo currently contains mojibake in several Chinese strings/comments when viewed in the present environment. Be careful when touching localized text; preserve intended meaning and file encoding, and prefer UTF-8 for any new text.

