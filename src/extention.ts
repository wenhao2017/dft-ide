import * as vscode from 'vscode';

const VIEW_TYPE = 'dftIde.welcome';
const GLOBAL_KEY = 'dftIde.hasShownWelcome';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.openWelcome', async () => {
      await openWelcome(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.createWorkspace', async () => {
      await createWorkspace();
    })
  );

  const hasShown = context.globalState.get<boolean>(GLOBAL_KEY, false);
  if (!hasShown) {
    void openWelcome(context);
    void context.globalState.update(GLOBAL_KEY, true);
  }
}

async function openWelcome(context: vscode.ExtensionContext): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'DFT IDE',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = getWelcomeHtml();

  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.command) {
      case 'createWorkspace':
        await vscode.commands.executeCommand('dftIde.createWorkspace');
        return;
      case 'resetWelcome':
        await context.globalState.update(GLOBAL_KEY, false);
        vscode.window.showInformationMessage('已重置欢迎页状态，下次启动会再次弹出。');
        return;
      default:
        return;
    }
  });
}

async function createWorkspace(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: false,
    canSelectFolders: true,
    openLabel: '选择工程根目录'
  });

  if (!picked || picked.length === 0) {
    return;
  }

  const selectedRoot = picked[0];
  const projectRoot = vscode.Uri.joinPath(selectedRoot, 'dft-ide-workspace');

  const mainRoot = vscode.Uri.joinPath(projectRoot, 'main');
  const designRoot = vscode.Uri.joinPath(projectRoot, 'design');
  const verificationRoot = vscode.Uri.joinPath(projectRoot, 'verification');
  const dataRoot = vscode.Uri.joinPath(projectRoot, 'data');

  await vscode.workspace.fs.createDirectory(projectRoot);
  await vscode.workspace.fs.createDirectory(mainRoot);
  await vscode.workspace.fs.createDirectory(designRoot);
  await vscode.workspace.fs.createDirectory(verificationRoot);
  await vscode.workspace.fs.createDirectory(dataRoot);

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(mainRoot, 'README.md'),
    Buffer.from('# DFT IDE Main Workspace\n')
  );

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(designRoot, 'design.cfg.json'),
    Buffer.from(JSON.stringify({ tool: 'hibist', stage: '85' }, null, 2))
  );

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(verificationRoot, 'verification.cfg.json'),
    Buffer.from(JSON.stringify({ tool: 'sailor', stage: '85' }, null, 2))
  );

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(dataRoot, 'normalized-table.json'),
    Buffer.from(
      JSON.stringify(
        [
          {
            pin_name: 'temp_en',
            pin_attribute: 'dft_ip_tsensor0_ctrl',
            ctrl_type: 'share_func',
            default_value: 0,
            ip_sim: 1
          }
        ],
        null,
        2
      )
    )
  );

  const workspaceFile = vscode.Uri.joinPath(projectRoot, 'dft-ide.code-workspace');
  const workspaceContent = {
    folders: [
      { name: 'main', path: 'main' },
      { name: 'design', path: 'design' },
      { name: 'verification', path: 'verification' },
      { name: 'data', path: 'data' }
    ],
    settings: {
      'workbench.startupEditor': 'none'
    }
  };

  await vscode.workspace.fs.writeFile(
    workspaceFile,
    Buffer.from(JSON.stringify(workspaceContent, null, 2))
  );

  const action = await vscode.window.showInformationMessage(
    'DFT IDE 本地工程已创建，是否立即打开？',
    '打开'
  );

  if (action === '打开') {
    await vscode.commands.executeCommand('vscode.openFolder', workspaceFile, false);
  }
}

function getWelcomeHtml(): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>DFT IDE</title>
  <style>
    body {
      font-family: sans-serif;
      padding: 24px;
    }
    .box {
      max-width: 760px;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 24px;
    }
    button {
      margin-right: 12px;
      margin-top: 12px;
      padding: 8px 14px;
      cursor: pointer;
    }
    code {
      background: #f3f3f3;
      padding: 2px 6px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="box">
    <h1>欢迎使用 DFT IDE</h1>
    <p>当前阶段先做本地最小闭环：</p>
    <ul>
      <li>启动自动弹欢迎页</li>
      <li>创建本地多根工作区</li>
      <li>生成基础配置样例</li>
      <li>后续在当前项目中继续扩展功能</li>
    </ul>

    <button onclick="send('createWorkspace')">创建本地工程</button>
    <button onclick="send('resetWelcome')">重置欢迎页状态</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(command) {
      vscode.postMessage({ command: command });
    }
  </script>
</body>
</html>
`;
}

export function deactivate() {}