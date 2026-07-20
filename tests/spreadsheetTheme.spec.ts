import * as path from 'path';
import * as vscode from 'vscode';
import { describe, expect, it } from 'vitest';
import { SpreadsheetProvider } from '../src/spreadsheet';

function renderSpreadsheetHtml(withDiff: boolean): string {
  (vscode.Uri as any).joinPath = (base: vscode.Uri, ...parts: string[]) => vscode.Uri.file(path.join(base.fsPath, ...parts));
  const provider = new SpreadsheetProvider({ extensionUri: vscode.Uri.file('/mock/extension') } as vscode.ExtensionContext);
  const webview = { asWebviewUri: (uri: vscode.Uri) => uri } as vscode.Webview;
  const data = [{
    name: 'Sheet1',
    rows: { len: 1, 0: { cells: { 0: { text: 'value', style: withDiff ? 1 : 0 } } } },
    merges: [],
    styles: withDiff
      ? [{ bgcolor: '#ffffff' }, { bgcolor: '#fff3cd', dftDiff: 'changed' }]
      : [{ bgcolor: '#ffffff' }],
  }];
  return (provider as any).getHtmlForWebview(webview, data);
}

describe('spreadsheet VS Code theme integration', () => {
  it('uses VS Code theme tokens and rebuilds when the host theme changes', () => {
    const html = renderSpreadsheetHtml(false);
    expect(html).toContain('var(--vscode-editor-background)');
    expect(html).toContain('var(--vscode-editor-foreground)');
    expect(html).toContain('MutationObserver');
    expect(html).toContain("attributeFilter: ['class']");
  });

  it('keeps diff markers and renders a theme-aware legend', () => {
    const html = renderSpreadsheetHtml(true);
    expect(html).toContain('dftDiff');
    expect(html).toContain('差异：');
    expect(html).toContain("addedBorder: cssColor('--vscode-gitDecoration-addedResourceForeground'");
    expect(html).toContain('display: flex');
  });
});
