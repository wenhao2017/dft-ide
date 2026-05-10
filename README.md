# DFT IDE

DFT IDE is a VS Code extension that turns VS Code into a local DFT workflow console. It provides a project home page, DFT flow navigation, COMMON configuration, Design and Verification workflow pages, project/workspace opening helpers, local page-state persistence, Git-assisted sync, OBS viewer integration, execution helpers, and reserved backend API integration points.

The current codebase is still a demo/foundation rather than a complete production IDE. It is structured so different projects can load different COMMON, Design, Verification, Formal, and STA contexts over time.

## Features

- Custom DFT IDE Activity Bar container and flow Tree View.
- React webview home page with project search, selection, local-state path settings, and quick flow entry.
- COMMON flow for shared paths, design tree location, normalized table location, OBS common data, and Git sync.
- Design and Verification flows built on a shared `FlowShell`, including module scope selection through a shared design tree panel.
- File/folder picking, local path validation, file opening, OBS path support, and read-only OBS preview documents through webview IPC.
- File-based page-state persistence under `.dft-ide/local-state`, or a user-configured base path through `dftIde.localConfigPath`.
- Config save/read helpers that shallow-merge JSON so independent steps can persist separate fields.
- Design tree persistence from an explicit design-tree file, with fallback draft storage in COMMON local state.
- Module-level config skeleton generation for Design/Verification after saving a design tree.
- Git integration through VS Code's built-in Git extension: branch/status lookup, changed-file preview, add/commit/push, and opening the Source Control view.
- Execution helpers for opening VS Code terminals, tracking mock job status, cancelling mock jobs, and storing recent execution history locally.
- OBS viewer launching with SpaceToken retrieval and AES-128-CBC `fs-signature` generation.
- Backend integration points for project dashboards, project selection, and execution upload.

## Tech Stack

- VS Code Extension API for activation, commands, Activity Bar containers, Tree Views, Webview Panels, settings, workspace APIs, text documents, terminals, and Git extension integration.
- TypeScript with `strict` enabled.
- React 19 for the webview application.
- Ant Design 5 and `@ant-design/icons` for UI.
- Zustand for webview state.
- `react-hook-form`, `zod`, and `@hookform/resolvers` for form and validation patterns.
- `@tanstack/react-query` and `@tanstack/react-table` are installed for future server-state and richer table work.
- esbuild and `npm-run-all` for extension/webview bundling.

## Project Structure

```text
.
|-- assets/                         # Extension icons
|-- deploy/                         # Portable IDE packaging notes/scripts
|-- out/                            # Generated esbuild output; do not edit by hand
|-- src/
|   |-- extension.ts                # VS Code extension host entry and IPC handling
|   |-- services/
|   |   |-- donauService.ts         # Mock Donau job submit/status service
|   |   |-- gitService.ts           # VS Code Git extension wrapper
|   |   `-- obsService.ts           # OBS SpaceToken/signature/viewer integration
|   `-- webview/
|       |-- main.tsx                # React webview entry
|       |-- App.tsx                 # Theme, routing, and top-level webview layout
|       |-- components/             # Welcome, shared controls, flow steps, wizard demo
|       |-- flows/                  # COMMON, Design, and Verification containers
|       |-- hooks/                  # Flow config and VS Code path hooks
|       |-- services/               # Webview API clients
|       |-- store/                  # Zustand store
|       `-- utils/                  # VS Code API and IPC helpers
|-- package.json                    # Extension manifest, scripts, dependencies
|-- package-lock.json
`-- tsconfig.json
```

## Development

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

Watch extension and webview bundles:

```bash
npm run watch
```

Run in VS Code:

1. Open this repository in VS Code.
2. Run `npm run compile`, or keep `npm run watch` running.
3. Press `F5` and use the `Run DFT IDE Extension` launch config.
4. Open the DFT IDE Activity Bar view and choose Home, COMMON, Design, or Verification.

Package as VSIX:

```bash
npx @vscode/vsce package
```

`vscode:prepublish` runs `npm run compile`. The packaged extension should contain `package.json`, `README.md`, `CHANGELOG.md`, assets, and compiled files under `out/`; source, source maps, deployment files, local editor config, and development dependencies are excluded by `.vscodeignore`.

## Extension Host

Main file: `src/extension.ts`

The extension host owns all VS Code API calls. It registers:

- Activity Bar container: `dftIdeExplorer`
- Tree View: `dftIde.views.flows`
- Commands:
  - `dftIde.openWelcome`
  - `dftIde.openFlow`
  - `dftIde.createWorkspace`
  - `dftIde.createProject`
  - `dftIde.applyLayout`
  - `dftIde.restoreLayout`

It creates one reusable webview panel, sends `showWelcome` / `loadFlow` messages, handles webview IPC, manages local config paths, applies/restores the focused layout, wraps Git operations, opens terminals, and launches OBS viewer URLs.

## Webview App

Main files:

- `src/webview/main.tsx`
- `src/webview/App.tsx`
- `src/webview/components/Welcome.tsx`

The webview receives initial globals injected by `getWebviewHtml()`:

- `window.DFT_IDE_API_BASE`
- `window.DFT_IDE_INITIAL_VIEW`

`App.tsx` handles theme adaptation, top-level routing, and rendering `Welcome`, `CommonFlow`, `DesignFlow`, `VerificationFlow`, or the older wizard fallback. Formal and STA currently appear as planned entries and can follow the Design/Verification pattern later.

Shared webview state lives in `src/webview/store/wizardStore.ts`:

- `activeProject`
- `flowContext`
- `taskPayload`
- wizard step helpers

## IPC Pattern

Webview IPC helpers live in `src/webview/utils/ipc.ts`.

Use `ipcRequest()` for request/response calls. The extension host must reply with:

```text
{command}Response
```

and the same `requestId`.

Use one-way `vscode.postMessage()` for fire-and-forget actions such as opening files, opening the SCM view, or running VS Code demo actions. Extension-side handling is in `currentPanel.webview.onDidReceiveMessage` inside `src/extension.ts`.

Current IPC capabilities include Git info, path picking, path validation, file opening, OBS read-only preview, OBS viewer launch, project workspace opening, config save/read, design-tree save/read, local config path settings, Git sync, execution terminal opening, execution history save/read, mock task submit/cancel, and VS Code capability demos.

## Local State

Flow and page configuration is stored as JSON under the active project root by default:

```text
.dft-ide/local-state/
```

Users can override the base directory with:

```json
"dftIde.localConfigPath": ""
```

When a custom base is configured, the extension scopes data by project name plus a hash of the project root, then stores page state under that project-specific directory. Local state is intentionally ignored by Git; the extension adds `.dft-ide/` or the matching local-state path to the project `.gitignore` when needed.

`resolveConfigPath(flow)` maps stable page keys to JSON files. For example:

```text
common -> .dft-ide/local-state/common.json
design -> .dft-ide/local-state/design.json
verification -> .dft-ide/local-state/verification.json
design/<module>/config -> .dft-ide/local-state/design/<module>/config.json
```

`mergeConfigFile()` shallow-merges new data into existing JSON so separate steps do not overwrite unrelated fields.

## Design Tree

Design and Verification use `src/webview/components/shared/DesignTreePanel.tsx` to select and maintain module scope.

If COMMON config contains `designTree`, the extension resolves it as a file path, or as a directory containing `design_tree.mock.json`. Saving the tree writes to that file. If no design-tree path is configured, the tree is stored as `designTreeDraft` inside COMMON local state.

Saving a design tree also updates Design/Verification module config skeletons, including module keys, titles, types, active module key, and per-module config files.

## Git Integration

Git operations are wrapped in `src/services/gitService.ts` and use VS Code's built-in `vscode.git` extension API. Webview code should call Git behavior through IPC instead of importing Git APIs directly.

Current capabilities include:

- Repository detection for the active workspace/resource.
- Branch, commit, upstream, and changed-file status lookup.
- Changed-file preview for the COMMON Git sync dialog.
- Source Control view opening.
- Add, commit, pull, push, fetch, checkout, and branch creation helpers.

## OBS Integration

OBS viewer support is split between:

- `src/services/obsService.ts` for extension-host token/signature/viewer URL logic.
- `src/webview/components/shared/ObsViewer.tsx` for the webview-side object browser mock UI and OBS path selection.
- `src/webview/components/shared/PathInput.tsx` and `useVscodePath()` for selecting or opening `obs://` paths.

Relevant settings:

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

`obsService` requests a SpaceToken, builds an `fs-signature` with AES-128-CBC, and opens the external viewer URL. The AES key and IV must each be exactly 16 UTF-8 bytes.

## Backend Integration

Project dashboard data is handled by `src/webview/services/projectService.ts`.

When `dftIde.apiBase` is empty, the webview uses local mock projects. When configured, it calls:

```text
GET  {apiBase}/api/dft-ide/projects/dashboard
POST {apiBase}/api/dft-ide/projects/{projectId}/select
POST {apiBase}/api/dft-ide/projects/{projectId}/executions
```

Keep backend-facing data access behind service functions so mocks can be replaced cleanly.

## Layout Mode

The extension exposes DFT-focused workbench layout settings:

```json
"dftIde.layout.autoApply": false,
"dftIde.layout.hideMenuBar": false,
"dftIde.layout.hideActivityBar": false
```

Commands:

- `DFT IDE: Apply Layout`
- `DFT IDE: Restore VS Code Layout`

The webview can also toggle the focused layout through IPC. The extension backs up existing global settings before applying changes and restores them when requested.

## Adding a New Flow

Typical steps:

1. Add a Tree View entry to `FLOW_CONFIGS` in `src/extension.ts`.
2. Add title/subtitle/accent metadata to `flowMeta` in `src/webview/App.tsx`.
3. Create a flow container in `src/webview/flows/`.
4. Add a render branch in `renderFlowContent()` in `App.tsx`.
5. Add flow-specific components under `src/webview/components/<flow-name>/`.
6. Reuse `FlowShell` for step-based flows unless the UX needs a different structure.
7. Use `useFlowConfig()` and IPC helpers for page state instead of hard-coding project data in UI components.

## IDE Packaging

Portable IDE packaging notes and an optional script live in:

```text
deploy/README.zh-CN.md
deploy/package_ide.py
```

The intended delivery model is VS Code Portable Mode: start from an official VS Code ZIP/TAR.GZ distribution, create a portable `data/` directory, install the generated VSIX into that copy of VS Code, write default DFT IDE settings, and deliver the whole directory as a directly launchable IDE.

## Coding Notes

- Do not edit generated files under `out/` directly.
- Keep extension-host code free of browser-only APIs.
- Keep webview code browser-safe and communicate with VS Code through IPC.
- Add direct runtime imports to `dependencies` in `package.json`; add build/test-only packages to `devDependencies`.
- Prefer existing Ant Design and shared component patterns.
- Keep project-specific data access inside service modules.
- Keep localized text in UTF-8. Some existing source comments/strings may appear as mojibake in this environment, so preserve intended meaning when touching them.
- For larger changes, run both `npm run compile` and `npm run check`.
