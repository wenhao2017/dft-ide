# Changelog

## 0.0.1

- Added the DFT IDE Activity Bar container, flow Tree View, and reusable webview panel.
- Added project home page with mock/backend project dashboard, project selection, project workspace opening, and local-state path configuration.
- Added Common, Design, and Verification workflow pages with shared flow shell patterns.
- Added shared design tree editing/selection, design-tree persistence, and module-scoped Design/Verification config skeleton generation.
- Added local JSON page-state persistence under `.dft-ide/local-state` or `dftIde.localConfigPath`, with automatic Git ignore handling.
- Added IPC bridges for path picking, path validation, file opening, config save/read, design-tree save/read, execution terminal opening, execution history, Git sync, OBS viewer, and mock job control.
- Added Git integration through VS Code's built-in Git extension, including branch/status lookup, changed-file preview, Source Control opening, add/commit/push helpers, and branch operation wrappers.
- Added OBS integration settings, SpaceToken request flow, AES-128-CBC `fs-signature` generation, external viewer opening, and webview-side OBS path selection/preview affordances.
- Added execution log/history UI helpers and backend execution upload integration point.
- Added VS Code capability demos for notifications, Quick Pick, clipboard, terminal, settings, and external links.
- Added DFT-focused layout commands and webview-triggered layout toggle.
- Added English, Chinese, changelog, and agent-facing documentation.
