import * as vscode from 'vscode'
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
// import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
import * as execFile from 'child_process';
import { compareXlsxBuffers } from 'clara-xlsx-diff';


export class SpreadsheetProvider implements vscode.CustomReadonlyEditorProvider {
  fileBufferA: any
  fileBufferB: any
  gitflag: Boolean = false
  webviewPanelA: any
  webviewPanelB: any
  spreadsheetDataA: any
  spreadsheetDataB: any
  commitHashA: any
  commitHashB: any
  repoRoot: string | null = "./"

  constructor(private readonly context: vscode.ExtensionContext) { }
  async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<vscode.CustomDocument> {
    return {
      uri, dispose: () => {
        this.fileBufferA = undefined
        this.fileBufferB = undefined
        this.gitflag = false
        this.webviewPanelA = undefined
        this.webviewPanelB = undefined
        this.spreadsheetDataA = undefined
        this.spreadsheetDataB = undefined
        this.commitHashA = undefined
        this.commitHashB = undefined
        this.repoRoot = "./"
      }
    };
  }

  async getCommitFileContent(repoRoot: string = "./", commitHash: string, filePath: string): Promise<Buffer> {
    const relativePath = path.relative(repoRoot, filePath);
    const safeRelativePath = relativePath.replace(/\\/g, '/');
    const command = 'git';
    const args = ['show', `${commitHash}:${safeRelativePath}`];

    return new Promise((resolve, reject) => {
      const child = execFile.spawn(command, args, { cwd: repoRoot });
      const chunks: Buffer[] = [];
      child.stdout.on('data', (data: Buffer) => { chunks.push(data); });
      child.on('error', (error) => { reject(new Error(`Git spawn error: ${error.message}`)); });
      child.on('close', (code, signal) => {
        if (code !== 0)
          return;
        const fileBuffer = Buffer.concat(chunks);
        resolve(fileBuffer);
      });
      const stderrChunks: Buffer[] = [];
      child.stderr.on('data', (data: Buffer) => { stderrChunks.push(data); });
      child.on('exit', (code, signal) => {
        if (code !== 0) {
          const stderrStr = Buffer.concat(stderrChunks).toString('utf8');
          if (stderrStr.includes("exists on disk, but not in") || stderrStr.includes("pathspec did not match any file")) {
            resolve(Buffer.from([]));
          } else {
            reject(new Error(`Git command failed: ${stderrStr}`));
          }
        }
      });
    });
  }

  getCommitTimestamp(repoRoot: string, commitHash: string): number {
    try {
      const output = execFile.execSync(`git -C "${repoRoot}" log -1 --format=%at "${commitHash}"`, {
        encoding: 'utf-8',
        timeout: 5000
      }).trim();

      const timestampSeconds = parseInt(output, 10);
      if (isNaN(timestampSeconds)) {
        throw new Error(`Invalid timestamp for commit ${commitHash}`);
      }
      return timestampSeconds * 1000;
    } catch (error) {
      console.error(`Failed to get timestamp for commit ${commitHash}:`, error);
      throw error;
    }
  }

  compareCommitOrder(repoRoot: string, commitHashA: string, commitHashB: string): number {
    if (commitHashA == "" || !commitHashA)
      return 0
    else if (commitHashB == "" || commitHashA == "(deleted)")
      return 1

    const timeA = this.getCommitTimestamp(repoRoot, commitHashA);
    const timeB = this.getCommitTimestamp(repoRoot, commitHashB);
    if (timeA < timeB) {
      return 1;
    } else {
      return 0;
    }
  }

  async getGitRootDirectory(filePath: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const child = execFile.spawn('git', ['rev-parse', '--show-toplevel'], { cwd: path.dirname(filePath) });
      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { if (data.toString().includes('fatal: not a git repository')) { resolve(null); } });
      child.on('close', (code) => { if (code === 0) { resolve(output.trim()); } else { resolve(null); } });
      child.on('error', (err) => { reject(err); });
    });
  }

  async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
    console.log(token)
    webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri] };
    const filePath = document.uri.fsPath;
    let spreadsheetData: any[] = [];
    let html: string = "";
    let workbook;
    let fileBuffer: Buffer = Buffer.from([])
    let commitHash

    if (document.uri.scheme === 'file') {
      fileBuffer = fs.readFileSync(filePath);
    }
    else if (document.uri.scheme === 'git' || document.uri.scheme === 'gitlens') {
      this.gitflag = true
      commitHash = JSON.parse(document.uri.query).ref
      if (commitHash == '~')
        commitHash = 'HEAD'
      this.repoRoot = await this.getGitRootDirectory(filePath)
      if (!this.repoRoot) {
        vscode.window.showErrorMessage('当前文件不在 Git 仓库中，无法读取历史版本文件。');
        return;
      }
      if (commitHash !== '(deleted)')
        fileBuffer = await this.getCommitFileContent(this.repoRoot, commitHash, filePath);
    }

    workbook = XLSX.read(fileBuffer, { type: 'array' });
    spreadsheetData = this.convertXLSXWorkbookToSpreadsheetData(workbook);

    if (this.gitflag) {
      try {
        if (!this.fileBufferA) {
          this.fileBufferA = fileBuffer
          this.spreadsheetDataA = spreadsheetData
          this.webviewPanelA = webviewPanel
          this.commitHashA = commitHash
          html = this.getHtmlForWebview(webviewPanel.webview, spreadsheetData);
          webviewPanel.webview.html = html;
        }
        else {
          this.fileBufferB = fileBuffer
          this.webviewPanelB = webviewPanel
          this.spreadsheetDataB = spreadsheetData
          this.commitHashB = commitHash
          let result: any
          if (this.repoRoot && this.compareCommitOrder(this.repoRoot, this.commitHashA, this.commitHashB)) {
            result = compareXlsxBuffers(this.fileBufferB, this.fileBufferA, this.commitHashB, this.commitHashA);
            this.applyDiffStyles(this.spreadsheetDataA, result, 'v1');
            this.applyDiffStyles(this.spreadsheetDataB, result, 'v2');
            this.webviewPanelA.webview.html = this.getHtmlForWebview(this.webviewPanelA.webview, this.spreadsheetDataA);
            this.webviewPanelB.webview.html = this.getHtmlForWebview(this.webviewPanelB.webview, this.spreadsheetDataB);
          }
          else {
            result = compareXlsxBuffers(this.fileBufferA, this.fileBufferB, this.commitHashA, this.commitHashB);
            this.applyDiffStyles(this.spreadsheetDataB, result, 'v1');
            this.applyDiffStyles(this.spreadsheetDataA, result, 'v2');
            this.webviewPanelA.webview.html = this.getHtmlForWebview(this.webviewPanelA.webview, this.spreadsheetDataA);
            this.webviewPanelB.webview.html = this.getHtmlForWebview(this.webviewPanelB.webview, this.spreadsheetDataB);
          }
          this.fileBufferA = undefined
          this.fileBufferB = undefined
          this.gitflag = false
          this.webviewPanelA = undefined
          this.webviewPanelB = undefined
          this.spreadsheetDataA = undefined
          this.spreadsheetDataB = undefined
          this.commitHashA = undefined
          this.commitHashB = undefined
          this.repoRoot = "./"
        }
      } catch (error) {
        console.error(`Failed to Compare for commit ${commitHash}:`, error);
        this.fileBufferA = undefined
        this.fileBufferB = undefined
        this.gitflag = false
        this.webviewPanelA = undefined
        this.webviewPanelB = undefined
        this.spreadsheetDataA = undefined
        this.spreadsheetDataB = undefined
        this.commitHashA = undefined
        this.commitHashB = undefined
        this.repoRoot = "./"
        throw error;
      }
    } else {
      // this.currentPanel = webviewPanel;
      // webviewPanel.webview.options = {
      //   enableScripts: true,
      //   localResourceRoots: [vscode.Uri.file(path.join(__dirname, '..', 'webview'))]
      // };
      html = this.getHtmlForWebview(webviewPanel.webview, spreadsheetData);
      webviewPanel.webview.html = html;
      webviewPanel.webview.onDidReceiveMessage(async (message: any) => {
        if (message.type === 'save') {
          await this.writeDataToFile(document.uri.fsPath, message.data);
        }
      });
      this.fileBufferA = fileBuffer
      this.spreadsheetDataA = spreadsheetData
      this.webviewPanelA = webviewPanel
      this.commitHashA = commitHash
    }
  }

  private async writeDataToFile(filePath: string, data: any) {
    try {
      const data_wb = this.convertSpreadsheetDataToXLSXWorkbook(data)
      const buffer = XLSX.write(data_wb, { type: 'buffer' });
      fs.writeFileSync(filePath, buffer);
      vscode.window.showInformationMessage('File saved successfully.');
    } catch (e) {
      vscode.window.showErrorMessage('Failed to save: ' + e);
    }
  }


  private getHtmlForWebview(webview: vscode.Webview, wbdata: any): string {
    // 获取本地资源路径
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
            const wbdata = ${JSON.stringify(wbdata)}
            const s = x_spreadsheet(document.getElementById('spreadsheet-demo'))
            s.loadData(wbdata);

            const vscode = acquireVsCodeApi();
            document.addEventListener('keydown', (e) => {
              console.log(e)
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    const data = s.getData()
                    vscode.postMessage({
                        type: 'save',
                        data: data
                    });
                }
            });
        </script>
      </body>
      </html>
  `;
  }

  private applyDiffStyles(wbdata: any, diffResult: any, version: 'v1' | 'v2'): void {
    if (!diffResult || !diffResult.cells) return;

    for (let i in wbdata) {
      wbdata[i]['styles'] = [
        { "bgcolor": "#000100" },
        { "bgcolor": "#d4edda" },
        { "bgcolor": "#fff3cd" },
        { "bgcolor": "#f8d7da" },
      ]
    }
    // 遍历差异单元格
    for (const cell of diffResult.cells) {
      if (cell.changeType === '')
        continue
      if (version == 'v1') {
        if (cell.changeType == 'New')
          continue
      } else if (version == 'v2') {
        if (cell.changeType == 'Deleted')
          continue
      }

      // 2. 获取 Sheet 和行列信息
      const sheetName = cell.sheet;
      const row = cell.row;
      const col = cell.col;

      // 根据 sheetName 在 wbdata 数组中找到对应的 sheet 对象
      const sheet = wbdata.find((s: any) => s.name === sheetName);
      if (sheet && sheet.rows) {

        if (sheet.rows[row]) {

          if (!sheet.rows[row].cells) {
            sheet.rows[row].cells = {};
          }
          let cellData = sheet.rows[row].cells[col];
          if (!cellData) {
            cellData = { text: '' };
            sheet.rows[row].cells[col] = cellData;
          }
          switch (cell.changeType) {
            case 'New':
              cellData.style = 1;
              break
            case 'Deleted':
              cellData.style = 3;
              break;
            case 'Change':
              cellData.style = 2;
              break;
            default:
              break
          }
        }
      }
    }
  }

  private convertXLSXWorkbookToSpreadsheetData(workbook: XLSX.WorkBook): any[] {
    const sheets: any[] = [];
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet || !worksheet["!ref"]) return;
      const sheetData: any = {
        name: sheetName,
        rows: {},
        merges: []
      };

      const range = XLSX.utils.decode_range(worksheet["!ref"]);
      range.s = { r: 0, c: 0 };

      const aoa: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        header: 1,
        range: range
      });

      aoa.forEach((rowArr, rowIndex) => {
        const cells: any = {};

        rowArr.forEach((cellValue, colIndex) => {
          const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });

          let text = cellValue !== undefined && cellValue !== null ? String(cellValue) : "";

          const rawCell = worksheet[cellRef];
          if (rawCell && rawCell.f) {
            text = "=" + rawCell.f;
          }
          cells[colIndex] = {
            text: text
          };
        });

        sheetData.rows[rowIndex] = {
          cells: cells
        };
      });

      sheetData.rows.len = aoa.length;

      const merges = worksheet["!merges"] || [];
      merges.forEach((merge) => {
        if (!sheetData.rows[merge.s.r]) {
          sheetData.rows[merge.s.r] = { cells: {} };
        }
        if (!sheetData.rows[merge.s.r].cells[merge.s.c]) {
          sheetData.rows[merge.s.r].cells[merge.s.c] = {};
        }

        sheetData.rows[merge.s.r].cells[merge.s.c].merge = [
          merge.e.r - merge.s.r,
          merge.e.c - merge.s.c
        ];
        sheetData.merges.push(XLSX.utils.encode_range(merge));
      });

      sheets.push(sheetData);
    });

    return sheets;
  }

  private convertSpreadsheetDataToXLSXWorkbook(sdata: any[]): XLSX.WorkBook {
    const out = XLSX.utils.book_new();

    sdata.forEach((xws) => {
      const ws: any = {};
      const rowobj = xws.rows;

      // 初始化坐标范围
      let minRow = 0;
      let minCol = 0;
      let maxRow = -1;
      let maxCol = -1;
      let hasData = false;

      // 遍历所有行
      for (let ri = 0; ri < rowobj.len; ++ri) {
        const row = rowobj[ri];
        if (!row) continue;

        Object.keys(row.cells).forEach((k) => {
          const idx = Number(k);
          if (isNaN(idx)) return;

          // 更新最大坐标
          if (ri > maxRow) maxRow = ri;
          if (idx > maxCol) maxCol = idx;
          hasData = true;

          const cellData = row.cells[k];
          const cellText = cellData.text;

          // 确定单元格类型和内容
          let value: any = "";
          let type: string = "z"; // z = empty

          if (cellText !== undefined && cellText !== null && cellText !== "") {
            if (!isNaN(Number(cellText)) && cellText.trim() !== "") {
              value = Number(cellText);
              type = "n";
            } else if (cellText.toLowerCase() === "true") {
              value = true;
              type = "b";
            } else if (cellText.toLowerCase() === "false") {
              value = false;
              type = "b";
            } else {
              value = cellText;
              type = "s";
            }
          }

          const cellRef = XLSX.utils.encode_cell({ r: ri, c: idx });
          ws[cellRef] = { v: value, t: type };

          // 处理公式
          if (type === "s" && typeof value === 'string' && value.startsWith("=")) {
            ws[cellRef].f = value.slice(1);
            ws[cellRef].t = "s"; // 保持为字符串类型，公式由 .f 属性处理
          }

          // 处理合并单元格
          if (cellData.merge != null) {
            if (!ws["!merges"]) ws["!merges"] = [];

            const merge = cellData.merge;
            ws["!merges"].push({
              s: { r: ri, c: idx },
              e: {
                r: ri + merge[0],
                c: idx + merge[1]
              }
            });
          }
        });
      }

      // 设置工作表范围
      if (hasData) {
        ws["!ref"] = XLSX.utils.encode_range({
          s: { r: minRow, c: minCol },
          e: { r: maxRow, c: maxCol }
        });
      } else {
        ws["!ref"] = "A1";
      }

      XLSX.utils.book_append_sheet(out, ws, xws.name);
    });

    return out;
  }
}
