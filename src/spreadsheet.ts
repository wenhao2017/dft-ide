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
  styles?: Array<Record<string, string>>;
};

type CompareSession = {
  fileBufferA?: Buffer;
  fileBufferB?: Buffer;
  webviewPanelA?: vscode.WebviewPanel;
  webviewPanelB?: vscode.WebviewPanel;
  spreadsheetDataA?: SpreadsheetSheet[];
  spreadsheetDataB?: SpreadsheetSheet[];
  commitHashA?: string;
  commitHashB?: string;
  repoRoot: string | null;
};

export class SpreadsheetProvider implements vscode.CustomReadonlyEditorProvider {
  private compareSession: CompareSession = { repoRoot: './' };

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return {
      uri,
      dispose: () => {
        this.resetCompareSession();
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
      this.renderGitComparison(webviewPanel, fileBuffer, spreadsheetData, commitHash, repoRoot);
      return;
    }

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, spreadsheetData);
    webviewPanel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (this.isSaveMessage(message)) {
        await this.writeDataToFile(document.uri.fsPath, message.data);
      }
    });
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

  private renderGitComparison(
    webviewPanel: vscode.WebviewPanel,
    fileBuffer: Buffer,
    spreadsheetData: SpreadsheetSheet[],
    commitHash: string | undefined,
    repoRoot: string
  ): void {
    const session = this.compareSession;

    if (!session.fileBufferA) {
      this.compareSession = {
        fileBufferA: fileBuffer,
        spreadsheetDataA: spreadsheetData,
        webviewPanelA: webviewPanel,
        commitHashA: commitHash,
        repoRoot,
      };
      webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, spreadsheetData);
      return;
    }

    try {
      session.fileBufferB = fileBuffer;
      session.webviewPanelB = webviewPanel;
      session.spreadsheetDataB = spreadsheetData;
      session.commitHashB = commitHash;
      session.repoRoot = repoRoot;

      if (!session.webviewPanelA || !session.spreadsheetDataA || !session.spreadsheetDataB) {
        throw new Error('Spreadsheet comparison session is incomplete.');
      }

      let diffResult: unknown;
      if (this.compareCommitOrder(repoRoot, session.commitHashA ?? '', session.commitHashB ?? '')) {
        diffResult = compareXlsxBuffers(session.fileBufferB, session.fileBufferA, session.commitHashB, session.commitHashA);
        this.applyDiffStyles(session.spreadsheetDataA, diffResult, 'v1');
        this.applyDiffStyles(session.spreadsheetDataB, diffResult, 'v2');
      } else {
        diffResult = compareXlsxBuffers(session.fileBufferA, session.fileBufferB, session.commitHashA, session.commitHashB);
        this.applyDiffStyles(session.spreadsheetDataB, diffResult, 'v1');
        this.applyDiffStyles(session.spreadsheetDataA, diffResult, 'v2');
      }

      session.webviewPanelA.webview.html = this.getHtmlForWebview(session.webviewPanelA.webview, session.spreadsheetDataA);
      webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, session.spreadsheetDataB);
    } catch (error) {
      console.error(`Failed to compare spreadsheet commits ${commitHash ?? ''}:`, error);
      throw error;
    } finally {
      this.resetCompareSession();
    }
  }

  private resetCompareSession(): void {
    this.compareSession = { repoRoot: './' };
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

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>XLS Viewer</title>
        <link href="${xSpreadsheetCss}" rel="stylesheet">
        <style>
          html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
          #spreadsheet-demo { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="spreadsheet-demo"></div>
        <script src="${xSpreadsheetJs}"></script>
        <script src="${xSpreadsheetLocales}"></script>
        <script>
          x_spreadsheet.locale('zh-cn');
          const wbdata = ${this.toScriptJson(workbookData)};
          const s = x_spreadsheet(document.getElementById('spreadsheet-demo'));
          s.loadData(wbdata);

          const vscode = acquireVsCodeApi();
          document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 's') {
              event.preventDefault();
              vscode.postMessage({
                type: 'save',
                data: s.getData()
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
        { bgcolor: '#d4edda' },
        { bgcolor: '#fff3cd' },
        { bgcolor: '#f8d7da' },
      ];
    }

    for (const cell of cells) {
      if (!cell.changeType) {
        continue;
      }
      if (version === 'v1' && cell.changeType === 'New') {
        continue;
      }
      if (version === 'v2' && cell.changeType === 'Deleted') {
        continue;
      }

      const sheet = sheetByName.get(cell.sheet);
      if (!sheet) {
        continue;
      }

      const row = sheet.rows[cell.row] ?? { cells: {} };
      const cellData = row.cells[cell.col] ?? { text: '' };
      if (cell.changeType === 'New') {
        cellData.style = 1;
      } else if (cell.changeType === 'Deleted') {
        cellData.style = 3;
      } else if (cell.changeType === 'Change') {
        cellData.style = 2;
      }
      row.cells[cell.col] = cellData;
      sheet.rows[cell.row] = row;
    }
  }

  private getDiffCells(diffResult: unknown): Array<{ sheet: string; row: number; col: number; changeType: string }> {
    if (!diffResult || typeof diffResult !== 'object') {
      return [];
    }
    const cells = (diffResult as { cells?: unknown }).cells;
    if (!Array.isArray(cells)) {
      return [];
    }
    return cells.filter((cell): cell is { sheet: string; row: number; col: number; changeType: string } => (
      Boolean(cell) &&
      typeof cell === 'object' &&
      typeof (cell as { sheet?: unknown }).sheet === 'string' &&
      typeof (cell as { row?: unknown }).row === 'number' &&
      typeof (cell as { col?: unknown }).col === 'number' &&
      typeof (cell as { changeType?: unknown }).changeType === 'string'
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
