import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { execFileSync, spawn } from 'child_process';
import { compareXlsxBuffers } from 'clara-xlsx-diff';

type SpreadsheetCell = {
  text?: string;
  style?: number;
  merge?: [number, number];
  dftDiff?: 'added' | 'changed' | 'deleted';
};

type SpreadsheetRow = {
  cells: Record<number, SpreadsheetCell>;
};

type SpreadsheetRows = {
  [rowIndex: number]: SpreadsheetRow;
  len?: number;
};

type SpreadsheetSheet = {
  name: string;
  rows: SpreadsheetRows;
  merges: string[];
  styles?: Array<Record<string, unknown>>;
};

type CompareSession = {
  fileBufferA: Buffer;
  webviewPanelA: vscode.WebviewPanel;
  spreadsheetDataA: SpreadsheetSheet[];
  commitHashA?: string;
  createdAt: number;
  isGitDocumentA: boolean;
  repoRoot: string | null;
};

export class SpreadsheetProvider implements vscode.CustomReadonlyEditorProvider {
  private readonly compareSessions = new Map<string, CompareSession>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return {
      uri,
      dispose: () => {
        this.compareSessions.delete(this.comparisonKey(uri.fsPath));
      },
    };
  }

  async getCommitFileContent(repoRoot: string = './', commitHash: string, filePath: string): Promise<Buffer> {
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');

    return new Promise((resolve, reject) => {
      const child = spawn('git', ['show', `${commitHash}:${relativePath}`], { cwd: repoRoot });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let settled = false;

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        callback();
      };

      child.stdout.on('data', (data: Buffer) => {
        stdoutChunks.push(data);
      });
      child.stderr.on('data', (data: Buffer) => {
        stderrChunks.push(data);
      });
      child.once('error', (error) => {
        settle(() => reject(new Error(`Git spawn error: ${error.message}`)));
      });
      child.once('close', (code) => {
        settle(() => {
          if (code === 0) {
            resolve(Buffer.concat(stdoutChunks));
            return;
          }

          const stderrText = Buffer.concat(stderrChunks).toString('utf8');
          if (stderrText.includes('exists on disk, but not in') || stderrText.includes('pathspec did not match any file')) {
            resolve(Buffer.from([]));
            return;
          }
          reject(new Error(`Git command failed: ${stderrText}`));
        });
      });
    });
  }

  getCommitTimestamp(repoRoot: string, commitHash: string): number {
    try {
      const output = execFileSync('git', ['-C', repoRoot, 'log', '-1', '--format=%at', commitHash], {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      const timestampSeconds = Number.parseInt(output, 10);
      if (Number.isNaN(timestampSeconds)) {
        throw new Error(`Invalid timestamp for commit ${commitHash}`);
      }
      return timestampSeconds * 1000;
    } catch (error) {
      console.error(`Failed to get timestamp for commit ${commitHash}:`, error);
      throw error;
    }
  }

  compareCommitOrder(repoRoot: string, commitHashA: string, commitHashB: string): number {
    if (commitHashA === '' || !commitHashA) {
      return 0;
    }
    if (commitHashB === '' || commitHashA === '(deleted)') {
      return 1;
    }

    const timeA = this.getCommitTimestamp(repoRoot, commitHashA);
    const timeB = this.getCommitTimestamp(repoRoot, commitHashB);
    return timeA < timeB ? 1 : 0;
  }

  async getGitRootDirectory(filePath: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', ['rev-parse', '--show-toplevel'], { cwd: path.dirname(filePath) });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (data: Buffer) => {
        stdoutChunks.push(data);
      });
      child.stderr.on('data', (data: Buffer) => {
        stderrChunks.push(data);
      });
      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(stdoutChunks).toString('utf8').trim());
          return;
        }

        const stderrText = Buffer.concat(stderrChunks).toString('utf8');
        if (!stderrText.includes('fatal: not a git repository')) {
          console.error(`Failed to resolve git root: ${stderrText}`);
        }
        resolve(null);
      });
    });
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    const filePath = document.uri.fsPath;
    const { fileBuffer, commitHash, repoRoot, isGitDocument } = await this.readDocumentBuffer(document.uri);
    if (token.isCancellationRequested) {
      return;
    }

    const workbook = this.readWorkbook(fileBuffer);
    const spreadsheetData = this.convertXLSXWorkbookToSpreadsheetData(workbook);

    if (isGitDocument) {
      if (!repoRoot) {
        vscode.window.showErrorMessage('当前文件不在 Git 仓库中，无法读取历史版本文件。');
        return;
      }
    }

    // An SCM diff pairs a Git virtual document with a regular file: document.
    // Register both sides so whichever resolves second can trigger cell highlighting.
    this.renderComparisonCandidate(webviewPanel, fileBuffer, spreadsheetData, commitHash, repoRoot, filePath, isGitDocument);
    if (!isGitDocument) {
      webviewPanel.webview.onDidReceiveMessage(async (message: unknown) => {
        if (this.isSaveMessage(message)) {
          await this.writeDataToFile(document.uri.fsPath, message.data);
        }
      });
    }
  }

  private async readDocumentBuffer(uri: vscode.Uri): Promise<{
    fileBuffer: Buffer;
    commitHash?: string;
    repoRoot: string | null;
    isGitDocument: boolean;
  }> {
    if (uri.scheme === 'file') {
      return {
        fileBuffer: fs.readFileSync(uri.fsPath),
        repoRoot: './',
        isGitDocument: false,
      };
    }

    if (uri.scheme !== 'git' && uri.scheme !== 'gitlens') {
      return {
        fileBuffer: Buffer.from([]),
        repoRoot: './',
        isGitDocument: false,
      };
    }

    let commitHash = this.parseGitRef(uri.query);
    if (commitHash === '~') {
      commitHash = 'HEAD';
    }

    const repoRoot = await this.getGitRootDirectory(uri.fsPath);
    const fileBuffer = repoRoot && commitHash !== '(deleted)'
      ? await this.getCommitFileContent(repoRoot, commitHash, uri.fsPath)
      : Buffer.from([]);

    return {
      fileBuffer,
      commitHash,
      repoRoot,
      isGitDocument: true,
    };
  }

  private renderComparisonCandidate(
    webviewPanel: vscode.WebviewPanel,
    fileBuffer: Buffer,
    spreadsheetData: SpreadsheetSheet[],
    commitHash: string | undefined,
    repoRoot: string | null,
    filePath: string,
    isGitDocument: boolean
  ): void {
    const now = Date.now();
    for (const [candidateKey, candidate] of this.compareSessions) {
      if (now - candidate.createdAt > 30_000) {
        this.compareSessions.delete(candidateKey);
      }
    }

    const key = this.comparisonKey(filePath);
    const session = this.compareSessions.get(key);
    if (!session || session.webviewPanelA === webviewPanel) {
      this.compareSessions.set(key, {
        fileBufferA: fileBuffer,
        spreadsheetDataA: spreadsheetData,
        webviewPanelA: webviewPanel,
        commitHashA: commitHash,
        createdAt: now,
        isGitDocumentA: isGitDocument,
        repoRoot,
      });
      webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, spreadsheetData);
      return;
    }

    if (!session.isGitDocumentA && !isGitDocument) {
      this.compareSessions.set(key, {
        fileBufferA: fileBuffer,
        spreadsheetDataA: spreadsheetData,
        webviewPanelA: webviewPanel,
        commitHashA: commitHash,
        createdAt: now,
        isGitDocumentA: false,
        repoRoot,
      });
      webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, spreadsheetData);
      return;
    }

    try {
      const firstIsV1 = session.isGitDocumentA || !isGitDocument;
      const v1 = firstIsV1
        ? { buffer: session.fileBufferA, data: session.spreadsheetDataA, panel: session.webviewPanelA, ref: session.commitHashA }
        : { buffer: fileBuffer, data: spreadsheetData, panel: webviewPanel, ref: commitHash };
      const v2 = firstIsV1
        ? { buffer: fileBuffer, data: spreadsheetData, panel: webviewPanel, ref: commitHash }
        : { buffer: session.fileBufferA, data: session.spreadsheetDataA, panel: session.webviewPanelA, ref: session.commitHashA };

      const diffResult = compareXlsxBuffers(v1.buffer, v2.buffer, v1.ref, v2.ref);
      this.applyDiffStyles(v1.data, diffResult, 'v1');
      this.applyDiffStyles(v2.data, diffResult, 'v2');
      v1.panel.webview.html = this.getHtmlForWebview(v1.panel.webview, v1.data);
      v2.panel.webview.html = this.getHtmlForWebview(v2.panel.webview, v2.data);
    } catch (error) {
      console.error(`Failed to compare spreadsheet commits ${commitHash ?? ''}:`, error);
      throw error;
    } finally {
      this.compareSessions.delete(key);
    }
  }

  private comparisonKey(filePath: string): string {
    const resolved = path.resolve(filePath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  private parseGitRef(query: string): string {
    try {
      const parsed = JSON.parse(query) as { ref?: unknown };
      return typeof parsed.ref === 'string' && parsed.ref ? parsed.ref : 'HEAD';
    } catch {
      return 'HEAD';
    }
  }

  private readWorkbook(fileBuffer: Buffer): XLSX.WorkBook {
    if (fileBuffer.length === 0) {
      return XLSX.utils.book_new();
    }
    return XLSX.read(fileBuffer, { type: 'buffer' });
  }

  private isSaveMessage(message: unknown): message is { type: 'save'; data: SpreadsheetSheet[] } {
    return Boolean(
      message &&
      typeof message === 'object' &&
      (message as { type?: unknown }).type === 'save' &&
      Array.isArray((message as { data?: unknown }).data)
    );
  }

  private async writeDataToFile(filePath: string, data: SpreadsheetSheet[]): Promise<void> {
    try {
      const dataWorkbook = this.convertSpreadsheetDataToXLSXWorkbook(data);
      const buffer = XLSX.write(dataWorkbook, {
        type: 'buffer',
        bookType: path.extname(filePath).toLowerCase() === '.xls' ? 'xls' : 'xlsx',
      });
      fs.writeFileSync(filePath, buffer);
      vscode.window.showInformationMessage('File saved successfully.');
    } catch (error) {
      vscode.window.showErrorMessage('Failed to save: ' + String(error));
    }
  }

  private getHtmlForWebview(webview: vscode.Webview, workbookData: SpreadsheetSheet[]): string {
    const xSpreadsheetCss = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'x-data-spreadsheet', 'dist', 'xspreadsheet.css'));
    const xSpreadsheetJs = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'x-data-spreadsheet', 'dist', 'xspreadsheet.js'));
    const xSpreadsheetLocales = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'x-data-spreadsheet', 'dist', 'locale', 'zh-cn.js'));

    const hasDiff = workbookData.some((sheet) => (
      sheet.styles?.some((style) => typeof style.dftDiff === 'string') ||
      Object.values(sheet.rows).some((row) => (
        typeof row === 'object' && row !== null &&
        Object.values(row.cells).some((cell) => typeof cell.dftDiff === 'string')
      ))
    ));

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>XLS Viewer</title>
        <link href="${xSpreadsheetCss}" rel="stylesheet">
        <style>
          :root { color-scheme: light dark; }
          html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            font-family: var(--vscode-font-family);
          }
          body { display: flex; flex-direction: column; }
          #spreadsheet-demo { width: 100%; flex: 1; min-height: 0; background: var(--vscode-editor-background); }
          #diff-legend {
            display: ${hasDiff ? 'flex' : 'none'};
            align-items: center;
            gap: 16px;
            flex: 0 0 auto;
            min-height: 34px;
            padding: 0 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
          }
          .dft-diff-key { display: inline-flex; align-items: center; gap: 6px; }
          .dft-diff-swatch { width: 11px; height: 11px; border: 1px solid currentColor; border-radius: 2px; }
          .dft-diff-added { color: var(--vscode-gitDecoration-addedResourceForeground, #2ea043); background: color-mix(in srgb, currentColor 24%, transparent); }
          .dft-diff-changed { color: var(--vscode-gitDecoration-modifiedResourceForeground, #d29922); background: color-mix(in srgb, currentColor 24%, transparent); }
          .dft-diff-deleted { color: var(--vscode-gitDecoration-deletedResourceForeground, #f85149); background: color-mix(in srgb, currentColor 24%, transparent); }

          .x-spreadsheet,
          .x-spreadsheet-sheet,
          .x-spreadsheet-toolbar,
          .x-spreadsheet-bottombar,
          .x-spreadsheet-menu,
          .x-spreadsheet-contextmenu,
          .x-spreadsheet-modal,
          .x-spreadsheet-form-select,
          .x-spreadsheet-form-fields,
          .x-spreadsheet-dropdown .x-spreadsheet-dropdown-content,
          .x-spreadsheet-color-palette table,
          .x-spreadsheet-border-palette table {
            color: var(--vscode-editor-foreground) !important;
            background: var(--vscode-editor-background) !important;
            border-color: var(--vscode-panel-border) !important;
          }
          .x-spreadsheet-toolbar,
          .x-spreadsheet-bottombar {
            background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background)) !important;
            border-color: var(--vscode-panel-border) !important;
          }
          .x-spreadsheet-toolbar-divider {
            border-color: var(--vscode-panel-border) !important;
          }
          .x-spreadsheet-icon .x-spreadsheet-icon-img {
            opacity: 0.72;
          }
          body.vscode-dark .x-spreadsheet-icon .x-spreadsheet-icon-img,
          body.vscode-high-contrast .x-spreadsheet-icon .x-spreadsheet-icon-img {
            /* The library ships a black SVG sprite, so color/inherit cannot recolor it. */
            filter: invert(1) brightness(1.35);
            opacity: 0.86;
          }
          body.vscode-high-contrast-light .x-spreadsheet-icon .x-spreadsheet-icon-img {
            opacity: 1;
          }
          .x-spreadsheet-item,
          .x-spreadsheet-form-field,
          .x-spreadsheet-form-select,
          .x-spreadsheet-form-fields input,
          .x-spreadsheet-form-fields textarea {
            color: var(--vscode-input-foreground) !important;
            background: var(--vscode-input-background) !important;
            border-color: var(--vscode-input-border, var(--vscode-panel-border)) !important;
          }
          .x-spreadsheet-item:hover,
          .x-spreadsheet-bottombar li:hover,
          .x-spreadsheet-toolbar .x-spreadsheet-toolbar-btn:hover {
            background: var(--vscode-list-hoverBackground) !important;
          }
          .x-spreadsheet-bottombar li.active,
          .x-spreadsheet-item.active,
          .x-spreadsheet-toolbar .x-spreadsheet-toolbar-btn.active {
            color: var(--vscode-list-activeSelectionForeground) !important;
            background: var(--vscode-list-activeSelectionBackground) !important;
          }
          .x-spreadsheet-selector .x-spreadsheet-selector-area,
          .x-spreadsheet-editor .x-spreadsheet-editor-area {
            border-color: var(--vscode-focusBorder, #007fd4) !important;
          }
          .x-spreadsheet-scrollbar > div {
            background: var(--vscode-scrollbarSlider-background) !important;
          }
          .x-spreadsheet-scrollbar > div:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground) !important;
          }
          body.vscode-high-contrast .x-spreadsheet,
          body.vscode-high-contrast-light .x-spreadsheet {
            outline: 1px solid var(--vscode-contrastBorder);
          }
        </style>
      </head>
      <body>
        <div id="diff-legend" aria-label="表格差异图例">
          <strong>差异：</strong>
          <span class="dft-diff-key"><span class="dft-diff-swatch dft-diff-added"></span>新增</span>
          <span class="dft-diff-key"><span class="dft-diff-swatch dft-diff-changed"></span>修改</span>
          <span class="dft-diff-key"><span class="dft-diff-swatch dft-diff-deleted"></span>删除</span>
        </div>
        <div id="spreadsheet-demo"></div>
        <script src="${xSpreadsheetJs}"></script>
        <script src="${xSpreadsheetLocales}"></script>
        <script>
          x_spreadsheet.locale('zh-cn');
          const initialWorkbookData = ${this.toScriptJson(workbookData)};
          const host = document.getElementById('spreadsheet-demo');
          let spreadsheet;
          let rebuildTimer;

          const cssColor = (name, fallback) => {
            const value = getComputedStyle(document.body).getPropertyValue(name).trim();
            return value || fallback;
          };
          const isDark = () => document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
          const themePalette = () => ({
            background: cssColor('--vscode-editor-background', isDark() ? '#1e1e1e' : '#ffffff'),
            foreground: cssColor('--vscode-editor-foreground', isDark() ? '#d4d4d4' : '#1f2328'),
            header: cssColor('--vscode-editorGroupHeader-tabsBackground', isDark() ? '#252526' : '#f4f5f8'),
            border: cssColor('--vscode-panel-border', isDark() ? '#454545' : '#d0d7de'),
            added: isDark() ? '#205a3a' : '#d4edda',
            changed: isDark() ? '#6a5018' : '#fff3cd',
            deleted: isDark() ? '#702b32' : '#f8d7da',
            addedBorder: cssColor('--vscode-gitDecoration-addedResourceForeground', isDark() ? '#56d48f' : '#2ea043'),
            changedBorder: cssColor('--vscode-gitDecoration-modifiedResourceForeground', isDark() ? '#f0c454' : '#b78103'),
            deletedBorder: cssColor('--vscode-gitDecoration-deletedResourceForeground', isDark() ? '#ff7b83' : '#cf222e'),
          });

          const cloneAndThemeData = (data) => {
            const themed = JSON.parse(JSON.stringify(data));
            const palette = themePalette();
            for (let sheetIndex = 0; sheetIndex < themed.length; sheetIndex += 1) {
              const sheet = themed[sheetIndex];
              const originalSheet = initialWorkbookData[sheetIndex];
              if (!originalSheet) continue;

              const sourceStyles = Array.isArray(originalSheet.styles) ? originalSheet.styles : [];
              sheet.styles = Array.isArray(sheet.styles)
                ? sheet.styles.filter((style) => !style?.dftDiff)
                : [];

              const styleIndexes = {};
              ['added', 'changed', 'deleted'].forEach((kind) => {
                const color = kind === 'added' ? palette.added : kind === 'deleted' ? palette.deleted : palette.changed;
                const borderColor = kind === 'added' ? palette.addedBorder : kind === 'deleted' ? palette.deletedBorder : palette.changedBorder;
                styleIndexes[kind] = sheet.styles.length;
                sheet.styles.push({
                  bgcolor: color,
                  color: palette.foreground,
                  dftDiff: kind,
                  border: {
                    top: ['thin', borderColor], right: ['thin', borderColor],
                    bottom: ['thin', borderColor], left: ['thin', borderColor],
                  },
                });
              });

              Object.keys(originalSheet.rows || {}).forEach((rowKey) => {
                if (rowKey === 'len') return;
                const originalRow = originalSheet.rows[rowKey];
                if (!originalRow?.cells) return;
                Object.keys(originalRow.cells).forEach((cellKey) => {
                  const originalCell = originalRow.cells[cellKey];
                  const kind = originalCell?.dftDiff || sourceStyles[originalCell?.style]?.dftDiff;
                  if (!kind || styleIndexes[kind] === undefined) return;
                  const targetRow = sheet.rows[rowKey] || { cells: {} };
                  const targetCell = targetRow.cells[cellKey] || { text: '' };
                  targetCell.style = styleIndexes[kind];
                  targetCell.dftDiff = kind;
                  targetRow.cells[cellKey] = targetCell;
                  sheet.rows[rowKey] = targetRow;
                });
              });
            }
            return themed;
          };

          // x-data-spreadsheet renders the grid and headers on canvas with a light-only palette.
          // Map those built-in colors to the current VS Code palette at draw time.
          (() => {
            const proto = CanvasRenderingContext2D.prototype;
            if (proto.__dftThemePatched) return;
            proto.__dftThemePatched = true;
            const mapColor = (value) => {
              if (typeof value !== 'string') return value;
              const normalized = value.replace(/\s/g, '').toLowerCase();
              const palette = themePalette();
              if (normalized === '#fff' || normalized === '#ffffff') return palette.background;
              if (normalized === '#f4f5f8' || normalized === '#f5f6f7' || normalized === '#f8f8f9') return palette.header;
              if (normalized === '#e6e6e6' || normalized === '#ddd' || normalized === '#d0d0d0' || normalized === '#c6c6c6') return palette.border;
              if (normalized === '#000' || normalized === '#000000' || normalized === '#010101' || normalized === '#585757' || normalized === '#333333' || normalized === '#0a0a0a') return palette.foreground;
              return value;
            };
            const wrap = (name, properties) => {
              const original = proto[name];
              if (typeof original !== 'function') return;
              proto[name] = function(...args) {
                const saved = properties.map((property) => this[property]);
                properties.forEach((property) => { this[property] = mapColor(this[property]); });
                try { return original.apply(this, args); }
                finally { properties.forEach((property, index) => { this[property] = saved[index]; }); }
              };
            };
            wrap('fillRect', ['fillStyle']);
            wrap('fill', ['fillStyle']);
            wrap('fillText', ['fillStyle']);
            wrap('strokeRect', ['strokeStyle']);
            wrap('stroke', ['strokeStyle']);
            wrap('strokeText', ['strokeStyle']);
          })();

          const rebuildSpreadsheet = () => {
            const currentData = spreadsheet ? spreadsheet.getData() : initialWorkbookData;
            const palette = themePalette();
            host.innerHTML = '';
            spreadsheet = x_spreadsheet(host, {
              style: {
                bgcolor: palette.background,
                color: palette.foreground,
                font: { name: 'Arial', size: 10, bold: false, italic: false },
              },
            });
            spreadsheet.loadData(cloneAndThemeData(currentData));
          };

          rebuildSpreadsheet();
          new MutationObserver(() => {
            window.clearTimeout(rebuildTimer);
            rebuildTimer = window.setTimeout(rebuildSpreadsheet, 30);
          }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

          const vscode = acquireVsCodeApi();
          document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 's') {
              event.preventDefault();
              vscode.postMessage({
                type: 'save',
                data: spreadsheet.getData()
              });
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  private toScriptJson(value: unknown): string {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => {
      switch (char) {
        case '<':
          return '\\u003c';
        case '>':
          return '\\u003e';
        case '&':
          return '\\u0026';
        case '\u2028':
          return '\\u2028';
        case '\u2029':
          return '\\u2029';
        default:
          return char;
      }
    });
  }

  private applyDiffStyles(workbookData: SpreadsheetSheet[], diffResult: unknown, version: 'v1' | 'v2'): void {
    const cells = this.getDiffCells(diffResult);
    if (cells.length === 0) {
      return;
    }

    const sheetByName = new Map(workbookData.map((sheet) => [sheet.name, sheet]));
    for (const sheet of workbookData) {
      sheet.styles = [
        { bgcolor: '#000100' },
        { bgcolor: '#d4edda', dftDiff: 'added' },
        { bgcolor: '#fff3cd', dftDiff: 'changed' },
        { bgcolor: '#f8d7da', dftDiff: 'deleted' },
      ];
    }

    for (const cell of cells) {
      if (cell.version !== version) {
        continue;
      }

      const sheet = sheetByName.get(cell.sheet);
      if (!sheet) {
        continue;
      }

      const row = sheet.rows[cell.row] ?? { cells: {} };
      const cellData = row.cells[cell.col] ?? { text: '' };
      if (version === 'v2' && cell.changeType === 'Deleted') {
        cellData.style = 1;
        cellData.dftDiff = 'added';
      } else if (version === 'v1' && cell.changeType === 'New') {
        cellData.style = 3;
        cellData.dftDiff = 'deleted';
      } else if (cell.changeType === 'Change') {
        cellData.style = 2;
        cellData.dftDiff = 'changed';
      }
      row.cells[cell.col] = cellData;
      sheet.rows[cell.row] = row;
    }
  }

  private getDiffCells(diffResult: unknown): Array<{ sheet: string; row: number; col: number; changeType: string; version: 'v1' | 'v2' }> {
    if (!diffResult || typeof diffResult !== 'object') {
      return [];
    }
    const cells = (diffResult as { cells?: unknown }).cells;
    if (!Array.isArray(cells)) {
      return [];
    }
    return cells.filter((cell): cell is { sheet: string; row: number; col: number; changeType: string; version: 'v1' | 'v2' } => (
      Boolean(cell) &&
      typeof cell === 'object' &&
      typeof (cell as { sheet?: unknown }).sheet === 'string' &&
      typeof (cell as { row?: unknown }).row === 'number' &&
      typeof (cell as { col?: unknown }).col === 'number' &&
      typeof (cell as { changeType?: unknown }).changeType === 'string' &&
      ((cell as { version?: unknown }).version === 'v1' || (cell as { version?: unknown }).version === 'v2')
    ));
  }

  private convertXLSXWorkbookToSpreadsheetData(workbook: XLSX.WorkBook): SpreadsheetSheet[] {
    const sheets: SpreadsheetSheet[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet || !worksheet['!ref']) {
        continue;
      }

      const range = XLSX.utils.decode_range(worksheet['!ref']);
      range.s = { r: 0, c: 0 };

      const sheetData: SpreadsheetSheet = {
        name: sheetName,
        rows: {},
        merges: [],
      };
      let maxRow = range.e.r;

      for (const cellRef of Object.keys(worksheet)) {
        if (cellRef.startsWith('!')) {
          continue;
        }

        let address: XLSX.CellAddress;
        try {
          address = XLSX.utils.decode_cell(cellRef);
        } catch {
          continue;
        }

        const rawCell = worksheet[cellRef];
        if (!rawCell || address.r < range.s.r || address.c < range.s.c || address.r > range.e.r || address.c > range.e.c) {
          continue;
        }

        const row = sheetData.rows[address.r] ?? { cells: {} };
        row.cells[address.c] = {
          text: this.formatCellText(rawCell),
        };
        sheetData.rows[address.r] = row;
        if (address.r > maxRow) {
          maxRow = address.r;
        }
      }

      sheetData.rows.len = maxRow + 1;

      const merges = worksheet['!merges'] ?? [];
      for (const merge of merges) {
        const row = sheetData.rows[merge.s.r] ?? { cells: {} };
        const cell = row.cells[merge.s.c] ?? {};
        cell.merge = [
          merge.e.r - merge.s.r,
          merge.e.c - merge.s.c,
        ];
        row.cells[merge.s.c] = cell;
        sheetData.rows[merge.s.r] = row;
        sheetData.merges.push(XLSX.utils.encode_range(merge));
      }

      sheets.push(sheetData);
    }

    return sheets;
  }

  private formatCellText(cell: XLSX.CellObject): string {
    if (cell.f) {
      return '=' + cell.f;
    }
    if (cell.w !== undefined) {
      return String(cell.w);
    }
    return cell.v !== undefined && cell.v !== null ? String(cell.v) : '';
  }

  private convertSpreadsheetDataToXLSXWorkbook(spreadsheetData: SpreadsheetSheet[]): XLSX.WorkBook {
    const workbook = XLSX.utils.book_new();

    spreadsheetData.forEach((xws) => {
      const worksheet: XLSX.WorkSheet = {};
      const rows = xws.rows ?? {};
      let maxRow = -1;
      let maxCol = -1;
      let hasData = false;

      for (let rowIndex = 0; rowIndex < this.getRowCount(rows); rowIndex += 1) {
        const row = rows[rowIndex];
        if (!row?.cells) {
          continue;
        }

        for (const key of Object.keys(row.cells)) {
          const columnIndex = Number(key);
          if (Number.isNaN(columnIndex)) {
            continue;
          }

          const cellData = row.cells[columnIndex];
          const cellText = cellData.text ?? '';
          const { value, type } = this.parseCellValue(cellText);
          const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell: XLSX.CellObject = { v: value, t: type };

          if (type === 's' && typeof value === 'string' && value.startsWith('=')) {
            cell.f = value.slice(1);
            cell.t = 's';
          }

          worksheet[cellRef] = cell;
          hasData = true;
          maxRow = Math.max(maxRow, rowIndex);
          maxCol = Math.max(maxCol, columnIndex);

          if (cellData.merge != null) {
            const merges = ((worksheet['!merges'] ?? []) as XLSX.Range[]);
            merges.push({
              s: { r: rowIndex, c: columnIndex },
              e: {
                r: rowIndex + cellData.merge[0],
                c: columnIndex + cellData.merge[1],
              },
            });
            worksheet['!merges'] = merges;
          }
        }
      }

      worksheet['!ref'] = hasData
        ? XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } })
        : 'A1';

      XLSX.utils.book_append_sheet(workbook, worksheet, xws.name);
    });

    return workbook;
  }

  private getRowCount(rows: SpreadsheetRows): number {
    if (typeof rows.len === 'number') {
      return rows.len;
    }

    return Object.keys(rows)
      .map((key) => Number(key))
      .filter((key) => Number.isInteger(key) && key >= 0)
      .reduce((max, rowIndex) => Math.max(max, rowIndex + 1), 0);
  }

  private parseCellValue(cellText: string): { value: string | number | boolean; type: XLSX.ExcelDataType } {
    if (cellText === '') {
      return { value: '', type: 'z' };
    }
    if (!Number.isNaN(Number(cellText)) && cellText.trim() !== '') {
      return { value: Number(cellText), type: 'n' };
    }
    if (cellText.toLowerCase() === 'true') {
      return { value: true, type: 'b' };
    }
    if (cellText.toLowerCase() === 'false') {
      return { value: false, type: 'b' };
    }
    return { value: cellText, type: 's' };
  }
}
