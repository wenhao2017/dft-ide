import * as vscode from 'vscode';
import { submitJob, queryJobStatus } from './services/donauService';

const VIEW_TYPE = 'dftIde.welcome';
const GLOBAL_KEY = 'dftIde.hasShownWelcome';

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let activeCategory: string | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
  // 1. 注册左侧扁平化的 Tree View
  vscode.window.registerTreeDataProvider('dftIde.views.flows', new DftFlowProvider());

  // 2. 注册命令：点击左侧一级菜单时触发
  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.openFlow', async (category: string) => {
      await openWebviewFlow(context, category);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.openWelcome', async () => {
      await openWebviewFlow(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.createWorkspace', async () => {
      await createWorkspace();
    })
  );

  // 每次启动都强制打开欢迎Webview页
  void openWebviewFlow(context);
}

// ============================================================
// 一级菜单的 Tree View 数据提供者
// ============================================================

interface FlowMenuConfig {
  label: string;
  icon: string;
  description: string;
  tooltip: string;
  category: string;
  contextValue: string;
}

const FLOW_CONFIGS: FlowMenuConfig[] = [
  {
    label: 'COMMON',
    icon: 'settings-gear',
    description: 'Git · OBS · Paths',
    tooltip: '公共配置\n─────────────────\n• Git 设计/验证分支管理\n• Design Tree 路径配置\n• OBS 存储与公共数据下载\n• 归一化表格路径',
    category: 'COMMON',
    contextValue: 'dftFlow.common',
  },
  {
    label: 'Design',
    icon: 'symbol-color',
    description: 'hibist · sailor · DCG',
    tooltip: 'Design Flow\n─────────────────\n• 公共配置 & 工具版本选择\n• 执行流程 (DCG / DC / TOP-DOWN)\n• 集群资源 (CPU / 内存 / 队列)\n• 宏定义 & 特殊参数\n• 执行日志 & 结果查看\n• 端云协同提交',
    category: 'Design',
    contextValue: 'dftFlow.design',
  },
  {
    label: 'Verification',
    icon: 'verified-filled',
    description: 'sailor · VCS · sim',
    tooltip: 'Verification Flow\n─────────────────\n• 验证工具配置 & 版本管理\n• 仿真执行参数\n• 覆盖率报告查看\n• Donau HPC 作业提交',
    category: 'Verification',
    contextValue: 'dftFlow.verification',
  },
  {
    label: 'Formal',
    icon: 'beaker',
    description: '— Coming Soon',
    tooltip: 'Formal Verification\n─────────────────\n形式化验证工具链（开发中）',
    category: 'Formal',
    contextValue: 'dftFlow.formal',
  },
  {
    label: 'STA',
    icon: 'graph',
    description: '— Coming Soon',
    tooltip: 'Static Timing Analysis\n─────────────────\n静态时序分析配置（开发中）',
    category: 'STA',
    contextValue: 'dftFlow.sta',
  },
];

class DftFlowProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve(FLOW_CONFIGS.map((cfg) => this.createMenuItem(cfg)));
  }

  private createMenuItem(cfg: FlowMenuConfig): vscode.TreeItem {
    const item = new vscode.TreeItem(cfg.label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(cfg.icon);
    item.description = cfg.description;
    item.tooltip = new vscode.MarkdownString(
      `**$(${cfg.icon}) ${cfg.label}**\n\n${cfg.tooltip.replace(/\n/g, '\n\n')}`
    );
    item.contextValue = cfg.contextValue;
    item.command = {
      command: 'dftIde.openFlow',
      title: `Open ${cfg.label} Flow`,
      arguments: [cfg.category],
    };
    return item;
  }
}

// ============================================================
// Webview 管理与通信逻辑
// ============================================================
/** 每个 category 对应的 Tab 标题 */
const CATEGORY_TITLES: Record<string, string> = {
  COMMON: 'DFT IDE — 公共配置',
  Design: 'DFT IDE — Design Flow',
  Verification: 'DFT IDE — Verification Flow',
  Formal: 'DFT IDE — Formal',
  STA: 'DFT IDE — STA',
};

async function openWebviewFlow(context: vscode.ExtensionContext, category?: string): Promise<void> {
  if (category) {
    activeCategory = category;
  }

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    // 更新 Tab 标题
    currentPanel.title = activeCategory ? (CATEGORY_TITLES[activeCategory] ?? `DFT IDE — ${activeCategory}`) : 'DFT IDE';
    if (activeCategory) {
      currentPanel.webview.postMessage({ command: 'loadFlow', category: activeCategory });
    }
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    activeCategory ? (CATEGORY_TITLES[activeCategory] ?? `DFT IDE — ${activeCategory}`) : 'DFT IDE',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out')],
    }
  );

  currentPanel.webview.html = getWebviewHtml(currentPanel.webview, context.extensionUri);

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });

  currentPanel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.command) {
      case 'webviewReady':
        if (activeCategory) {
          currentPanel?.webview.postMessage({ command: 'loadFlow', category: activeCategory });
        }
        return;

      case 'createWorkspace':
        await vscode.commands.executeCommand('dftIde.createWorkspace');
        return;

      case 'resetWelcome':
        await context.globalState.update(GLOBAL_KEY, false);
        vscode.window.showInformationMessage('已重置欢迎页状态，下次启动会再次弹出。');
        return;

      // ── 新增：选择文件/目录路径 ──────────────────────────────
      case 'selectPath': {
        const requestId: string = msg.requestId;
        const targetType = msg.targetType || 'file';
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: targetType === 'file',
          canSelectFolders: targetType === 'folder',
          canSelectMany: false,
          openLabel: '选择',
        });
        const path = picked?.[0]?.fsPath ?? null;
        currentPanel?.webview.postMessage({
          command: 'selectPathResponse',
          requestId,
          path,
        });
        return;
      }

      // ── 新增：在 VS Code 编辑器中打开文件或文件夹 ───────────────────
      case 'openFile': {
        const filePath: string | undefined = msg.path;
        if (!filePath) { return; }
        try {
          const uri = vscode.Uri.file(filePath);
          const stat = await vscode.workspace.fs.stat(uri);
          
          if (stat.type === vscode.FileType.Directory) {
            // 如果是目录，则在系统的文件管理器中打开
            await vscode.commands.executeCommand('revealFileInOS', uri);
          } else {
            // 如果是文件，则在 VS Code 编辑器中打开
            await vscode.commands.executeCommand('vscode.open', uri);
          }
        } catch (error) {
          vscode.window.showErrorMessage(`无法打开路径: ${filePath}`);
        }
        return;
      }

      case 'submitTask': {
        const payload = msg.payload;
        const jobId = submitJob(payload);
        currentPanel?.webview.postMessage({ command: 'taskSubmitted', jobId });

        let pollCount = 0;
        const timer = setInterval(() => {
          const result = queryJobStatus(jobId);
          currentPanel?.webview.postMessage({
            command: 'jobStatus',
            jobId: result.jobId,
            status: result.status,
            progress: result.progress,
          });
          pollCount++;
          if (result.status === 'SUCCESS' || pollCount > 30) {
            clearInterval(timer);
          }
        }, 2000);
        return;
      }
      default:
        return;
    }
  });
}

// ============================================================
// createWorkspace 
// ============================================================
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

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview.js')
  );

  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';
                 font-src ${webview.cspSource};
                 img-src ${webview.cspSource} data:;" />
  <title>DFT IDE</title>
</head>
<body style="padding: 0; margin: 0; background-color: var(--vscode-editor-background);">
  <div id="root"></div>
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

export function deactivate() {}