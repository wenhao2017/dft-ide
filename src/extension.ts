import * as vscode from 'vscode';
import { submitJob, queryJobStatus } from './services/donauService';
import { gitService } from './services/gitService';

const VIEW_TYPE = 'dftIde.welcome';
const GLOBAL_KEY = 'dftIde.hasShownWelcome';
const LAYOUT_BACKUP_KEY = 'dftIde.layout.previousSettings';

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let activeCategory: string | undefined = undefined;
let pendingWebviewCommand: { command: 'showWelcome' } | { command: 'loadFlow'; category: string } | undefined;

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
      await createProject();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.createProject', async () => {
      await createProject();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.applyLayout', async () => {
      await applyDftIdeLayout(context, false);
      await showDftWorkbench(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.restoreLayout', async () => {
      await restoreVscodeLayout(context);
    })
  );

  void initializeDftWorkbench(context);
}

async function initializeDftWorkbench(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('dftIde');
  if (config.get<boolean>('layout.autoApply', true)) {
    await applyDftIdeLayout(context, true);
  }
  await focusDftView();
}

async function showDftWorkbench(context: vscode.ExtensionContext): Promise<void> {
  await focusDftView();
  await vscode.commands.executeCommand('dftIde.openWelcome');
}

async function focusDftView(): Promise<void> {
  try {
    await vscode.commands.executeCommand('workbench.view.extension.dftIdeExplorer');
  } catch {
    // The view container can be unavailable very early in startup; opening home is still useful.
  }
}

async function applyDftIdeLayout(context: vscode.ExtensionContext, silent: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('dftIde');
  const hideMenuBar = config.get<boolean>('layout.hideMenuBar', true);
  const hideActivityBar = config.get<boolean>('layout.hideActivityBar', true);

  const updates: Array<[string, unknown]> = [
    ['window.commandCenter', false],
    ['workbench.layoutControl.enabled', false],
    ['workbench.startupEditor', 'none'],
    ['workbench.editor.showTabs', true],
    ['breadcrumbs.enabled', false],
  ];

  if (hideMenuBar) {
    updates.push(['window.menuBarVisibility', 'hidden']);
  }

  if (hideActivityBar) {
    updates.push(['workbench.activityBar.visible', false]);
    updates.push(['workbench.activityBar.location', 'hidden']);
  }

  await backupLayoutSettings(context, updates.map(([key]) => key));
  await updateUserSettings(updates);

  if (!silent) {
    vscode.window.showInformationMessage('DFT IDE 布局已应用。');
  }
}

async function restoreVscodeLayout(context: vscode.ExtensionContext): Promise<void> {
  const backup = context.globalState.get<Array<{ key: string; hasValue: boolean; value: unknown }>>(
    LAYOUT_BACKUP_KEY,
    []
  );

  if (backup.length > 0) {
    await updateUserSettings(
      backup.map((item) => [item.key, item.hasValue ? item.value : undefined])
    );
    await context.globalState.update(LAYOUT_BACKUP_KEY, undefined);
  } else {
    await updateUserSettings([
      ['window.menuBarVisibility', undefined],
      ['window.commandCenter', undefined],
      ['workbench.activityBar.visible', undefined],
      ['workbench.activityBar.location', undefined],
      ['workbench.layoutControl.enabled', undefined],
      ['workbench.startupEditor', undefined],
      ['workbench.editor.showTabs', undefined],
      ['breadcrumbs.enabled', undefined],
    ]);
  }

  vscode.window.showInformationMessage('已恢复 VS Code 默认布局设置。');
}

async function backupLayoutSettings(context: vscode.ExtensionContext, keys: string[]): Promise<void> {
  const existing = context.globalState.get<Array<{ key: string; hasValue: boolean; value: unknown }>>(
    LAYOUT_BACKUP_KEY
  );
  if (existing) {
    return;
  }

  const backup = keys.map((key) => {
    const inspected = vscode.workspace.getConfiguration().inspect(key);
    return {
      key,
      hasValue: inspected?.globalValue !== undefined,
      value: inspected?.globalValue,
    };
  });

  await context.globalState.update(LAYOUT_BACKUP_KEY, backup);
}

async function updateUserSettings(updates: Array<[string, unknown]>): Promise<void> {
  await Promise.all(
    updates.map(([key, value]) =>
      vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global)
    )
  );
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
    label: '主页',
    icon: 'home',
    description: 'Project Console',
    tooltip: 'DFT IDE 项目主页',
    category: 'HOME',
    contextValue: 'dftFlow.home',
  },
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
    item.command = cfg.category === 'HOME'
      ? {
          command: 'dftIde.openWelcome',
          title: 'Open DFT IDE Home',
        }
      : {
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
  HOME: 'DFT IDE — 主页',
  COMMON: 'DFT IDE — 公共配置',
  Design: 'DFT IDE — Design Flow',
  Verification: 'DFT IDE — Verification Flow',
  Formal: 'DFT IDE — Formal',
  STA: 'DFT IDE — STA',
};

async function openWebviewFlow(context: vscode.ExtensionContext, category?: string): Promise<void> {
  activeCategory = category;
  pendingWebviewCommand = activeCategory
    ? { command: 'loadFlow', category: activeCategory }
    : { command: 'showWelcome' };

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    // 更新 Tab 标题
    currentPanel.title = activeCategory ? (CATEGORY_TITLES[activeCategory] ?? `DFT IDE — ${activeCategory}`) : CATEGORY_TITLES.HOME;
    currentPanel.webview.postMessage(pendingWebviewCommand);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    activeCategory ? (CATEGORY_TITLES[activeCategory] ?? `DFT IDE — ${activeCategory}`) : CATEGORY_TITLES.HOME,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out')],
    }
  );

  currentPanel.webview.html = getWebviewHtml(
    currentPanel.webview,
    context.extensionUri,
    pendingWebviewCommand ?? { command: 'showWelcome' }
  );

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });

  currentPanel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.command) {
      case 'getGitInfo': {
        const requestId: string = msg.requestId;
        try {
          const gitInfo = await gitService.getCurrentGitInfo();
          currentPanel?.webview.postMessage({
            command: 'getGitInfoResponse',
            requestId,
            branch: gitInfo?.branch,
            repoRoot: gitInfo?.repoRoot,
            hasChanges: gitInfo?.hasChanges
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'getGitInfoResponse',
            requestId,
            error: 'Failed to get git info'
          });
        }
        return;
      }
      
      case 'webviewReady':
        currentPanel?.webview.postMessage(pendingWebviewCommand ?? { command: 'showWelcome' });
        pendingWebviewCommand = undefined;
        return;

      case 'createWorkspace':
      case 'createProject':
        await vscode.commands.executeCommand('dftIde.createProject');
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
            // 如果是文件，则在当前编辑器组中新开 tab，保留 DFT IDE tab
            await vscode.window.showTextDocument(uri, {
              viewColumn: vscode.ViewColumn.Active,
              preview: false,
            });
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
      case 'vscodeDemo':
        await runVscodeDemo(msg.action);
        return;
      default:
        return;
    }
  });
}

// ============================================================
// createProject
// ============================================================
async function createProject(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: false,
    canSelectFolders: true,
    openLabel: '选择项目根目录'
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
    'DFT IDE 本地项目已创建，是否立即打开？',
    '打开'
  );

  if (action === '打开') {
    await vscode.commands.executeCommand('vscode.openFolder', workspaceFile, false);
  }
}

async function runVscodeDemo(action: unknown): Promise<void> {
  switch (action) {
    case 'notification':
      await vscode.window.showInformationMessage('DFT IDE 通知示例：项目状态已刷新。');
      return;
    case 'quickPick': {
      const picked = await vscode.window.showQuickPick(
        ['COMMON 配置', 'Design 工作流', 'Verification 工作流'],
        { placeHolder: '选择要进入的 DFT 功能区' }
      );
      if (picked) {
        await vscode.window.showInformationMessage(`已选择：${picked}`);
      }
      return;
    }
    case 'clipboard':
      await vscode.env.clipboard.writeText('DFT IDE clipboard demo');
      await vscode.window.showInformationMessage('示例文本已写入剪贴板。');
      return;
    case 'terminal': {
      const terminal = vscode.window.createTerminal('DFT IDE Demo');
      terminal.show();
      terminal.sendText('echo DFT IDE terminal demo');
      return;
    }
    case 'settings':
      await vscode.commands.executeCommand('workbench.action.openSettings', 'DFT IDE');
      return;
    case 'external':
      await vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/api'));
      return;
    default:
      await vscode.window.showWarningMessage('未知的 VS Code 能力示例。');
  }
}

function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  initialView: { command: 'showWelcome' } | { command: 'loadFlow'; category: string }
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview.js')
  );

  const nonce = getNonce();
  const apiBase = vscode.workspace.getConfiguration('dftIde').get<string>('apiBase', '');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 connect-src http://localhost:* http://127.0.0.1:* https:;
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';
                 font-src ${webview.cspSource};
                 img-src ${webview.cspSource} data:;" />
  <title>DFT IDE</title>
</head>
<body style="padding: 0; margin: 0; background-color: var(--vscode-editor-background);">
  <div id="root"></div>
  <script nonce="${nonce}">
    window.DFT_IDE_API_BASE = ${JSON.stringify(apiBase)};
    window.DFT_IDE_INITIAL_VIEW = ${JSON.stringify(initialView)};
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

export function deactivate() {}
