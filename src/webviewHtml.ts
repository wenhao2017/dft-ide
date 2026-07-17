import * as vscode from 'vscode';
import { environmentDefaults, getEnvironmentSetting } from './config/environment';

export type InitialWebviewCommand =
  | { command: 'showWelcome' }
  | { command: 'loadFlow'; category: string };

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  initialView: InitialWebviewCommand
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview.js')
  );

  const nonce = getNonce();
  const apiBase =
    process.env.DFT_IDE_API_BASE ??
    getEnvironmentSetting('dftIde', 'apiBase', environmentDefaults.apiBase);

  const gitlabHost =
    process.env.GITLAB_HOST ??
    getEnvironmentSetting('dftIde', 'gitlabHost', environmentDefaults.gitlabHost);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 connect-src http://localhost:* http://127.0.0.1:* ${apiBase} https:;
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';
                 font-src ${webview.cspSource};
                 img-src ${webview.cspSource} data: http://devops.hisi.beta.huawei.com http://repo.hisi.huawei.com https://w3.huawei.com;" />
  <title>DFT IDE</title>
</head>
<body style="padding: 0; margin: 0; background-color: var(--vscode-editor-background);">
  <div id="root"></div>
  <script nonce="${nonce}">
    window.DFT_IDE_API_BASE = ${JSON.stringify(apiBase)};
    window.DFT_IDE_INITIAL_VIEW = ${JSON.stringify(initialView)};
    window.DFT_IDE_GITLAB_HOST = ${JSON.stringify(gitlabHost)};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
