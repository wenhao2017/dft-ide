import * as vscode from 'vscode';
import {exec, execFile} from 'child_process'
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { submitJob, queryJobStatus, getDonauResources } from './services/donauService';
import { gitService } from './services/gitService';
import { obsService } from './services/obsService';
import { DftProject } from './webview/services/projectService';
import {
  PipelineRuntimeHistoryRecord,
  PipelineRuntimeService,
  isPipelineFlowKey,
} from './services/pipelineRuntimeService';

const VIEW_TYPE = 'dftIde.welcome';
const GLOBAL_KEY = 'dftIde.hasShownWelcome';
const LAYOUT_BACKUP_KEY = 'dftIde.layout.previousSettings';
const LOCAL_STATE_DIR_NAME = '.dft-ide';
const LOCAL_STATE_SUBDIR = 'local-state';
const OBS_READONLY_SCHEME = 'dft-obs-readonly';
const PROJECT_REPOS = ['data', 'hibist', 'sailor', 'verification'] as const;
const GITLAB_HOST = 'http://7.227.4.70/test11';

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let activeCategory: string | undefined = undefined;
let pendingWebviewCommand: { command: 'showWelcome' } | { command: 'loadFlow'; category: string } | undefined;
const obsReadonlyDocuments = new Map<string, string>();
const dftDiagnostics = vscode.languages.createDiagnosticCollection('dft-ide');
const pipelineRuntimeService = new PipelineRuntimeService({
  onUpdate: (snapshot) => {
    currentPanel?.webview.postMessage({ command: 'pipelineRuntimeUpdated', snapshot });
  },
  onHistory: (record) => {
    void saveExecutionHistoryRecord(record.flow, record).catch((error) => {
      console.error('Failed to persist pipeline execution history', error);
    });
  },
  openTerminal: (title, command) => {
    void openExecutionTerminal({ title, command });
  },
});
/** 优化3：跟踪活跃的任务轮询计时器，以便支持取消 */
const activeJobTimers = new Map<string, ReturnType<typeof setInterval>>();

export function activate(context: vscode.ExtensionContext) {
  const isDev = context.extensionMode === vscode.ExtensionMode.Development;

  if (isDev) {
    const envPath = path.join(context.extensionPath, '.env');

    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }

  context.subscriptions.push(dftDiagnostics);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(OBS_READONLY_SCHEME, {
      provideTextDocumentContent: (uri) =>
        obsReadonlyDocuments.get(uri.toString()) ?? 'OBS readonly preview is unavailable.',
    })
  );
  // 1. 注册左侧扁平化的 Tree View
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document.uri.scheme === OBS_READONLY_SCHEME) {
        void cleanupObsReadonlyDocument(document.uri);
      }
    })
  );
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
      await openProjectFromPicker();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.createProject', async () => {
      await openProjectFromPicker();
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

  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.openExecutionTerminalFromUri', async (options?: {
      title?: string;
      command?: string;
      cwd?: string;
    }) => {
      await openExecutionTerminal({
        title: typeof options?.title === 'string' ? options.title : undefined,
        command: typeof options?.command === 'string' ? options.command : undefined,
        cwd: typeof options?.cwd === 'string' ? options.cwd : undefined,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.whoami', async function (): Promise<string> {
      const stdout = await executeShellCommand("whoami");
      return stdout.split('\\')[1].trim().toLowerCase();
    })
  );

  void initializeDftWorkbench(context);
}

async function executeShellCommand(command: string, workDir?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = workDir ? { cwd: workDir } : {};
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr && stderr.includes('error')) {
        vscode.window.showErrorMessage(`stderr: ${stderr}`);
        reject(new Error(stderr));
        return;
      }
      resolve(stdout);
    });
  });
}

async function executeFileCommand(command: string, args: string[], workDir?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = workDir ? { cwd: workDir } : {};
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr && stderr.toLowerCase().includes('error')) {
        vscode.window.showErrorMessage(`stderr: ${stderr}`);
        reject(new Error(stderr));
        return;
      }
      resolve(stdout);
    });
  });
}

async function initializeDftWorkbench(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('dftIde');
  // 优化5：默认不再自动应用激进布局，改为用户手动切换"专注模式"
  if (config.get<boolean>('layout.autoApply', false)) {
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
    label: '项目主页',
    icon: 'home',
    description: 'Overview',
    tooltip: 'DFT IDE 项目管理主页',
    category: 'HOME',
    contextValue: 'dftFlow.home',
  },
  {
    label: '公共配置',
    icon: 'settings-gear',
    description: 'Global Settings',
    tooltip: '公共配置\n─────────────────\n• Git 仓库分支管理\n• Design Tree 路径配置\n• 归一化表格及公共数据配置',
    category: 'Common',
    contextValue: 'dftFlow.common',
  },
  {
    label: '设计流程 (Hibist)',
    icon: 'rocket',
    description: 'Design Flow',
    tooltip: 'Hibist Flow\n─────────────────\n• 工具版本与执行流程管理\n• 集群资源与参数配置\n• 日志查看与结果提交',
    category: 'Hibist',
    contextValue: 'dftFlow.hibist',
  },
  {
    label: '设计流程 (Sailor)',
    icon: 'circuit-board',
    description: 'Design Flow',
    tooltip: 'Sailor Flow\n─────────────────\n• 工具版本与执行流程管理\n• 集群资源与参数配置\n• 日志查看与结果提交',
    category: 'Sailor',
    contextValue: 'dftFlow.sailor',
  },
  {
    label: '仿真验证 (Lander)',
    icon: 'verified-filled',
    description: 'Verification Flow',
    tooltip: 'Verification Flow\n─────────────────\n• 验证工具配置与仿真执行\n• 覆盖率报告查看与 HPC 作业提交',
    category: 'Verification',
    contextValue: 'dftFlow.verification',
  },
  {
    label: '形式验证',
    icon: 'shield',
    description: 'Formal (Coming Soon)',
    tooltip: 'Formal Verification\n─────────────────\n形式化验证工具链（开发中）',
    category: 'Formal',
    contextValue: 'dftFlow.formal',
  },
  {
    label: '静态时序',
    icon: 'graph',
    description: 'STA (Coming Soon)',
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
    
    let colorId = 'charts.blue';
    if (cfg.category === 'Hibist') colorId = 'charts.purple';
    else if (cfg.category === 'Sailor') colorId = 'charts.blue';
    else if (cfg.category === 'Verification') colorId = 'charts.green';
    else if (cfg.category === 'Formal' || cfg.category === 'STA') colorId = 'descriptionForeground';

    item.iconPath = new vscode.ThemeIcon(cfg.icon, new vscode.ThemeColor(colorId));
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
  Hibist: 'DFT IDE — Hibist Flow',
  Sailor: 'DFT IDE — Sailor Flow',
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
      enableCommandUris: true,
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
        if (pendingWebviewCommand) {
          currentPanel?.webview.postMessage(pendingWebviewCommand);
          pendingWebviewCommand = undefined;
        }
        currentPanel?.webview.postMessage({
          command: 'pipelineRuntimesUpdated',
          snapshots: pipelineRuntimeService.getRuntimes()
        });
        return;

      case 'getPipelineRuntimes': {
        const requestId: string = msg.requestId;
        currentPanel?.webview.postMessage({
          command: 'getPipelineRuntimesResponse',
          requestId,
          success: true,
          snapshots: pipelineRuntimeService.getRuntimes()
        });
        return;
      }

      case 'ensurePipelineRuntime':
      case 'startPipelineRuntime':
      case 'stopPipelineRuntime':
      case 'selectPipelineTask':
      case 'stopPipelineTask':
      case 'rerunPipelineTask': {
        const requestId: string | undefined = msg.requestId;
        try {
          const flowKey = msg.flowKey;
          const moduleKey = typeof msg.moduleKey === 'string' ? msg.moduleKey : '';
          const flowLabel = typeof msg.flowLabel === 'string' ? msg.flowLabel : moduleKey;
          const taskId = typeof msg.taskId === 'string' ? msg.taskId : '';

          if (!isPipelineFlowKey(flowKey) || !moduleKey) {
            throw new Error('Invalid pipeline runtime payload');
          }

          if (msg.command === 'ensurePipelineRuntime') {
            pipelineRuntimeService.ensureRuntime(flowKey, moduleKey, flowLabel);
          } else if (msg.command === 'startPipelineRuntime') {
            pipelineRuntimeService.startRuntime(flowKey, moduleKey, flowLabel);
          } else if (msg.command === 'stopPipelineRuntime') {
            pipelineRuntimeService.stopRuntime(flowKey, moduleKey, flowLabel);
          } else if (msg.command === 'selectPipelineTask') {
            pipelineRuntimeService.selectTask(flowKey, moduleKey, taskId);
          } else if (msg.command === 'stopPipelineTask') {
            pipelineRuntimeService.stopTask(flowKey, moduleKey, taskId);
          } else if (msg.command === 'rerunPipelineTask') {
            pipelineRuntimeService.rerunTask(flowKey, moduleKey, taskId);
          }

          if (requestId) {
            currentPanel?.webview.postMessage({
              command: `${msg.command}Response`,
              requestId,
              success: true
            });
          }
        } catch (err) {
          if (requestId) {
            currentPanel?.webview.postMessage({
              command: `${msg.command}Response`,
              requestId,
              success: false,
              error: String(err)
            });
          }
        }
        return;
      }

      case 'createWorkspace':
      case 'createProject':
        await vscode.commands.executeCommand('dftIde.createProject');
        return;

      case 'resetWelcome':
        await context.globalState.update(GLOBAL_KEY, false);
        vscode.window.showInformationMessage('已重置欢迎页状态，下次启动会再次弹出。');
        return;

      case 'getCurrentUser': {
        const requestId: string = msg.requestId;
        try {
          const user = await vscode.commands.executeCommand('dftIde.whoami');
          currentPanel?.webview.postMessage({
            command: 'getCurrentUserResponse',
            requestId,
            user: user
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'getCurrentUserResponse',
            requestId,
            error: String(err)
          });
        }
        return;
      }

      // ── 新增：选择文件/目录路径 ──────────────────────────────
      case 'getDonauResources': {
        const requestId: string = msg.requestId;
        try {
          const result = await getDonauResources();
          currentPanel?.webview.postMessage({
            command: 'getDonauResourcesResponse',
            requestId,
            ...result,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'getDonauResourcesResponse',
            requestId,
            success: false,
            source: 'real',
            accounts: [],
            queues: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

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
          } else if (isSpreadsheetFile(uri.fsPath)) {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              uri,
              'grapecity.gc-excelviewer',
              vscode.ViewColumn.Active
            );
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

      case 'openObsFileReadOnly': {
        const requestId: string = msg.requestId;
        const obsPath = typeof msg.path === 'string' ? msg.path : '';
        try {
          await openObsReadonlyDocument(context, obsPath);
          currentPanel?.webview.postMessage({
            command: 'openObsFileReadOnlyResponse',
            requestId,
            success: true,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'openObsFileReadOnlyResponse',
            requestId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      case 'submitTask': {
        const payload = msg.payload;
        const jobId = submitJob(payload);
        currentPanel?.webview.postMessage({ command: 'taskSubmitted', jobId });

        // 优化3：基于状态的轮询，不再硬编码 30 次上限
        const timer = setInterval(() => {
          const result = queryJobStatus(jobId);
          currentPanel?.webview.postMessage({
            command: 'jobStatus',
            jobId: result.jobId,
            status: result.status,
            progress: result.progress,
          });
          if (result.status === 'SUCCESS' || result.status === 'FAILED') {
            clearInterval(timer);
            activeJobTimers.delete(jobId);
          }
        }, 2000);
        activeJobTimers.set(jobId, timer);
        return;
      }
      case 'vscodeDemo':
        await runVscodeDemo(msg.action);
        return;

      // ── 优化2：路径有效性验证 ─────────────────────────────────
      case 'validatePath': {
        const requestId: string = msg.requestId;
        const targetPath = typeof msg.path === 'string' ? msg.path.trim() : '';
        try {
          if (!targetPath) {
            currentPanel?.webview.postMessage({
              command: 'validatePathResponse', requestId,
              exists: false, isFile: false, isDirectory: false
            });
            return;
          }
          const uri = vscode.Uri.file(targetPath);
          const stat = await vscode.workspace.fs.stat(uri);
          currentPanel?.webview.postMessage({
            command: 'validatePathResponse', requestId,
            exists: true,
            isFile: stat.type === vscode.FileType.File,
            isDirectory: stat.type === vscode.FileType.Directory,
          });
        } catch {
          currentPanel?.webview.postMessage({
            command: 'validatePathResponse', requestId,
            exists: false, isFile: false, isDirectory: false
          });
        }
        return;
      }

      // ── 优化3：任务取消 ─────────────────────────────────────
      case 'cancelTask': {
        const requestId: string = msg.requestId;
        const jobId = typeof msg.jobId === 'string' ? msg.jobId : '';
        const timer = activeJobTimers.get(jobId);
        if (timer) {
          clearInterval(timer);
          activeJobTimers.delete(jobId);
          currentPanel?.webview.postMessage({
            command: 'jobStatus',
            jobId,
            status: 'FAILED',
            progress: 0,
          });
        }
        currentPanel?.webview.postMessage({
          command: 'cancelTaskResponse', requestId,
          success: true,
        });
        return;
      }

      // ── 优化4：获取 Git 变更文件列表 ─────────────────────────
      case 'getGitChangedFiles': {
        const requestId: string = msg.requestId;
        try {
          const gitInfo = await gitService.getCurrentGitInfo();
          const files = (gitInfo?.changedFiles ?? []).map(f => ({
            path: vscode.workspace.asRelativePath(f.path),
            type: f.type,
          }));
          currentPanel?.webview.postMessage({
            command: 'getGitChangedFilesResponse',
            requestId,
            files,
            branch: gitInfo?.branch,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'getGitChangedFilesResponse',
            requestId,
            files: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // ── 优化4：打开 VS Code SCM 视图 ─────────────────────────
      case 'openSourceControl': {
        await gitService.openSourceControl();
        return;
      }

      // ── 优化5：专注模式切换 ──────────────────────────────────
      case 'toggleZenMode': {
        const requestId: string = msg.requestId;
        const enable = Boolean(msg.enable);
        try {
          if (enable) {
            await applyDftIdeLayout(context, true);
          } else {
            await restoreVscodeLayout(context);
          }
          currentPanel?.webview.postMessage({
            command: 'toggleZenModeResponse', requestId,
            success: true,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'toggleZenModeResponse', requestId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      case 'openObsViewer': {
        const requestId: string = msg.requestId;
        try {
          const result = await obsService.openViewer({
            spaceName: typeof msg.spaceName === 'string' ? msg.spaceName : undefined,
            fallbackSpaceName: resolveDefaultProjectName(),
          });
          currentPanel?.webview.postMessage({
            command: 'openObsViewerResponse',
            requestId,
            success: true,
            ...result,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'openObsViewerResponse',
            requestId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      case 'openExecutionTerminal': {
        const requestId = typeof msg.requestId === 'string' ? msg.requestId : undefined;
        const title = typeof msg.title === 'string' && msg.title.trim()
          ? msg.title.trim()
          : 'DFT IDE Task';
        const command = typeof msg.command === 'string' ? msg.command.trim() : '';
        const requestedCwd = typeof msg.cwd === 'string' && msg.cwd.trim() ? msg.cwd.trim() : undefined;
        try {
          await openExecutionTerminal({ title, command, cwd: requestedCwd });
          if (requestId) {
            currentPanel?.webview.postMessage({
              command: 'openExecutionTerminalResponse',
              requestId,
              success: true,
            });
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          if (requestId) {
            currentPanel?.webview.postMessage({
              command: 'openExecutionTerminalResponse',
              requestId,
              success: false,
              error,
            });
          }
          vscode.window.showErrorMessage(`DFT IDE failed to open terminal: ${error}`);
        }
        return;
      }

      case 'getProjectRepoGitInfo': {
        const requestId: string = msg.requestId;
        try {
          const repos = await Promise.all(
            (['hibist', 'sailor', 'data', 'verification'] as const).map((repo) => getRepoGitInfoForWebview(repo))
          );
          currentPanel?.webview.postMessage({
            command: 'getProjectRepoGitInfoResponse',
            requestId,
            repos
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'getProjectRepoGitInfoResponse',
            requestId,
            repos: [],
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      case 'getRepoGitInfo': {
        const requestId: string = msg.requestId;
        const repo = normalizeProjectRepo(msg.repo);
        try {
          if (!repo) {
            throw new Error('Unsupported repository.');
          }
          currentPanel?.webview.postMessage({
            command: 'getRepoGitInfoResponse',
            requestId,
            ...(await getRepoGitInfoForWebview(repo))
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'getRepoGitInfoResponse',
            requestId,
            repo: typeof msg.repo === 'string' ? msg.repo : 'unknown',
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      case 'runRepoGitAction': {
        const requestId: string = msg.requestId;
        const repo = normalizeProjectRepo(msg.repo);
        const action = typeof msg.action === 'string' ? msg.action : '';
        const branchName = typeof msg.branchName === 'string' ? msg.branchName.trim() : '';
        try {
          if (!repo) {
            throw new Error('Unsupported repository.');
          }
          const resource = vscode.Uri.file(getProjectRepoRoot(repo));
          if (action === 'pull') {
            await gitService.pull(resource);
          } else if (action === 'push') {
            await gitService.push(resource);
          } else if (action === 'fetch') {
            await gitService.fetch(resource);
          } else if (action === 'checkout') {
            await gitService.checkout(branchName, resource);
          } else if (action === 'createBranch') {
            await gitService.createBranch(branchName, true, resource);
          } else if (action === 'openScm') {
            await gitService.openSourceControl();
          } else {
            throw new Error(`Unsupported Git action: ${action}`);
          }
          currentPanel?.webview.postMessage({
            command: 'runRepoGitActionResponse',
            requestId,
            success: true
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'runRepoGitActionResponse',
            requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      // ── 配置保存 ───────────────────────────────────────────────
      case 'submitRepoToCloud': {
        const requestId: string = msg.requestId;
        const repo = normalizeProjectRepo(msg.repo);
        const message = typeof msg.message === 'string' ? msg.message : undefined;
        const pullBeforePush = Boolean(msg.pullBeforePush);
        try {
          if (!repo) {
            throw new Error('Unsupported repository.');
          }
          const result = await submitRepoToCloud(repo, { message, pullBeforePush });
          currentPanel?.webview.postMessage({
            command: 'submitRepoToCloudResponse',
            requestId,
            ...result,
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'submitRepoToCloudResponse',
            requestId,
            success: false,
            state: 'error',
            repo: typeof msg.repo === 'string' ? msg.repo : 'hibist',
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      case 'openProjectWorkspace': {
        const requestId: string = msg.requestId;
        const rootPath = typeof msg.rootPath === 'string' ? msg.rootPath.trim() : '';
        try {
          if (!rootPath) {
            throw new Error('Project root path is empty.');
          }
          const result = await openProjectWorkspace(rootPath);
          currentPanel?.webview.postMessage({
            command: 'openProjectWorkspaceResponse',
            requestId,
            success: true,
            ...result,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'openProjectWorkspaceResponse',
            requestId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      case 'prepareProjectWorkspace': {
        const requestId: string = msg.requestId;
        const projectName = typeof msg.projectName === 'string' ? msg.projectName.trim() : '';
        const projectKey = typeof msg.projectKey === 'string' ? msg.projectKey.trim() : projectName;
        try {
          if (!projectName) {
            throw new Error('Project name is empty.');
          }
          const result = await prepareProjectWorkspace(projectName, projectKey);
          currentPanel?.webview.postMessage({
            command: 'prepareProjectWorkspaceResponse',
            requestId,
            success: true,
            ...result,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'prepareProjectWorkspaceResponse',
            requestId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      case 'saveConfig': {
        const requestId: string = msg.requestId;
        const flow = String(msg.flow ?? 'default');
        const data = msg.data as Record<string, unknown>;
        try {
          const filePath = resolveConfigPath(flow);
          if (!filePath) {
            currentPanel?.webview.postMessage({
              command: 'saveConfigResponse', requestId,
              success: false, error: '未找到工作区路径，请先打开 DFT 项目工作区'
            });
            return;
          }
          await ensureLocalConfigDirectory(path.dirname(filePath));
          const projectRoot = resolveProjectRoot();
          if (projectRoot) {
            await ensureLocalStateIgnored(projectRoot, path.dirname(filePath));
          }
          const merged = await mergeConfigFile(filePath, data);
          const encoded = Buffer.from(JSON.stringify(merged, null, 2));
          await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), encoded);
          const relative = vscode.workspace.asRelativePath(filePath);
          currentPanel?.webview.postMessage({
            command: 'saveConfigResponse', requestId,
            success: true, filePath: relative
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'saveConfigResponse', requestId,
            success: false, error: String(err)
          });
        }
        return;
      }

      // ── 配置读取 ───────────────────────────────────────────────
      case 'readConfig': {
        const requestId: string = msg.requestId;
        const flow = String(msg.flow ?? 'default');
        try {
          const filePath = resolveConfigPath(flow);
          if (!filePath) {
            currentPanel?.webview.postMessage({
              command: 'readConfigResponse', requestId, data: null
            });
            return;
          }
          try {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const data = JSON.parse(Buffer.from(bytes).toString('utf-8'));
            currentPanel?.webview.postMessage({
              command: 'readConfigResponse', requestId, data
            });
          } catch {
            // 文件不存在或解析失败，返回 null（首次使用时正常）
            currentPanel?.webview.postMessage({
              command: 'readConfigResponse', requestId, data: null
            });
          }
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'readConfigResponse', requestId,
            error: String(err), data: null
          });
        }
        return;
      }

      // ── Git 同步 ────────────────────────────────────────────────
      case 'readDesignTree': {
        const requestId: string = msg.requestId;
        const flow = typeof msg.flow === 'string' ? msg.flow : undefined;
        try {
          const data = await readDesignTreeState(flow);
          currentPanel?.webview.postMessage({
            command: 'readDesignTreeResponse',
            requestId,
            data
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'readDesignTreeResponse',
            requestId,
            error: String(err),
            data: null
          });
        }
        return;
      }

      case 'saveDesignTree': {
        const requestId: string = msg.requestId;
        const flow = String(msg.flow ?? 'hibist');
        const data = msg.data as Record<string, unknown>;
        try {
          const result = await saveDesignTreeState(flow, data);
          currentPanel?.webview.postMessage({
            command: 'saveDesignTreeResponse',
            requestId,
            success: true,
            ...result
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'saveDesignTreeResponse',
            requestId,
            success: false,
            error: String(err)
          });
        }
        return;
      }

      case 'listFlowConfigFiles': {
        const requestId: string = msg.requestId;
        const flow = normalizeConfigFlow(msg.flow);
        try {
          if (!flow) {
            throw new Error('Unsupported flow for config files.');
          }
          const result = await listFlowConfigFiles(flow);
          currentPanel?.webview.postMessage({
            command: 'listFlowConfigFilesResponse',
            requestId,
            success: true,
            ...result
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'listFlowConfigFilesResponse',
            requestId,
            success: false,
            configs: [],
            error: String(err)
          });
        }
        return;
      }

      case 'createFlowConfigFile': {
        const requestId: string = msg.requestId;
        const flow = normalizeConfigFlow(msg.flow);
        const moduleName = typeof msg.moduleName === 'string' ? msg.moduleName : '';
        try {
          if (!flow) {
            throw new Error('Unsupported flow for config files.');
          }
          const config = await createFlowConfigFile(flow, moduleName);
          currentPanel?.webview.postMessage({
            command: 'createFlowConfigFileResponse',
            requestId,
            success: true,
            config
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'createFlowConfigFileResponse',
            requestId,
            success: false,
            error: String(err)
          });
        }
        return;
      }

      case 'duplicateFlowConfigFile': {
        const requestId: string = msg.requestId;
        const flow = normalizeConfigFlow(msg.flow);
        const moduleName = typeof msg.moduleName === 'string' ? msg.moduleName : '';
        try {
          if (!flow) {
            throw new Error('Unsupported flow for config files.');
          }
          const config = await duplicateFlowConfigFile(flow, moduleName);
          currentPanel?.webview.postMessage({
            command: 'duplicateFlowConfigFileResponse',
            requestId,
            success: true,
            config
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'duplicateFlowConfigFileResponse',
            requestId,
            success: false,
            error: String(err)
          });
        }
        return;
      }

      case 'renameFlowConfigFile': {
        const requestId: string = msg.requestId;
        const flow = normalizeConfigFlow(msg.flow);
        const moduleName = typeof msg.moduleName === 'string' ? msg.moduleName : '';
        const nextModuleName = typeof msg.nextModuleName === 'string' ? msg.nextModuleName : '';
        try {
          if (!flow) {
            throw new Error('Unsupported flow for config files.');
          }
          const config = await renameFlowConfigFile(flow, moduleName, nextModuleName);
          currentPanel?.webview.postMessage({
            command: 'renameFlowConfigFileResponse',
            requestId,
            success: true,
            config
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'renameFlowConfigFileResponse',
            requestId,
            success: false,
            error: String(err)
          });
        }
        return;
      }

      case 'deleteFlowConfigFile': {
        const requestId: string = msg.requestId;
        const flow = normalizeConfigFlow(msg.flow);
        const moduleName = typeof msg.moduleName === 'string' ? msg.moduleName : '';
        try {
          if (!flow) {
            throw new Error('Unsupported flow for config files.');
          }
          await deleteFlowConfigFile(flow, moduleName);
          currentPanel?.webview.postMessage({
            command: 'deleteFlowConfigFileResponse',
            requestId,
            success: true
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'deleteFlowConfigFileResponse',
            requestId,
            success: false,
            error: String(err)
          });
        }
        return;
      }

      case 'generateDefaultFlowConfigs': {
        const requestId: string = msg.requestId;
        const flow = normalizeConfigFlow(msg.flow);
        try {
          if (!flow) {
            throw new Error('Unsupported flow for config files.');
          }
          const result = await generateDefaultFlowConfigs(flow);
          currentPanel?.webview.postMessage({
            command: 'generateDefaultFlowConfigsResponse',
            requestId,
            success: true,
            ...result
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'generateDefaultFlowConfigsResponse',
            requestId,
            success: false,
            configs: [],
            created: 0,
            error: String(err)
          });
        }
        return;
      }

      case 'syncCommonArtifacts': {
        const requestId: string = msg.requestId;
        const targetRepo = normalizeProjectRepo(msg.targetRepo);
        const push = Boolean(msg.push);
        const customMsg = typeof msg.message === 'string' ? msg.message.trim() : '';
        const designTree = typeof msg.designTree === 'string' ? msg.designTree.trim() : '';
        const normTable = typeof msg.normTable === 'string' ? msg.normTable.trim() : '';
        try {
          if (!targetRepo) {
            throw new Error('Please choose Hibist or Sailor or Data or Verification repository.');
          }
          const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
          const commitMessage = customMsg || `feat(dft-ide): sync common artifacts to ${targetRepo} [${now}]`;
          const result = await syncCommonArtifactsToRepo(targetRepo, { designTree, normTable }, commitMessage, push);
          currentPanel?.webview.postMessage({
            command: 'syncCommonArtifactsResponse',
            requestId,
            success: true,
            commitMessage,
            files: result.files
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'syncCommonArtifactsResponse',
            requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      case 'prepareCommonArtifactSync': {
        const requestId: string = msg.requestId;
        const targetRepo = normalizeProjectRepo(msg.targetRepo);
        const sourceDesignTree = typeof msg.sourceDesignTree === 'string' ? msg.sourceDesignTree.trim() : '';
        const sourceNormTable = typeof msg.sourceNormTable === 'string' ? msg.sourceNormTable.trim() : '';
        const targetDesignTree = typeof msg.targetDesignTree === 'string' ? msg.targetDesignTree.trim() : '';
        const targetNormTable = typeof msg.targetNormTable === 'string' ? msg.targetNormTable.trim() : '';
        const direction = typeof msg.direction === 'string' ? msg.direction.trim() : 'dataToTarget';

        try {
          if (!targetRepo) {
            throw new Error('Please choose a valid target repository.');
          }
          const result = await prepareCommonArtifactSyncToRepo({
            targetRepo,
            sourceDesignTree,
            sourceNormTable,
            targetDesignTree,
            targetNormTable,
            direction
          });
          currentPanel?.webview.postMessage({
            command: 'prepareCommonArtifactSyncResponse',
            requestId,
            ...result
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'prepareCommonArtifactSyncResponse',
            requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      case 'applyCommonArtifactSync': {
        const requestId: string = msg.requestId;
        const targetRepo = normalizeProjectRepo(msg.targetRepo);
        const strategy = typeof msg.strategy === 'string' ? msg.strategy.trim() : 'overwrite';
        const direction = typeof msg.direction === 'string' ? msg.direction.trim() : 'dataToTarget';
        const sourceDesignTree = typeof msg.sourceDesignTree === 'string' ? msg.sourceDesignTree.trim() : '';
        const sourceNormTable = typeof msg.sourceNormTable === 'string' ? msg.sourceNormTable.trim() : '';
        const targetDesignTree = typeof msg.targetDesignTree === 'string' ? msg.targetDesignTree.trim() : '';
        const targetNormTable = typeof msg.targetNormTable === 'string' ? msg.targetNormTable.trim() : '';
        const decisions = Array.isArray(msg.decisions) ? msg.decisions : [];
        const stageAfterApply = Boolean(msg.stageAfterApply);

        try {
          if (!targetRepo) {
            throw new Error('Please choose a valid target repository.');
          }
          const result = await applyCommonArtifactSyncToRepo({
            targetRepo,
            strategy,
            direction,
            sourceDesignTree,
            sourceNormTable,
            targetDesignTree,
            targetNormTable,
            decisions,
            stageAfterApply
          });
          currentPanel?.webview.postMessage({
            command: 'applyCommonArtifactSyncResponse',
            requestId,
            ...result
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'applyCommonArtifactSyncResponse',
            requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      case 'openVsCodeDiff': {
        const requestId: string = msg.requestId;
        const sourcePath = typeof msg.sourcePath === 'string' ? msg.sourcePath.trim() : '';
        const targetPath = typeof msg.targetPath === 'string' ? msg.targetPath.trim() : '';
        const title = typeof msg.title === 'string' ? msg.title.trim() : 'Diff View';
        try {
          if (!sourcePath || !targetPath) {
            throw new Error('Source path and target path are required for comparing.');
          }
          if (!fs.existsSync(sourcePath)) {
            throw new Error(`来源对比 CSV 文件在磁盘上不存在（${path.basename(sourcePath)}），请在当前页面先执行“确认应用合并决策”来生成。`);
          }
          if (!fs.existsSync(targetPath)) {
            throw new Error(`目标对比 CSV 文件在磁盘上不存在（${path.basename(targetPath)}），请在当前页面先执行“确认应用合并决策”来生成。`);
          }
          await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(sourcePath), vscode.Uri.file(targetPath), title);
          currentPanel?.webview.postMessage({
            command: 'openVsCodeDiffResponse',
            requestId,
            success: true
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'openVsCodeDiffResponse',
            requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      case 'getLocalConfigInfo': {
        const requestId: string = msg.requestId;
        try {
          currentPanel?.webview.postMessage({
            command: 'getLocalConfigInfoResponse',
            requestId,
            ...(await getLocalConfigInfo())
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'getLocalConfigInfoResponse',
            requestId,
            error: String(err)
          });
        }
        return;
      }

      case 'setLocalConfigPath': {
        const requestId: string = msg.requestId;
        const localPath = typeof msg.path === 'string' ? msg.path.trim() : '';
        try {
          await updateLocalConfigPath(localPath);
          currentPanel?.webview.postMessage({
            command: 'setLocalConfigPathResponse',
            requestId,
            success: true,
            ...(await getLocalConfigInfo())
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'setLocalConfigPathResponse',
            requestId,
            success: false,
            error: String(err)
          });
        }
        return;
      }

      case 'enterProjectWorkspace': {
        const requestId: string = msg.requestId;
        const project = msg.project;
        try {
          const projectPath = await initProjectWorkspace(project);
          currentPanel?.webview.postMessage({
            command: 'enterProjectWorkspaceResponse',
            requestId,
            success: true,
            projectPath: projectPath
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'enterProjectWorkspaceResponse',
            requestId,
            success: false,
            error: String(err)
          });
        }
        return;
      }

      case 'syncGit': {
        const requestId: string = msg.requestId;
        const flow    = msg.flow as 'common' | 'hibist' | 'sailor' | 'data' | 'verification';
        const push    = Boolean(msg.push);
        const customMsg = typeof msg.message === 'string' ? msg.message : undefined;
        try {
          const filePath = resolveConfigPath(flow);
          if (!filePath) {
            currentPanel?.webview.postMessage({
              command: 'syncGitResponse', requestId,
              success: false, error: '未找到工作区路径'
            });
            return;
          }
          const fileUri = vscode.Uri.file(filePath);
          const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
          const commitMessage = customMsg ?? `feat(dft-ide): update ${flow} config [${now}]`;

          await gitService.addFiles([fileUri]);
          await gitService.commit(commitMessage);
          if (push) {
            await gitService.push();
          }
          currentPanel?.webview.postMessage({
            command: 'syncGitResponse', requestId,
            success: true, commitMessage
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'syncGitResponse', requestId,
            success: false, error: String(err)
          });
        }
        return;
      }

      // ─── 历史执行记录持久化 ────────────────────────────────
      case 'saveExecutionHistory': {
        const requestId: string = msg.requestId;
        const flow = normalizeHistoryFlow(msg.flow);
        const record = msg.record as Record<string, unknown>;
        try {
          await saveExecutionHistoryRecord(flow, record);

          currentPanel?.webview.postMessage({
            command: 'saveExecutionHistoryResponse', requestId,
            success: true
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'saveExecutionHistoryResponse', requestId,
            success: false, error: String(err)
          });
        }
        return;
      }

      case 'getExecutionHistory': {
        const requestId: string = msg.requestId;
        const flow = normalizeHistoryFlow(msg.flow);
        try {
          const projectRoot = resolveProjectRoot();
          if (!projectRoot) {
            currentPanel?.webview.postMessage({
              command: 'getExecutionHistoryResponse', requestId,
              success: true, history: []
            });
            return;
          }
          const historyDir = path.join(projectRoot, '.dft-ide', 'local-state', 'history', flow);
          let history: Record<string, unknown>[] = [];
          try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(historyDir));
            const jsonFiles = entries
              .filter(e => e[1] === vscode.FileType.File && e[0].endsWith('.json'))
              .map(e => e[0]);

            for (const name of jsonFiles) {
              const raw = await vscode.workspace.fs.readFile(
                vscode.Uri.file(path.join(historyDir, name))
              );
              try {
                history.push(JSON.parse(Buffer.from(raw).toString('utf-8')));
              } catch { /* skip malformed */ }
            }
            history.sort((a: any, b: any) => (b.executedAt ?? 0) - (a.executedAt ?? 0));
          } catch {
            // The history directory may not exist yet.
          }

          currentPanel?.webview.postMessage({
            command: 'getExecutionHistoryResponse', requestId,
            success: true, history: history.slice(0, 500)
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'getExecutionHistoryResponse', requestId,
            success: false, error: String(err)
          });
        }
        return;
      }

      case 'openGitlabHost': {
        const requestId: string = msg.requestId;
        const repoGitName = normalizeHistoryFlow(msg.repoGitName);
        const config = vscode.workspace.getConfiguration('dftIde');
        const gitlabHost = config.get<string>('gitlabHost', GITLAB_HOST).replace(/\/+$/, '');

        try {
          const targetUrl = vscode.Uri.parse(`${gitlabHost}/${repoGitName}`);
          const success = await vscode.env.openExternal(targetUrl);
          currentPanel?.webview.postMessage({
            command: 'openGitlabHostResponse',
            requestId,
            success,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'openGitlabHostResponse',
            requestId,
            success: false,
            error: String(err),
          });
        }
        return;
      }

      default:
        return;
    }
  });
}

// ============================================================
// createProject
// ============================================================
async function openProjectFromPicker(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: false,
    canSelectFolders: true,
    openLabel: '打开项目'
  });

  if (!picked || picked.length === 0) {
    return;
  }

  await openProjectWorkspace(picked[0].fsPath);
}

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

  const legacyRoot = vscode.Uri.joinPath(projectRoot, 'data');
  const hibistRoot = vscode.Uri.joinPath(projectRoot, 'hibist');
  const sailorRoot = vscode.Uri.joinPath(projectRoot, 'sailor');
  const verificationRoot = vscode.Uri.joinPath(projectRoot, 'verification');
  const dataRoot = vscode.Uri.joinPath(projectRoot, 'data');

  await vscode.workspace.fs.createDirectory(projectRoot);
  await vscode.workspace.fs.createDirectory(legacyRoot);
  await vscode.workspace.fs.createDirectory(hibistRoot);
  await vscode.workspace.fs.createDirectory(sailorRoot);
  await vscode.workspace.fs.createDirectory(verificationRoot);
  await vscode.workspace.fs.createDirectory(dataRoot);

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(legacyRoot, 'README.md'),
    Buffer.from('# DFT IDE Data Workspace\n')
  );

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(hibistRoot, 'hibist.cfg.json'),
    Buffer.from(JSON.stringify({ tool: 'hibist', stage: '85' }, null, 2))
  );

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(sailorRoot, 'sailor.cfg.json'),
    Buffer.from(JSON.stringify({ tool: 'sailor', stage: '85' }, null, 2))
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
      { name: 'hibist', path: 'hibist' },
      { name: 'sailor', path: 'sailor' },
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
        ['Common 配置', 'Hibist 工作流', 'Sailor 工作流', 'Verification 工作流'],
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

async function openObsReadonlyDocument(
  context: vscode.ExtensionContext,
  obsPath: string
): Promise<void> {
  if (!obsPath.startsWith('obs://')) {
    throw new Error('Invalid OBS path.');
  }

  const fileName = decodeURIComponent(obsPath.split('/').pop() || 'obs-object.txt');
  const safeFileName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || 'obs-object.txt';
  const cacheDir = vscode.Uri.joinPath(context.globalStorageUri, 'obs-cache');
  await vscode.workspace.fs.createDirectory(cacheDir);

  const cacheUri = vscode.Uri.joinPath(cacheDir, safeFileName);
  const content = [
    `OBS readonly preview`,
    ``,
    `Source: ${obsPath}`,
    `Cached: ${cacheUri.fsPath}`,
    `Mode: read-only`,
    ``,
    `This mock represents an OBS object that was downloaded to a local cache before opening.`,
    `Direct edits are disabled for OBS files in the current workflow.`,
    ``,
  ].join('\n');
  await vscode.workspace.fs.writeFile(cacheUri, Buffer.from(content, 'utf-8'));

  const readonlyUri = vscode.Uri.from({
    scheme: OBS_READONLY_SCHEME,
    path: `/${safeFileName}`,
    query: `source=${encodeURIComponent(obsPath)}&cache=${encodeURIComponent(cacheUri.fsPath)}`,
  });
  obsReadonlyDocuments.set(readonlyUri.toString(), content);

  const document = await vscode.workspace.openTextDocument(readonlyUri);
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.Active,
    preview: false,
  });
}

async function cleanupObsReadonlyDocument(uri: vscode.Uri): Promise<void> {
  obsReadonlyDocuments.delete(uri.toString());

  const cachePath = new URLSearchParams(uri.query).get('cache');
  if (!cachePath) {
    return;
  }

  try {
    await vscode.workspace.fs.delete(vscode.Uri.file(cachePath));
  } catch {
    // Cache cleanup is best-effort; the file may have already been removed.
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
  const apiBase =
    process.env.DFT_IDE_API_BASE ??
    vscode.workspace.getConfiguration('dftIde').get<string>('apiBase', '');

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

// ============================================================
// 配置文件路径解析 & 合并写入工具
// ============================================================

/**
 * Resolve a page-state file from a stable page key.
 *
 * Page layouts can change freely; the extension only owns the storage root.
 * Each page/flow persists into one JSON file under the configured local
 * state directory.
 */
function resolveConfigPath(flow: string): string | undefined {
  const dirPath = resolveLocalConfigDirectory();
  if (!dirPath) {
    return undefined;
  }
  const segments = flow.split(/[\\/]+/).map(toConfigPathSegment).filter(Boolean);
  if (segments.length === 0) {
    return path.join(dirPath, 'default.json');
  }
  const fileName = `${segments[segments.length - 1]}.json`;
  return path.join(dirPath, ...segments.slice(0, -1), fileName);
}

function toConfigPathSegment(flow: string): string {
  const normalized = flow.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'default';
}

function resolveLocalConfigDirectory(): string | undefined {
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    return undefined;
  }

  return path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR);
}

function resolveProjectRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  const expectedRoots = [...PROJECT_REPOS];
  const matched = expectedRoots
    .map((name) => folders.find((folder) => folder.name.toLowerCase() === name))
    .filter((folder): folder is vscode.WorkspaceFolder => Boolean(folder));
  const parents = new Set(matched.map((folder) => path.dirname(folder.uri.fsPath)));
  if (matched.length >= 2 && parents.size === 1) {
    return [...parents][0];
  }

  return path.dirname(folders[0].uri.fsPath);
}

function resolveExecutionCwd(title: string, command: string): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  const flow = inferDftFlow(title, command);
  const preferredName = flow === 'verification' ? 'verification' : flow;
  const preferredFolder = folders.find((folder) => folder.name.toLowerCase() === preferredName);
  if (preferredFolder) {
    return preferredFolder.uri.fsPath;
  }

  return resolveProjectRoot() ?? folders[0].uri.fsPath;
}

async function openExecutionTerminal(options: {
  title?: string;
  command?: string;
  cwd?: string;
}): Promise<void> {
  const title = typeof options.title === 'string' && options.title.trim()
    ? options.title.trim()
    : 'DFT IDE Task';
  const command = typeof options.command === 'string' ? options.command.trim() : '';
  const requestedCwd = typeof options.cwd === 'string' && options.cwd.trim() ? options.cwd.trim() : undefined;
  const terminalCwd = requestedCwd ?? resolveExecutionCwd(title, command);
  const terminal = vscode.window.createTerminal({
    name: title,
    cwd: terminalCwd,
  });

  terminal.show();
  if (command) {
    terminal.sendText(command);
  }

  vscode.window.showInformationMessage(`DFT IDE terminal opened: ${title}`);
  void runDftLogDiagnosticsDemo(title, command).catch((error) => {
    vscode.window.showWarningMessage(
      `DFT IDE log diagnostics demo failed: ${error instanceof Error ? error.message : String(error)}`
    );
  });
}

function normalizeHistoryFlow(flow: unknown): string {
  const value = typeof flow === 'string' ? flow : 'default';
  return /^[a-z0-9_-]+$/i.test(value) ? value : 'default';
}

async function saveExecutionHistoryRecord(
  flow: unknown,
  record: Record<string, unknown> | PipelineRuntimeHistoryRecord,
): Promise<void> {
  const normalizedFlow = normalizeHistoryFlow(flow);
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    throw new Error('未找到项目根目录');
  }

  const historyDir = path.join(projectRoot, '.dft-ide', 'local-state', 'history', normalizedFlow);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(historyDir));
  await ensureLocalStateIgnored(projectRoot, path.join(projectRoot, '.dft-ide', 'local-state'));

  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(historyDir));
  const jsonFiles = entries
    .filter(e => e[1] === vscode.FileType.File && e[0].endsWith('.json'))
    .map(e => e[0])
    .sort();
  if (jsonFiles.length >= 500) {
    const toDelete = jsonFiles.slice(0, jsonFiles.length - 499);
    for (const name of toDelete) {
      await vscode.workspace.fs.delete(vscode.Uri.file(path.join(historyDir, name)));
    }
  }

  const id = `exec_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const fullRecord = { ...record, flow: normalizedFlow, id, executedAt: Date.now() };
  const filePath = path.join(historyDir, `${id}.json`);
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(filePath),
    Buffer.from(JSON.stringify(fullRecord, null, 2))
  );
}

type DftFlowKind = 'hibist' | 'sailor' | 'verification';

interface DftDiagnosticParseOptions {
  flow: DftFlowKind;
  tool: 'hibist' | 'sailor' | 'lander' | 'unknown';
}

interface DftDiagnosticParseResult {
  logPath: string;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  totalCount: number;
}

interface ParsedDftLogIssue {
  severity: vscode.DiagnosticSeverity;
  severityLabel: string;
  filePath?: string;
  line?: number;
  column?: number;
  message: string;
  logLine: number;
}

async function runDftLogDiagnosticsDemo(
  title: string,
  command: string
): Promise<DftDiagnosticParseResult | undefined> {
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    return undefined;
  }

  const flow = inferDftFlow(title, command);
  const tool = inferDftTool(title, command, flow);
  const logPath = await writeDftDiagnosticsDemoFiles(projectRoot, flow, tool);
  const result = await parseDftExecutionLog(logPath, { flow, tool });

  void vscode.commands.executeCommand('workbench.actions.view.problems');
  vscode.window.showInformationMessage(
    `DFT IDE parsed demo ${tool}.log: ${result.errorCount} errors, ${result.warningCount} warnings.`
  );

  return result;
}

async function parseDftExecutionLog(
  logPath: string,
  options: DftDiagnosticParseOptions
): Promise<DftDiagnosticParseResult> {
  const logUri = vscode.Uri.file(logPath);
  const raw = await vscode.workspace.fs.readFile(logUri);
  const content = Buffer.from(raw).toString('utf-8');
  const issues = parseDftLogContent(content);
  const diagnosticsByFile = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();

  dftDiagnostics.clear();

  for (const issue of issues) {
    const targetUri = await resolveDiagnosticTargetUri(issue, logUri);
    const range = createDiagnosticRange(issue, targetUri.toString() === logUri.toString() ? issue.logLine : undefined);
    const diagnostic = new vscode.Diagnostic(
      range,
      `[${options.tool}/${options.flow}] ${issue.message}`,
      issue.severity
    );
    diagnostic.source = 'DFT IDE';
    diagnostic.code = options.tool;
    diagnostic.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(logUri, new vscode.Position(Math.max(issue.logLine - 1, 0), 0)),
        `Parsed from ${path.basename(logPath)} line ${issue.logLine}`
      ),
    ];

    const key = targetUri.toString();
    const bucket = diagnosticsByFile.get(key) ?? { uri: targetUri, diagnostics: [] };
    bucket.diagnostics.push(diagnostic);
    diagnosticsByFile.set(key, bucket);
  }

  for (const bucket of diagnosticsByFile.values()) {
    dftDiagnostics.set(bucket.uri, bucket.diagnostics);
  }

  const errorCount = issues.filter((issue) => issue.severity === vscode.DiagnosticSeverity.Error).length;
  const warningCount = issues.filter((issue) => issue.severity === vscode.DiagnosticSeverity.Warning).length;
  const infoCount = issues.filter((issue) => issue.severity === vscode.DiagnosticSeverity.Information).length;

  return {
    logPath,
    errorCount,
    warningCount,
    infoCount,
    totalCount: issues.length,
  };
}

function parseDftLogContent(content: string): ParsedDftLogIssue[] {
  const lines = content.split(/\r?\n/);
  const issues: ParsedDftLogIssue[] = [];

  lines.forEach((line, index) => {
    const parsed = parseDftLogLine(line, index + 1);
    if (parsed) {
      issues.push(parsed);
    }
  });

  return issues;
}

function parseDftLogLine(line: string, logLine: number): ParsedDftLogIssue | undefined {
  const bracketMatch = line.match(
    /\b(Error|Warning)-\[[^\]]+\]\s+(?:(.+?):(\d+)(?::(\d+))?\s*[:\-]\s*)?(.+)$/i
  );
  if (bracketMatch) {
    return {
      severity: toDiagnosticSeverity(bracketMatch[1]),
      severityLabel: bracketMatch[1].toUpperCase(),
      filePath: bracketMatch[2]?.trim(),
      line: bracketMatch[3] ? Number(bracketMatch[3]) : undefined,
      column: bracketMatch[4] ? Number(bracketMatch[4]) : undefined,
      message: bracketMatch[5].trim(),
      logLine,
    };
  }

  const genericMatch = line.match(
    /\b(ERROR|WARNING|WARN)\b[:\s-]*(?:(.+?):(\d+)(?::(\d+))?\s*[:\-]\s*)?(.+)$/i
  );
  if (genericMatch) {
    return {
      severity: toDiagnosticSeverity(genericMatch[1]),
      severityLabel: genericMatch[1].toUpperCase(),
      filePath: genericMatch[2]?.trim(),
      line: genericMatch[3] ? Number(genericMatch[3]) : undefined,
      column: genericMatch[4] ? Number(genericMatch[4]) : undefined,
      message: genericMatch[5].trim(),
      logLine,
    };
  }

  return undefined;
}

function toDiagnosticSeverity(label: string): vscode.DiagnosticSeverity {
  const normalized = label.toLowerCase();
  if (normalized === 'error') {
    return vscode.DiagnosticSeverity.Error;
  }
  if (normalized === 'warning' || normalized === 'warn') {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}

async function resolveDiagnosticTargetUri(
  issue: ParsedDftLogIssue,
  logUri: vscode.Uri
): Promise<vscode.Uri> {
  if (!issue.filePath) {
    return logUri;
  }

  const filePath = path.isAbsolute(issue.filePath)
    ? issue.filePath
    : path.resolve(path.dirname(logUri.fsPath), issue.filePath);
  const uri = vscode.Uri.file(filePath);

  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.type === vscode.FileType.File ? uri : logUri;
  } catch {
    return logUri;
  }
}

function createDiagnosticRange(issue: ParsedDftLogIssue, fallbackLine?: number): vscode.Range {
  const line = Math.max((issue.line ?? fallbackLine ?? 1) - 1, 0);
  const column = Math.max((issue.column ?? 1) - 1, 0);
  return new vscode.Range(line, column, line, column + 1);
}

async function writeDftDiagnosticsDemoFiles(
  projectRoot: string,
  flow: DftFlowKind,
  tool: DftDiagnosticParseOptions['tool']
): Promise<string> {
  const demoDir = path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR, 'demo-logs', flow);
  const sourceDir = path.join(demoDir, 'sources');
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(sourceDir));
  await ensureLocalStateIgnored(projectRoot, path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR));

  if (flow === 'hibist') {
    const rtlPath = path.join(sourceDir, 'top.v');
    const tclPath = path.join(sourceDir, 'dft_constraints.tcl');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(rtlPath), Buffer.from(createDemoSource(60, 42, 'assign scan_out = missing_port;'), 'utf-8'));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(tclPath), Buffer.from(createDemoSource(30, 18, 'set_dft_signal -type ScanEnable scan_en'), 'utf-8'));
    const logPath = path.join(demoDir, `${tool}.log`);
    const log = [
      `[INFO] ${tool} design flow started`,
      `ERROR: ${rtlPath}:42:20: port missing_port was not found in the current design`,
      `WARNING: ${tclPath}:18:5: scan enable constraint did not match any port`,
      'INFO: report summary written to ./reports/dft_summary.rpt',
      '',
    ].join('\n');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(logPath), Buffer.from(log, 'utf-8'));
    return logPath;
  }

  const tbPath = path.join(sourceDir, 'scan_tb.sv');
  const casePath = path.join(sourceDir, 'smoke_test.yaml');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(tbPath), Buffer.from(createDemoSource(80, 57, 'uvm_error("SCAN", "signature mismatch")'), 'utf-8'));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(casePath), Buffer.from(createDemoSource(25, 9, 'pattern: stuck_at_demo'), 'utf-8'));
  const logPath = path.join(demoDir, 'lander.log');
  const log = [
    '[INFO] lander verification flow started',
    `Error-[DFT-1024] ${tbPath}:57:3: scan chain signature mismatched expected value`,
    `WARNING: ${casePath}:9:1: testcase uses a deprecated pattern option`,
    'INFO: waveform generated at ./waves/demo.fsdb',
    '',
  ].join('\n');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(logPath), Buffer.from(log, 'utf-8'));
  return logPath;
}

function createDemoSource(lineCount: number, specialLine: number, specialText: string): string {
  const lines: string[] = [];
  for (let index = 1; index <= lineCount; index++) {
    lines.push(index === specialLine ? specialText : `// demo source line ${index}`);
  }
  return `${lines.join('\n')}\n`;
}

function inferDftFlow(title: string, command: string): DftFlowKind {
  const value = `${title} ${command}`.toLowerCase();
  return value.includes('verification') || value.includes('sim') || value.includes('plan')
    ? 'verification'
    : 'hibist';
}

function inferDftTool(
  title: string,
  command: string,
  flow: DftFlowKind
): DftDiagnosticParseOptions['tool'] {
  const value = `${title} ${command}`.toLowerCase();
  if (value.includes('hibist')) {
    return 'hibist';
  }
  if (value.includes('sailor')) {
    return 'sailor';
  }
  if (value.includes('lander')) {
    return 'lander';
  }
  return flow === 'verification' ? 'lander' : 'sailor';
}

function resolveDefaultProjectName(): string | undefined {
  const projectRoot = resolveProjectRoot();
  if (projectRoot) {
    return path.basename(projectRoot);
  }

  const workspaceName = vscode.workspace.name?.trim();
  return workspaceName || undefined;
}

function toProjectStateDirectoryName(projectRoot: string): string {
  const normalizedRoot = path.resolve(projectRoot);
  const basename = path.basename(normalizedRoot).trim() || 'project';
  const safeName = basename.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${safeName}-${hashString(normalizedRoot.toLowerCase())}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function openProjectWorkspace(rootPath: string): Promise<{ opened: boolean; targetPath: string; alreadyOpen: boolean }> {
  const targetUri = await resolveProjectWorkspaceUri(rootPath);
  const targetRoot = targetUri.fsPath.toLowerCase().endsWith('.code-workspace')
    ? path.dirname(targetUri.fsPath)
    : targetUri.fsPath;

  if (isProjectCurrentlyOpen(targetRoot)) {
    await vscode.commands.executeCommand('dftIde.openFlow', 'Common');
    return {
      opened: false,
      targetPath: targetUri.fsPath,
      alreadyOpen: true,
    };
  }

  await vscode.commands.executeCommand('vscode.openFolder', targetUri, false);
  return {
    opened: true,
    targetPath: targetUri.fsPath,
    alreadyOpen: false,
  };
}

async function resolveProjectWorkspaceUri(rootPath: string): Promise<vscode.Uri> {
  const normalized = path.resolve(rootPath);
  const uri = vscode.Uri.file(normalized);

  if (normalized.toLowerCase().endsWith('.code-workspace')) {
    await vscode.workspace.fs.stat(uri);
    return uri;
  }

  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.type !== vscode.FileType.Directory) {
    throw new Error(`Project path is not a directory: ${rootPath}`);
  }

  const workspaceUri = vscode.Uri.file(path.join(normalized, 'dft-ide.code-workspace'));
  try {
    await vscode.workspace.fs.stat(workspaceUri);
    return workspaceUri;
  } catch {
    return uri;
  }
}

function isProjectCurrentlyOpen(projectRoot: string): boolean {
  const currentRoot = resolveProjectRoot();
  if (!currentRoot) {
    return false;
  }

  return normalizeFsPath(currentRoot) === normalizeFsPath(projectRoot);
}

function normalizeFsPath(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

async function getLocalConfigInfo(): Promise<{
  configuredPath: string;
  effectivePath: string | null;
  defaultPath: string | null;
  isDefault: boolean;
  lastSelectedProject?: string;
}> {
  const configuredPath = vscode.workspace.getConfiguration('dftIde').get<string>('localProjectsRoot', '').trim();
  const projectRoot = resolveProjectRoot();
  const defaultPath = projectRoot ? path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR) : null;
  const effectivePath = resolveLocalConfigDirectory() ?? null;
  const lastSelectedProject = vscode.workspace.getConfiguration('dftIde').get<string>('lastSelectedProject', '').trim();

  if (effectivePath) {
    await ensureLocalConfigDirectory(effectivePath);
  }
  if (projectRoot) {
    await ensureLocalStateIgnored(projectRoot, effectivePath ?? undefined);
  }

  return {
    configuredPath,
    effectivePath,
    defaultPath,
    isDefault: !configuredPath,
    lastSelectedProject,
  };
}

async function updateLocalConfigPath(localPath: string): Promise<void> {
  await vscode.workspace.getConfiguration('dftIde').update(
    'localProjectsRoot',
    localPath || undefined,
    vscode.ConfigurationTarget.Global
  );

  const effectivePath = resolveLocalConfigDirectory();
  if (effectivePath) {
    await ensureLocalConfigDirectory(effectivePath);
  }

  const projectRoot = resolveProjectRoot();
  if (projectRoot) {
    await ensureLocalStateIgnored(projectRoot, effectivePath ?? undefined);
  }
}

async function initProjectWorkspace(project:DftProject): Promise<string> {
  const projectLocalRoot = project.rootPath.trim();
  if (!projectLocalRoot) {
    throw new Error('Please set the project local root before entering a project.');
  }

  await vscode.workspace.getConfiguration('dftIde').update(
    'lastSelectedProject',
    project.id,
    vscode.ConfigurationTarget.Global
  );

  const projectName = project.name;
  const projectDirName = toSafeProjectDirectoryName(project.name);
  const projectPath = path.join(path.resolve(projectLocalRoot), projectDirName);
  const projectRoot = vscode.Uri.file(projectPath);
  await vscode.workspace.fs.createDirectory(projectRoot);

  const repoProjectPrefix = toGitLabProjectPrefix(projectName);
  const repos: Array<{ key: string; gitlabProjectName: string; localPath: string }> = [];
  const folders: Array<{ name: string; path: string }> = [];
  for (const repo of PROJECT_REPOS) {
    const repoItem = project.repos.find((item) => item.key === repo);
    if (!repoItem) continue;
    const repoUri = vscode.Uri.joinPath(projectRoot, repoItem.gitlabProjectName);
    try {
      await vscode.workspace.fs.stat(repoUri);
    } catch (error) {
      // Use the git CLI directly so cloning stays in the current VS Code window.
      if (!repoItem.http_url_to_repo) {
        throw new Error(`Missing clone URL for ${repoItem.gitlabProjectName}.`);
      }
      await executeFileCommand('git', ['clone', repoItem.http_url_to_repo], projectPath);
    }
    await writeFileIfMissing(
      vscode.Uri.joinPath(repoUri, 'README.md'),
      `# ${repoProjectPrefix}_${repo}\n\nLocal placeholder for the GitLab repository \`${repoProjectPrefix}_${repo}\`.\n`
    );
    repos.push({
      key: repo,
      gitlabProjectName: repoItem.gitlabProjectName,
      localPath: repoUri.fsPath,
    });
    folders.push({
      name: repo,
      path: repoItem.gitlabProjectName,
    });
  }

  const localStateUri = vscode.Uri.joinPath(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR);
  await vscode.workspace.fs.createDirectory(localStateUri);
  await writeDefaultLocalState(localStateUri, repos);

  await ensureLocalStateIgnored(projectRoot.fsPath, localStateUri.fsPath);

  const workspaceFile = vscode.Uri.joinPath(projectRoot, 'dft-ide.code-workspace');
  const workspaceContent = {
    folders: folders,
    settings: {
      'workbench.startupEditor': 'none'
    }
  };
  await writeFileIfMissing(workspaceFile, JSON.stringify(workspaceContent, null, 2));

  return projectPath;
}

async function writeDefaultLocalState(localStateUri: vscode.Uri, repos: {
  key: string,
  gitlabProjectName: string,
  localPath: string,
}[]) {
  for (const repo of repos) {
    if (repo.key === 'data') continue;

    const stateUri = vscode.Uri.joinPath(localStateUri, repo.key + '.json');
    let content = '{}';
    try {
      const bytes = await vscode.workspace.fs.readFile(stateUri);
      content = Buffer.from(bytes).toString('utf-8');
    } catch {
      content = '{}';
    }
    const stateObject = JSON.parse(content);

    if (!stateObject.project) {
      const cshrcFilePath = path.join(repo.localPath, 'project.cshrc');
      const isExists = await pathExists(cshrcFilePath);
      if (isExists) stateObject.project = cshrcFilePath;
    }
    if (!stateObject.sailorCfg) {
      const cfgFilePath = path.join(repo.localPath, 'common.cfg');
      const isExists = await pathExists(cfgFilePath);
      if (isExists) stateObject.sailorCfg = cfgFilePath;
    }

    await writeFileIfMissing(stateUri, JSON.stringify(stateObject, null, 2));
  }
}

async function prepareProjectWorkspace(
  projectName: string,
  projectKey: string
): Promise<{ rootPath: string; workspacePath: string; repos: Array<{ key: string; gitlabProjectName: string; localPath: string }> }> {
  const localProjectsRoot = vscode.workspace.getConfiguration('dftIde').get<string>('localProjectsRoot', '').trim();
  if (!localProjectsRoot) {
    throw new Error('Please set the local projects root before preparing a project.');
  }

  const projectDirName = toSafeProjectDirectoryName(projectKey || projectName);
  const projectRoot = vscode.Uri.file(path.join(path.resolve(localProjectsRoot), projectDirName));
  await vscode.workspace.fs.createDirectory(projectRoot);

  const repoProjectPrefix = toGitLabProjectPrefix(projectName);
  const repos: Array<{ key: string; gitlabProjectName: string; localPath: string }> = [];
  for (const repo of PROJECT_REPOS) {
    const repoUri = vscode.Uri.joinPath(projectRoot, repo);
    await vscode.workspace.fs.createDirectory(repoUri);
    await writeFileIfMissing(
      vscode.Uri.joinPath(repoUri, 'README.md'),
      `# ${repoProjectPrefix}_${repo}\n\nLocal placeholder for the GitLab repository \`${repoProjectPrefix}_${repo}\`.\n`
    );
    repos.push({
      key: repo,
      gitlabProjectName: `${repoProjectPrefix}_${repo}`,
      localPath: repoUri.fsPath,
    });
  }

  const localStateUri = vscode.Uri.joinPath(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR);
  await vscode.workspace.fs.createDirectory(localStateUri);
  await ensureLocalStateIgnored(projectRoot.fsPath, localStateUri.fsPath);

  const workspaceFile = vscode.Uri.joinPath(projectRoot, 'dft-ide.code-workspace');
  const workspaceContent = {
    folders: PROJECT_REPOS.map((repo) => ({ name: repo, path: repo })),
    settings: {
      'workbench.startupEditor': 'none'
    }
  };
  await vscode.workspace.fs.writeFile(workspaceFile, Buffer.from(JSON.stringify(workspaceContent, null, 2)));

  vscode.window.showInformationMessage(`DFT IDE 项目初始化完成：${projectName}`);

  return {
    rootPath: projectRoot.fsPath,
    workspacePath: workspaceFile.fsPath,
    repos,
  };
}

async function writeFileIfMissing(uri: vscode.Uri, content: string): Promise<void> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
  }
}

function toSafeProjectDirectoryName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dft-project';
}

function toGitLabProjectPrefix(value: string): string {
  return value.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dft-project';
}

async function ensureLocalConfigDirectory(dirPath: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
}

async function ensureLocalStateIgnored(projectRoot: string, effectivePath?: string): Promise<void> {
  const ignoreEntries = new Set<string>([`${LOCAL_STATE_DIR_NAME}/`]);
  if (effectivePath) {
    const relative = path.relative(projectRoot, effectivePath).replace(/\\/g, '/');
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      ignoreEntries.add(relative.endsWith('/') ? relative : `${relative}/`);
    }
  }

  const gitignoreUri = vscode.Uri.file(path.join(projectRoot, '.gitignore'));
  let content = '';
  try {
    const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
    content = Buffer.from(bytes).toString('utf-8');
  } catch {
    content = '';
  }

  const lines = new Set(content.split(/\r?\n/).map((line) => line.trim()));
  const missing = [...ignoreEntries].filter((entry) => !lines.has(entry));
  if (missing.length === 0) {
    return;
  }

  const prefix = content && !content.endsWith('\n') ? '\n' : '';
  const nextContent = `${content}${prefix}\n# DFT IDE local user state\n${missing.join('\n')}\n`;
  await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(nextContent, 'utf-8'));
}

/**
 * 读取已存在的配置文件，与新数据深合并后返回合并结果。
 * 这样做可以保证同一文件中来自不同 Step 的字段互不覆盖。
 *
 * 例如：Step1 保存了 { project, commonPath }
 *       Step2 保存了 { step2Task, step2Design }
 *       最终文件中两部分都会保留。
 */
async function mergeConfigFile(
  filePath: string,
  newData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const existing = JSON.parse(Buffer.from(bytes).toString('utf-8')) as Record<string, unknown>;
    return { ...existing, ...newData };
  } catch {
    // 文件不存在（首次保存）或解析失败，直接使用新数据
    return newData;
  }
}

async function readDesignTreeState(flow?: string): Promise<Record<string, unknown> | null> {
  const commonPath = resolveConfigPath('common');
  if (!commonPath) {
    return null;
  }

  const common = await readJsonFile(commonPath);
  const syncedDesignTreePath = getSyncedArtifactPath(common, flow, 'designTree');
  if (syncedDesignTreePath) {
    const fileData = await readJsonFile(syncedDesignTreePath);
    if (fileData) {
      return {
        ...fileData,
        sourcePath: syncedDesignTreePath,
        sourceMode: 'repoDesignTreeFile'
      };
    }
  }

  const designTreeFilePath = resolveDesignTreeFilePath(common);
  if (designTreeFilePath) {
    const fileData = await readJsonFile(designTreeFilePath);
    if (fileData) {
      return {
        ...fileData,
        sourcePath: designTreeFilePath,
        sourceMode: 'designTreeFile'
      };
    }
  }

  const draft = common?.designTreeDraft;
  return isRecord(draft) ? { ...draft, sourceMode: 'commonMock' } : null;
}

async function saveDesignTreeState(
  flow: string,
  data: Record<string, unknown>
): Promise<{ filePath: string; mode: string }> {
  const commonPath = resolveConfigPath('common');
  if (!commonPath) {
    throw new Error('Workspace local-state path is not available.');
  }

  await ensureLocalConfigDirectory(path.dirname(commonPath));
  const common = await readJsonFile(commonPath);
  const syncedDesignTreePath = getSyncedArtifactPath(common, flow, 'designTree');
  const designTreeFilePath = syncedDesignTreePath ?? resolveDesignTreeFilePath(common);
  const encoded = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');

  if (designTreeFilePath) {
    await ensureLocalConfigDirectory(path.dirname(designTreeFilePath));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(designTreeFilePath), encoded);
    await updateModuleConfigSkeleton(flow, data);
    return {
      filePath: vscode.workspace.asRelativePath(designTreeFilePath),
      mode: 'designTreeFile'
    };
  }

  const mergedCommon = await mergeConfigFile(commonPath, {
    designTreeDraft: data,
    designTreeUpdatedAt: new Date().toISOString()
  });
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(commonPath),
    Buffer.from(JSON.stringify(mergedCommon, null, 2), 'utf-8')
  );
  await updateModuleConfigSkeleton(flow, data);
  return {
    filePath: vscode.workspace.asRelativePath(commonPath),
    mode: 'commonMock'
  };
}

async function updateModuleConfigSkeleton(flow: string, treeState: Record<string, unknown>): Promise<void> {
  const flowPath = resolveConfigPath(flow);
  if (!flowPath) {
    return;
  }

  await ensureLocalConfigDirectory(path.dirname(flowPath));
  const existing = await readJsonFile(flowPath) ?? {};
  const { moduleConfigs: _legacyModuleConfigs, ...flowState } = existing;
  const modules = collectDesignTreeModules(treeState.nodes);

  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(flowPath),
    Buffer.from(JSON.stringify({
      ...flowState,
      activeModuleKey: typeof existing.activeModuleKey === 'string' ? existing.activeModuleKey : modules[0]?.key,
      modules: modules.map((module) => ({
        key: module.key,
        title: module.title,
        type: module.type
      }))
    }, null, 2), 'utf-8')
  );

  for (const module of modules) {
    const modulePath = resolveConfigPath(`${flow}/${module.key}/config`);
    if (!modulePath) {
      continue;
    }
    await ensureLocalConfigDirectory(path.dirname(modulePath));
    const previous = await readJsonFile(modulePath) ?? {};
    const merged = {
      ...previous,
      moduleKey: module.key,
      title: module.title,
      type: module.type,
      updatedFromDesignTreeAt: new Date().toISOString()
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(modulePath),
      Buffer.from(JSON.stringify(merged, null, 2), 'utf-8')
    );
  }
}

function resolveDesignTreeFilePath(common: Record<string, unknown> | null): string | undefined {
  const rawPath = typeof common?.designTree === 'string' ? common.designTree.trim() : '';
  if (!rawPath) {
    return undefined;
  }

  const projectRoot = resolveProjectRoot();
  const resolved = path.isAbsolute(rawPath)
    ? rawPath
    : projectRoot ? path.resolve(projectRoot, rawPath) : undefined;

  if (!resolved) {
    return undefined;
  }

  return path.extname(resolved) ? resolved : path.join(resolved, 'design_tree.mock.json');
}

function getSyncedArtifactPath(
  common: Record<string, unknown> | null,
  flow: string | undefined,
  key: 'designTree' | 'normTable'
): string | undefined {
  const normalizedFlow = normalizeProjectRepo(flow);
  if (!normalizedFlow || !common) {
    return undefined;
  }

  const syncedArtifacts = common.syncedArtifacts;
  if (!isRecord(syncedArtifacts)) {
    return undefined;
  }

  const flowArtifacts = syncedArtifacts[normalizedFlow];
  if (!isRecord(flowArtifacts)) {
    return undefined;
  }

  const value = flowArtifacts[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeProjectRepo(value: unknown): 'hibist' | 'sailor' | 'data' | 'verification' |  undefined {
  return value === 'hibist' || value === 'sailor' || value === 'data' || value === 'verification' ? value : undefined;
}

function normalizeConfigFlow(value: unknown): 'hibist' | 'sailor' | 'verification' | undefined {
  return value === 'hibist' || value === 'sailor' || value === 'verification' ? value : undefined;
}

interface FlowConfigFileInfo {
  key: string;
  moduleName: string;
  fileName: string;
  filePath: string;
  updatedAt?: number;
  size?: number;
}

function getProjectRepoRoot(repo: 'hibist' | 'sailor' | 'data' | 'verification' ): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const matchedFolder = folders.find((folder) => isRepoFolderName(folder.name, repo));
  if (matchedFolder) {
    return matchedFolder.uri.fsPath;
  }

  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    throw new Error('No DFT project workspace is open.');
  }

  return path.join(projectRoot, repo);
}

async function getFlowConfigsDirectory(flow: 'hibist' | 'sailor' | 'verification'): Promise<string> {
  const repoRoot = await resolveProjectRepoRoot(flow);
  return path.join(repoRoot, 'configs');
}

async function resolveProjectRepoRoot(repo: 'hibist' | 'sailor' | 'data' | 'verification'): Promise<string> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const matchedFolder = folders.find((folder) => isRepoFolderName(folder.name, repo));
  if (matchedFolder) {
    return matchedFolder.uri.fsPath;
  }

  const projectRoot = resolveProjectRoot();
  if (projectRoot) {
    const siblingRepo = await findSiblingRepoDirectory(projectRoot, repo);
    if (siblingRepo) {
      return siblingRepo;
    }
    const direct = path.join(projectRoot, repo);
    if (await pathExists(direct)) {
      return direct;
    }
    const bySuffix = await findRepoDirectory(projectRoot, repo);
    if (bySuffix) {
      return bySuffix;
    }
  }

  const localProjectsRoot = vscode.workspace.getConfiguration('dftIde').get<string>('localProjectsRoot', '').trim();
  if (localProjectsRoot) {
    const projectId = vscode.workspace.getConfiguration('dftIde').get<string>('lastSelectedProject', '').trim();
    const candidates = await findLocalProjectRoots(localProjectsRoot, projectId);
    for (const candidate of candidates) {
      const repoDir = await findRepoDirectory(candidate, repo);
      if (repoDir) {
        return repoDir;
      }
    }
  }

  if (projectRoot) {
    return path.join(projectRoot, repo);
  }

  throw new Error('No DFT project workspace or local project root is available.');
}

function isRepoFolderName(name: string, repo: 'hibist' | 'sailor' | 'data' | 'verification'): boolean {
  const normalized = name.toLowerCase();
  return normalized === repo || normalized.endsWith(`_${repo}`);
}

async function findSiblingRepoDirectory(currentPath: string, repo: 'hibist' | 'sailor' | 'data' | 'verification'): Promise<string | undefined> {
  const currentName = path.basename(currentPath).toLowerCase();
  if (!PROJECT_REPOS.some((item) => isRepoFolderName(currentName, item))) {
    return undefined;
  }
  return findRepoDirectory(path.dirname(currentPath), repo);
}

async function findLocalProjectRoots(localProjectsRoot: string, projectId: string): Promise<string[]> {
  const root = path.resolve(localProjectsRoot);
  const normalizedProjectId = projectId ? toConfigPathSegment(projectId) : '';
  const roots: string[] = [];

  if (normalizedProjectId) {
    const direct = path.join(root, normalizedProjectId);
    if (await pathExists(direct)) {
      roots.push(direct);
    }
  }

  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(root));
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }
      const fullPath = path.join(root, name);
      if (!normalizedProjectId || toConfigPathSegment(name).includes(normalizedProjectId)) {
        if (!roots.some((item) => normalizeFsPath(item) === normalizeFsPath(fullPath))) {
          roots.push(fullPath);
        }
      }
    }
  } catch {
    // Keep the direct candidate only.
  }

  return roots;
}

async function findRepoDirectory(projectRoot: string, repo: 'hibist' | 'sailor' | 'data' | 'verification'): Promise<string | undefined> {
  const direct = path.join(projectRoot, repo);
  if (await pathExists(direct)) {
    return direct;
  }

  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(projectRoot));
    const match = entries.find(([name, type]) =>
      type === vscode.FileType.Directory && name.toLowerCase().endsWith(`_${repo}`)
    );
    return match ? path.join(projectRoot, match[0]) : undefined;
  } catch {
    return undefined;
  }
}

async function listFlowConfigFiles(flow: 'hibist' | 'sailor' | 'verification'): Promise<{
  configs: FlowConfigFileInfo[];
  configsDir: string;
}> {
  const configsDir = await getFlowConfigsDirectory(flow);
  await ensureLocalConfigDirectory(configsDir);
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(configsDir));
  const configs: FlowConfigFileInfo[] = [];

  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File || path.extname(name).toLowerCase() !== '.cfg') {
      continue;
    }
    const filePath = path.join(configsDir, name);
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    configs.push(toFlowConfigFileInfo(filePath, stat));
  }

  configs.sort((a, b) => a.moduleName.localeCompare(b.moduleName));
  return { configs, configsDir };
}

async function createFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string
): Promise<FlowConfigFileInfo> {
  const configsDir = await getFlowConfigsDirectory(flow);
  const target = resolveCfgPath(configsDir, moduleName);
  if (await pathExists(target)) {
    throw new Error(`Config already exists: ${path.basename(target)}`);
  }
  const content = [
    `# Auto-generated default ${flow} config`,
    `module = ${moduleName}`,
    `flow = ${flow}`,
    ''
  ].join('\n');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(target), Buffer.from(content, 'utf-8'));
  const targetStat = await vscode.workspace.fs.stat(vscode.Uri.file(target));
  return toFlowConfigFileInfo(target, targetStat);
}

async function duplicateFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string
): Promise<FlowConfigFileInfo> {
  const configsDir = await getFlowConfigsDirectory(flow);
  const source = resolveCfgPath(configsDir, moduleName);
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(source));
  if (stat.type !== vscode.FileType.File) {
    throw new Error(`Config is not a file: ${moduleName}`);
  }

  const targetModule = await makeUniqueCfgModuleName(configsDir, `${path.basename(moduleName, '.cfg')}_copy`);
  const target = resolveCfgPath(configsDir, targetModule);
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(source));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(target), bytes);
  const targetStat = await vscode.workspace.fs.stat(vscode.Uri.file(target));
  return toFlowConfigFileInfo(target, targetStat);
}

async function renameFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string,
  nextModuleName: string
): Promise<FlowConfigFileInfo> {
  const configsDir = await getFlowConfigsDirectory(flow);
  const source = resolveCfgPath(configsDir, moduleName);
  const target = resolveCfgPath(configsDir, nextModuleName);
  if (normalizeFsPath(source) === normalizeFsPath(target)) {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(source));
    return toFlowConfigFileInfo(source, stat);
  }
  if (await pathExists(target)) {
    throw new Error(`Config already exists: ${path.basename(target)}`);
  }
  await vscode.workspace.fs.rename(vscode.Uri.file(source), vscode.Uri.file(target));
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(target));
  return toFlowConfigFileInfo(target, stat);
}

async function deleteFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string
): Promise<void> {
  const configsDir = await getFlowConfigsDirectory(flow);
  await vscode.workspace.fs.delete(vscode.Uri.file(resolveCfgPath(configsDir, moduleName)));
}

async function generateDefaultFlowConfigs(flow: 'hibist' | 'sailor' | 'verification'): Promise<{
  configs: FlowConfigFileInfo[];
  configsDir: string;
  created: number;
}> {
  const configsDir = await getFlowConfigsDirectory(flow);
  await ensureLocalConfigDirectory(configsDir);
  const modules = await readModulesFromNormalizedTable(flow);
  let created = 0;

  for (const moduleName of modules) {
    const filePath = resolveCfgPath(configsDir, moduleName);
    if (await pathExists(filePath)) {
      continue;
    }
    const content = [
      `# Auto-generated default ${flow} config`,
      `module = ${moduleName}`,
      `flow = ${flow}`,
      ''
    ].join('\n');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf-8'));
    created += 1;
  }

  const listed = await listFlowConfigFiles(flow);
  return { ...listed, created };
}

function resolveCfgPath(configsDir: string, moduleName: string): string {
  const clean = sanitizeCfgModuleName(moduleName);
  return path.join(configsDir, `${clean}.cfg`);
}

function sanitizeCfgModuleName(value: string): string {
  const clean = path.basename(value.trim().replace(/\.cfg$/i, '')).replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!clean) {
    throw new Error('Module name is required.');
  }
  return clean;
}

async function makeUniqueCfgModuleName(configsDir: string, base: string): Promise<string> {
  const cleanBase = sanitizeCfgModuleName(base);
  let candidate = cleanBase;
  let index = 1;
  while (await pathExists(resolveCfgPath(configsDir, candidate))) {
    candidate = `${cleanBase}_${index++}`;
  }
  return candidate;
}

function toFlowConfigFileInfo(filePath: string, stat: vscode.FileStat): FlowConfigFileInfo {
  const fileName = path.basename(filePath);
  const moduleName = path.basename(fileName, '.cfg');
  return {
    key: moduleName,
    moduleName,
    fileName,
    filePath,
    updatedAt: stat.mtime,
    size: stat.size
  };
}

async function readModulesFromNormalizedTable(flow: 'hibist' | 'sailor' | 'verification'): Promise<string[]> {
  const normTablePath = await resolveNormalizedTablePath(flow);
  const modules = new Set<string>();

  if (normTablePath) {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(normTablePath));
      const text = Buffer.from(bytes).toString('utf-8');
      const parsed = JSON.parse(text);
      collectModuleNames(parsed, modules);
    } catch {
      // The generator stays useful even when the mock table is absent or incomplete.
    }
  }

  if (modules.size === 0) {
    modules.add('top_abc');
  }

  return [...modules].map(sanitizeCfgModuleName).sort((a, b) => a.localeCompare(b));
}

async function resolveNormalizedTablePath(flow: 'hibist' | 'sailor' | 'verification'): Promise<string | undefined> {
  const commonPath = resolveConfigPath('common');
  const common = commonPath ? await readJsonFile(commonPath) : null;
  const synced = getSyncedArtifactPath(common, flow, 'normTable');
  if (synced && await pathExists(synced)) {
    return synced;
  }

  const dataForm = isRecord(common?.data) ? common.data : undefined;
  const configured = [
    dataForm?.normTable,
    common?.dataNormTable,
    common?.normTable
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (configured) {
    const resolved = path.isAbsolute(configured)
      ? configured
      : path.resolve(resolveProjectRoot() ?? path.dirname(commonPath ?? ''), configured);
    if (await pathExists(resolved)) {
      return resolved;
    }
  }

  try {
    const dataRoot = await resolveProjectRepoRoot('data');
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dataRoot));
    const match = entries.find(([name, type]) =>
      type === vscode.FileType.File && /^normalized-table\.(json|csv|md|txt)$/i.test(name)
    );
    return match ? path.join(dataRoot, match[0]) : undefined;
  } catch {
    return undefined;
  }
}

function collectModuleNames(value: unknown, modules: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectModuleNames(item, modules));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const moduleKeys = [
    'moduleName',
    'module_name',
    'module',
    'moduleId',
    'module_id',
    'block',
    'blockName',
    'block_name',
    'designModule',
    'design_module'
  ];
  for (const key of moduleKeys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      modules.add(candidate.trim());
    }
  }

  Object.values(value).forEach((item) => {
    if (typeof item === 'object' && item !== null) {
      collectModuleNames(item, modules);
    }
  });
}

async function getRepoGitInfoForWebview(repo: 'hibist' | 'sailor' | 'data' | 'verification'): Promise<{
  repo: 'hibist' | 'sailor' | 'data' | 'verification';
  repoRoot?: string;
  branch?: string;
  upstream?: string;
  hasChanges?: boolean;
  changedCount?: number;
  changedFiles?: Array<{ path: string; type: string }>;
  error?: string;
}> {
  try {
    const repoRoot = getProjectRepoRoot(repo);
    const info = await gitService.getCurrentGitInfo(vscode.Uri.file(repoRoot));
    return {
      repo,
      repoRoot,
      branch: info?.branch,
      upstream: info?.upstream,
      hasChanges: info?.hasChanges,
      changedCount: info?.changedFiles.length ?? 0,
      changedFiles: info?.changedFiles.map((file) => ({
        path: file.path,
        type: file.type
      })) ?? []
    };
  } catch (error) {
    return {
      repo,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

type RepoCloudSubmitResult = {
  success: boolean;
  state: 'clean' | 'committed' | 'pushed' | 'needsPull' | 'conflict' | 'gitOperationInProgress' | 'noRepo' | 'noRemote' | 'error';
  repo: 'hibist' | 'sailor' | 'data' | 'verification';
  repoRoot?: string;
  branch?: string;
  upstream?: string;
  changedCount?: number;
  conflictFiles?: Array<{ path: string; type: string }>;
  commitMessage?: string;
  error?: string;
};

async function submitRepoToCloud(
  repo: 'hibist' | 'sailor' | 'data' | 'verification',
  options: { message?: string; pullBeforePush?: boolean }
): Promise<RepoCloudSubmitResult> {
  const repoRoot = getProjectRepoRoot(repo);
  const resource = vscode.Uri.file(repoRoot);
  await vscode.workspace.fs.stat(resource);

  let gitInfo = await gitService.getCurrentGitInfo(resource);
  if (!gitInfo) {
    return {
      success: false,
      state: 'noRepo',
      repo,
      repoRoot,
      error: `${repo} repository is not a Git repository.`
    };
  }

  const repository = await gitService.getCurrentRepository(resource);
  if (isGitOperationInProgress(repository)) {
    return {
      success: false,
      state: 'gitOperationInProgress',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      error: 'Git is already in the middle of another operation. Please finish it in VS Code Git first.'
    };
  }

  const conflictFiles = gitInfo.changedFiles.filter((file) => file.type === 'merge');
  if (conflictFiles.length > 0) {
    return {
      success: false,
      state: 'conflict',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      conflictFiles: conflictFiles.map((file) => ({ path: file.path, type: file.type })),
      error: 'Conflict files must be resolved before submitting to cloud.'
    };
  }

  if (!hasRemote(repository, gitInfo)) {
    return {
      success: false,
      state: 'noRemote',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      error: 'No remote repository is configured for this flow repository.'
    };
  }

  if (!gitInfo.hasChanges && !hasOutgoingCommits(repository)) {
    return {
      success: true,
      state: 'clean',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: 0
    };
  }

  const commitMessage = buildRepoCloudCommitMessage(repo, options.message);
  let committed = false;

  if (gitInfo.hasChanges) {
    await gitService.addFiles(gitInfo.changedFiles.map((file) => file.uri), resource);
    await gitService.commit(commitMessage, resource);
    committed = true;
  }

  if (options.pullBeforePush) {
    try {
      await gitService.pull(resource);
    } catch (error) {
      gitInfo = await gitService.getCurrentGitInfo(resource);
      const postPullConflicts = gitInfo?.changedFiles.filter((file) => file.type === 'merge') ?? [];
      if (postPullConflicts.length > 0) {
        return {
          success: false,
          state: 'conflict',
          repo,
          repoRoot,
          branch: gitInfo?.branch,
          upstream: gitInfo?.upstream,
          changedCount: gitInfo?.changedFiles.length ?? 0,
          conflictFiles: postPullConflicts.map((file) => ({ path: file.path, type: file.type })),
          commitMessage: committed ? commitMessage : undefined,
          error: 'Remote sync created conflicts. Resolve them and continue submitting.'
        };
      }
      throw error;
    }
  }

  try {
    await gitService.push(resource);
    return {
      success: true,
      state: 'pushed',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      commitMessage: committed ? commitMessage : undefined
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (isRemoteBehindError(errorMessage)) {
      return {
        success: false,
        state: 'needsPull',
        repo,
        repoRoot,
        branch: gitInfo.branch,
        upstream: gitInfo.upstream,
        changedCount: gitInfo.changedFiles.length,
        commitMessage: committed ? commitMessage : undefined,
        error: 'Remote has newer commits. Sync remote changes and continue.'
      };
    }
    return {
      success: false,
      state: 'error',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      commitMessage: committed ? commitMessage : undefined,
      error: errorMessage
    };
  }
}

function buildRepoCloudCommitMessage(repo: 'hibist' | 'sailor' | 'data' | 'verification', customMessage?: string): string {
  const trimmed = customMessage?.trim();
  if (trimmed) {
    return trimmed;
  }
  const label = repo === 'hibist' ? 'hibist' : repo === 'sailor' ? 'sailor' : repo === 'data' ? 'data' : 'verification';
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `chore(dft-ide): submit ${label} flow to cloud [${now}]`;
}

function hasRemote(repository: any, info: { upstream?: string }): boolean {
  if (info.upstream) {
    return true;
  }
  const remotes = repository?.state?.remotes;
  return Array.isArray(remotes) && remotes.length > 0;
}

function hasOutgoingCommits(repository: any): boolean {
  const ahead = repository?.state?.HEAD?.ahead;
  return typeof ahead === 'number' && ahead > 0;
}

function isGitOperationInProgress(repository: any): boolean {
  const state = repository?.state;
  return Boolean(state?.rebaseCommit || state?.sequencerState);
}

function isRemoteBehindError(message: string): boolean {
  return /non-fast-forward|fetch first|rejected|remote contains work|Updates were rejected|failed to push/i.test(message);
}

async function syncCommonArtifactsToRepo(
  targetRepo: 'hibist' | 'sailor' | 'data' | 'verification',
  source: { designTree: string; normTable: string },
  commitMessage: string,
  push: boolean
): Promise<{ files: Array<{ label: string; path: string; overwritten: boolean }> }> {
  const repoRoot = getProjectRepoRoot(targetRepo);
  // 检查文件夹是否存在，如果不存在则创建
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(repoRoot));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(repoRoot));
    } else {
        throw error;
    }
  }

  const commonPath = resolveConfigPath('common');
  if (!commonPath) {
    throw new Error('Common local-state path is not available.');
  }

  const common = await readJsonFile(commonPath);
  const copiedFiles: Array<{ label: string; path: string; overwritten: boolean }> = [];

  const designTreeTarget = path.join(repoRoot, 'design_tree.mock.json');
  const designTreeSource = resolveDesignTreeFilePath({ ...(common ?? {}), designTree: source.designTree });
  const designTreeCopied = await copyDesignTreeArtifact(designTreeSource, common, designTreeTarget);
  copiedFiles.push({ label: 'Design tree', path: designTreeTarget, overwritten: designTreeCopied });

  if (source.normTable) {
    const normTableSource = path.isAbsolute(source.normTable)
      ? source.normTable
      : path.resolve(resolveProjectRoot() ?? repoRoot, source.normTable);
    const ext = path.extname(normTableSource) || '.json';
    const normTableTarget = path.join(repoRoot, `normalized-table${ext}`);
    const overwritten = await copyFileArtifact(normTableSource, normTableTarget);
    copiedFiles.push({ label: 'Normalized table', path: normTableTarget, overwritten });
  }

  const nextCommon = await mergeConfigFile(commonPath, {
    syncedArtifacts: {
      ...(isRecord(common?.syncedArtifacts) ? common?.syncedArtifacts : {}),
      [targetRepo]: {
        designTree: designTreeTarget,
        normTable: copiedFiles.find((file) => file.label === 'Normalized table')?.path,
        updatedAt: new Date().toISOString()
      }
    }
  });
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(commonPath),
    Buffer.from(JSON.stringify(nextCommon, null, 2), 'utf-8')
  );

  const fileUris = copiedFiles.map((file) => vscode.Uri.file(file.path));
  const filePath = fileUris.map(uri => uri.fsPath)

  const haschangeFiles = await gitService.hasChangedFiles( filePath ,vscode.Uri.file(repoRoot));
  if (!haschangeFiles){
    throw new Error("文件没有变更，无需同步")
  }
  await gitService.addFiles(fileUris, vscode.Uri.file(repoRoot));
  await gitService.commit(commitMessage, vscode.Uri.file(repoRoot));
  if (push) {
    await gitService.push(vscode.Uri.file(repoRoot));
  }

  return { files: copiedFiles.map((file) => ({ ...file, path: vscode.workspace.asRelativePath(file.path) })) };
}

async function copyDesignTreeArtifact(
  sourcePath: string | undefined,
  common: Record<string, unknown> | null,
  targetPath: string
): Promise<boolean> {
  if (sourcePath) {
    return copyFileArtifact(sourcePath, targetPath);
  }

  const draft = common?.designTreeDraft;
  if (!isRecord(draft)) {
    throw new Error('Design tree file is not configured and no Common draft design tree was found.');
  }

  const overwritten = await pathExists(targetPath);
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(targetPath),
    Buffer.from(JSON.stringify(draft, null, 2), 'utf-8')
  );
  return overwritten;
}

async function copyFileArtifact(sourcePath: string, targetPath: string): Promise<boolean> {
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(sourcePath));
  const overwritten = await pathExists(targetPath);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), bytes);
  return overwritten;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const parsed = JSON.parse(Buffer.from(bytes).toString('utf-8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectDesignTreeModules(value: unknown): Array<{ key: string; title: string; type: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const modules: Array<{ key: string; title: string; type: string }> = [];
  const visit = (items: unknown[]) => {
    for (const item of items) {
      if (!isRecord(item)) {
        continue;
      }
      const key = typeof item.key === 'string' ? item.key : '';
      const title = typeof item.title === 'string' ? item.title : key;
      const type = typeof item.type === 'string' ? item.type : 'module';
      if (key) {
        modules.push({ key, title, type });
      }
      if (Array.isArray(item.children)) {
        visit(item.children);
      }
    }
  };

  visit(value);
  return modules;
}

const repoLabels: Record<'hibist' | 'sailor' | 'data' | 'verification', string> = {
  hibist: 'Hibist 仓库',
  sailor: 'Sailor 仓库',
  data: 'Data 公共仓',
  verification: '验证仓库',
};

interface SyncPrecheckOptions {
  targetRepo: 'hibist' | 'sailor' | 'data' | 'verification';
  sourceDesignTree: string;
  sourceNormTable: string;
  targetDesignTree: string;
  targetNormTable: string;
  direction: string;
}

async function prepareCommonArtifactSyncToRepo(options: SyncPrecheckOptions) {
  const { targetRepo, sourceDesignTree, sourceNormTable, targetDesignTree, targetNormTable, direction } = options;
  const repoRoot = getProjectRepoRoot(targetRepo);
  const artifacts = buildCommonSyncArtifacts(repoRoot, [
    { label: 'Design tree', sourcePath: sourceDesignTree, targetPath: targetDesignTree },
    { label: 'Normalized table', sourcePath: sourceNormTable, targetPath: targetNormTable },
  ]);

  if (artifacts.length === 0) {
    throw new Error('Please choose at least one source XLS/XLSX file.');
  }

  const sourceLabel = direction === 'dataToTarget' ? 'Data' : 'Target flow';
  const targetLabel = targetRepo === 'data' ? 'Data' : repoLabels[targetRepo];
  const design = artifacts.find((item) => item.key === 'designTree');
  const norm = artifacts.find((item) => item.key === 'normTable');
  const diffItems = buildCommonSyncDiffItems(design, norm);
  const designDiffCount = diffItems.filter((item) => item.fileType === 'designTree').length;
  const normTableDiffCount = diffItems.filter((item) => item.fileType === 'normTable').length;

  return {
    success: true,
    precheck: {
      direction: `${sourceLabel} -> ${targetLabel}`,
      sourceRepo: direction === 'dataToTarget' ? 'data' : 'target',
      targetRepo,
      designTreeSource: design?.source ?? '',
      designTreeTarget: design?.target ?? '',
      designTreeHiddenDir: design ? path.join(path.dirname(design.target), `.${path.basename(design.target, path.extname(design.target))}`) + path.sep : '',
      designTreeDiffCount: designDiffCount,
      normTableSource: norm?.source ?? '',
      normTableTarget: norm?.target ?? '',
      normTableHiddenDir: norm ? path.join(path.dirname(norm.target), `.${path.basename(norm.target, path.extname(norm.target))}`) + path.sep : '',
      normTableDiffCount: normTableDiffCount,
      files: artifacts.map(({ label, source, target, exists }) => ({ label, source, target, overwritten: exists })),
    },
    diffSummary: {
      designTree: designDiffCount,
      normTable: normTableDiffCount,
    },
    diffItems,
    availableStrategies: ['overwrite', 'autoMerge', 'manualMerge'],
  };
}

interface SyncApplyOptions {
  targetRepo: 'hibist' | 'sailor' | 'data' | 'verification';
  strategy: string;
  direction: string;
  sourceDesignTree: string;
  sourceNormTable: string;
  targetDesignTree: string;
  targetNormTable: string;
  decisions: Array<{ id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>;
  stageAfterApply?: boolean;
}

async function applyCommonArtifactSyncToRepo(options: SyncApplyOptions) {
  const {
    targetRepo,
    strategy,
    direction,
    sourceDesignTree,
    sourceNormTable,
    targetDesignTree,
    targetNormTable,
    decisions,
    stageAfterApply
  } = options;

  const repoRoot = getProjectRepoRoot(targetRepo);
  const artifacts = buildCommonSyncArtifacts(repoRoot, [
    { label: 'Design tree', sourcePath: sourceDesignTree, targetPath: targetDesignTree },
    { label: 'Normalized table', sourcePath: sourceNormTable, targetPath: targetNormTable },
  ]);

  if (artifacts.length === 0) {
    throw new Error('Please choose at least one source XLS/XLSX file.');
  }

  const copiedFiles: Array<{ label: string; path: string; overwritten: boolean }> = [];
  const generatedCsv: string[] = [];

  if (strategy === 'overwrite') {
    for (const artifact of artifacts) {
      await ensureLocalConfigDirectory(path.dirname(artifact.target));
      await vscode.workspace.fs.copy(vscode.Uri.file(artifact.source), vscode.Uri.file(artifact.target), { overwrite: true });
      copiedFiles.push({
        label: artifact.label,
        path: artifact.target,
        overwritten: artifact.exists,
      });
    }
  } else {
    const design = artifacts.find((item) => item.key === 'designTree');
    const norm = artifacts.find((item) => item.key === 'normTable');
    generatedCsv.push(...writeCommonMergeCsvArtifacts(design, norm, strategy, decisions));
  }

  if (stageAfterApply) {
    await gitService.addFiles(
      [...copiedFiles.map((file) => file.path), ...generatedCsv].map((filePath) => vscode.Uri.file(filePath)),
      vscode.Uri.file(repoRoot)
    );
  }

  const relativeCsvs = generatedCsv.map((filePath) => vscode.workspace.asRelativePath(filePath));
  const resolvedStrategyText = strategy === 'overwrite' ? '直接覆盖' : strategy === 'autoMerge' ? '自动合并' : '手动合并';
  const unresolvedCount = strategy === 'manualMerge'
    ? decisions.length
    : strategy === 'autoMerge'
      ? 0
      : 0;

  const report = {
    strategy: resolvedStrategyText,
    direction,
    backupDir: '',
    changedXls: copiedFiles.map((file) => vscode.workspace.asRelativePath(file.path)),
    generatedCsv: relativeCsvs,
    unresolvedCount,
    result: strategy === 'overwrite'
      ? '同步完成：已将真实 XLS/XLSX 源文件复制到目标路径，未生成隐藏 CSV 合并产物。'
      : '同步完成：目标 XLS/XLSX 未被覆盖，已按合并策略写入隐藏 CSV 产物。',
  };

  return {
    success: true,
    report,
    files: [
      ...copiedFiles.map((file) => ({
        label: file.label,
        path: vscode.workspace.asRelativePath(file.path),
        overwritten: file.overwritten,
      })),
      ...generatedCsv.map((filePath) => ({
        label: path.basename(filePath),
        path: vscode.workspace.asRelativePath(filePath),
        overwritten: true,
      })),
    ],
  };
}

interface CommonSyncArtifactInput {
  label: string;
  sourcePath: string;
  targetPath: string;
}

interface CommonSyncArtifact {
  key: 'designTree' | 'normTable';
  label: string;
  source: string;
  target: string;
  exists: boolean;
}

function buildCommonSyncArtifacts(repoRoot: string, inputs: CommonSyncArtifactInput[]): CommonSyncArtifact[] {
  const artifacts: CommonSyncArtifact[] = [];
  inputs.forEach((input, index) => {
    const source = input.sourcePath.trim();
    if (!source) {
      return;
    }
    const resolvedSource = resolveCommonSyncSource(source);
    const target = resolveCommonSyncTarget(repoRoot, input.targetPath, resolvedSource);
    artifacts.push({
      key: index === 0 ? 'designTree' : 'normTable',
      label: input.label,
      source: resolvedSource,
      target,
      exists: fs.existsSync(target),
    });
  });
  return artifacts;
}

function resolveCommonSyncSource(sourcePath: string): string {
  const resolved = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(resolveProjectRoot() ?? '.', sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Source file does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Source must be an XLS/XLSX file: ${resolved}`);
  }
  if (!isSpreadsheetFile(resolved)) {
    throw new Error(`Source must be an .xls or .xlsx file: ${resolved}`);
  }
  return resolved;
}

function resolveCommonSyncTarget(repoRoot: string, targetPath: string, sourcePath: string): string {
  const sourceName = path.basename(sourcePath);
  const trimmed = targetPath.trim();
  if (!trimmed) {
    return path.join(repoRoot, sourceName);
  }
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(repoRoot, trimmed);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return path.join(resolved, sourceName);
  }
  if (!path.extname(resolved)) {
    return path.join(resolved, sourceName);
  }
  if (!isSpreadsheetFile(resolved)) {
    throw new Error(`Target file must be an .xls or .xlsx file, or a directory: ${resolved}`);
  }
  return resolved;
}

function isSpreadsheetFile(filePath: string): boolean {
  return /\.xlsx?$/i.test(path.extname(filePath));
}

interface CommonSyncDiffItem {
  id: string;
  fileType: 'designTree' | 'normTable';
  fileName: string;
  sheetName: string;
  key: string;
  fieldName: string;
  type: 'sourceAdded' | 'targetRedundant' | 'fieldDifferent' | 'fieldAnomaly' | 'sheetAdded' | 'sheetRedundant';
  sourceVal: string;
  targetVal: string;
}

function buildCommonSyncDiffItems(
  design?: CommonSyncArtifact,
  norm?: CommonSyncArtifact
): CommonSyncDiffItem[] {
  const dtName = design ? path.basename(design.source) : 'design_tree.xls';
  const ntName = norm ? path.basename(norm.source) : 'normalized_table.xls';

  return [
    {
      id: 'dt-1',
      fileType: 'designTree',
      fileName: dtName,
      sheetName: 'design_tree',
      key: 'SD5888V100_LM_TOP/U_TM_TOP_0/U_TMDP_ESPE',
      fieldName: 'inst_num',
      type: 'fieldDifferent',
      sourceVal: '5000544',
      targetVal: '5000600',
    },
    {
      id: 'dt-2',
      fileType: 'designTree',
      fileName: dtName,
      sheetName: 'design_tree',
      key: 'SD5888V100_LM_TOP/U_TM_TOP_0/U_TMDP_UMCBR_0',
      fieldName: 'int_edt_info',
      type: 'fieldDifferent',
      sourceVal: 'default_int{1:1}',
      targetVal: 'default_int{2:2}',
    },
    {
      id: 'dt-3',
      fileType: 'designTree',
      fileName: dtName,
      sheetName: 'design_tree',
      key: 'SD5888V100_LM_TOP/U_TM_TOP_1/U_TMCP_FQMC',
      fieldName: '',
      type: 'sourceAdded',
      sourceVal: 'design_name: U_TMCP_FQMC, inst_num: 128, reg_num: 2048, int_edt_info: default_int{4:4}',
      targetVal: '',
    },
    {
      id: 'dt-4',
      fileType: 'designTree',
      fileName: dtName,
      sheetName: 'design_tree',
      key: 'SD5888V100_LM_TOP/U_TM_TOP_0/U_TMCP_CME',
      fieldName: '',
      type: 'targetRedundant',
      sourceVal: '',
      targetVal: 'design_name: U_TMCP_CME, inst_num: 64, reg_num: 512, int_edt_info: default_int{3:3}',
    },
    {
      id: 'nt-1',
      fileType: 'normTable',
      fileName: ntName,
      sheetName: 'Isio_core_top',
      key: 'Isio_core_top::dft_ram_bypass',
      fieldName: '',
      type: 'sourceAdded',
      sourceVal: 'Pin name: dft_ram_bypass, ctrl_type: direct_ctrl, default_value: 0, scan_insert: X, atpg_sae: *',
      targetVal: '',
    },
    {
      id: 'nt-2',
      fileType: 'normTable',
      fileName: ntName,
      sheetName: 'Isio_core_top',
      key: 'Isio_core_top::dft_tcam_ctrl_bus[10:0]',
      fieldName: '',
      type: 'targetRedundant',
      sourceVal: '',
      targetVal: 'Pin name: dft_tcam_ctrl_bus[10:0], ctrl_type: direct_ctrl, default_value: 1, scan_insert: X, atpg_sae: *',
    },
    {
      id: 'nt-3',
      fileType: 'normTable',
      fileName: ntName,
      sheetName: 'Isio_core_top',
      key: 'Isio_core_top::dft_ram_ctrl_bus[319:229]',
      fieldName: 'default_value',
      type: 'fieldDifferent',
      sourceVal: '91b0',
      targetVal: '91b1',
    },
    {
      id: 'nt-4',
      fileType: 'normTable',
      fileName: ntName,
      sheetName: 'Isio_core_top',
      key: 'Isio_core_top::dft_org_post_mode',
      fieldName: 'ctrl_type',
      type: 'fieldDifferent',
      sourceVal: 'direct_ctrl',
      targetVal: 'direct_ctrle',
    },
    {
      id: 'nt-5',
      fileType: 'normTable',
      fileName: ntName,
      sheetName: 'Isio_core_top',
      key: 'Isio_core_top::dft_crg_pre_mode',
      fieldName: 'default_value',
      type: 'fieldAnomaly',
      sourceVal: '0',
      targetVal: '口',
    },
    {
      id: 'nt-6',
      fileType: 'normTable',
      fileName: ntName,
      sheetName: 'new_module_sheet',
      key: 'new_module_sheet',
      fieldName: '',
      type: 'sheetAdded',
      sourceVal: 'Sheet exists',
      targetVal: '',
    },
    {
      id: 'nt-7',
      fileType: 'normTable',
      fileName: ntName,
      sheetName: 'deprecated_module_sheet',
      key: 'deprecated_module_sheet',
      fieldName: '',
      type: 'sheetRedundant',
      sourceVal: '',
      targetVal: 'Sheet exists',
    },
  ];
}

function writeCommonMergeCsvArtifacts(
  design: CommonSyncArtifact | undefined,
  norm: CommonSyncArtifact | undefined,
  strategy: string,
  decisions: Array<{ id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>
): string[] {
  const resolvedDecisions = strategy === 'autoMerge' ? buildAutoMergeDecisions() : decisions;
  const generatedCsv: string[] = [];

  if (design) {
    const dtTargetHiddenDir = getCommonSyncHiddenDir(design.target);
    const dtDecision1 = getDecision(resolvedDecisions, 'dt-1', 'target');
    const dtVal1 = resolveDecisionValue(resolvedDecisions, 'dt-1', dtDecision1, '5000544', '5000600');
    const dtDecision2 = getDecision(resolvedDecisions, 'dt-2', 'target');
    const dtVal2 = resolveDecisionValue(resolvedDecisions, 'dt-2', dtDecision2, 'default_int{1:1}', 'default_int{2:2}');
    const dtDecision3 = getDecision(resolvedDecisions, 'dt-3', 'target');
    const dtDecision4 = getDecision(resolvedDecisions, 'dt-4', 'target');
    const dtRows = [
      ['SD5888V100_LM_TOP/U_TM_TOP_0/U_TMDP_ESPE', 'SD5888V100_LM_TOP', 'U_TM_TOP_0', 'U_TMDP_ESPE', '', '', 'U_TMDP_ESPE', '1024', dtVal1, 'default_int{1:1}', dtDecision1],
      ['SD5888V100_LM_TOP/U_TM_TOP_0/U_TMDP_UMCBR_0', 'SD5888V100_LM_TOP', 'U_TM_TOP_0', 'U_TMDP_UMCBR_0', '', '', 'U_TMDP_UMCBR_0', '512', '256', dtVal2, dtDecision2],
    ];
    if (dtDecision3 === 'source') {
      dtRows.push(['SD5888V100_LM_TOP/U_TM_TOP_1/U_TMCP_FQMC', 'SD5888V100_LM_TOP', 'U_TM_TOP_1', 'U_TMCP_FQMC', '', '', 'U_TMCP_FQMC', '2048', '128', 'default_int{4:4}', 'source']);
    }
    if (dtDecision4 === 'target') {
      dtRows.push(['SD5888V100_LM_TOP/U_TM_TOP_0/U_TMCP_CME', 'SD5888V100_LM_TOP', 'U_TM_TOP_0', 'U_TMCP_CME', '', '', 'U_TMCP_CME', '512', '64', 'default_int{3:3}', 'target']);
    }
    const designCsv = path.join(dtTargetHiddenDir, 'design_tree.csv');
    writeCsvFile(designCsv, ['key', 'level0', 'level1', 'level2', 'level3', 'level4', 'design_name', 'reg_num', 'inst_num', 'int_edt_info', 'decision'], dtRows);
    generatedCsv.push(designCsv);
  }

  if (norm) {
    const ntTargetHiddenDir = getCommonSyncHiddenDir(norm.target);
    const ntDecision1 = getDecision(resolvedDecisions, 'nt-1', 'target');
    const ntDecision2 = getDecision(resolvedDecisions, 'nt-2', 'target');
    const ntDecision3 = getDecision(resolvedDecisions, 'nt-3', 'target');
    const ntVal3 = resolveDecisionValue(resolvedDecisions, 'nt-3', ntDecision3, '91b0', '91b1');
    const ntDecision4 = getDecision(resolvedDecisions, 'nt-4', 'target');
    const ntVal4 = resolveDecisionValue(resolvedDecisions, 'nt-4', ntDecision4, 'direct_ctrl', 'direct_ctrle');
    const ntDecision5 = getDecision(resolvedDecisions, 'nt-5', 'target');
    const ntVal5 = resolveDecisionValue(resolvedDecisions, 'nt-5', ntDecision5, '0', '口');
    const ntRows = [
      ['Isio_core_top::dft_ram_ctrl_bus[319:229]', 'dft_ram_ctrl_bus[319:229]', 'U_RAM_CTRL', 'input', ntVal4, ntVal3, 'X', '1', ntDecision3],
      ['Isio_core_top::dft_org_post_mode', 'dft_org_post_mode', 'U_POST_MODE', 'input', ntVal4, '0', 'X', '1', ntDecision4],
      ['Isio_core_top::dft_crg_pre_mode', 'dft_crg_pre_mode', 'U_PRE_MODE', 'input', 'direct_ctrl', ntVal5, 'X', '1', ntDecision5],
    ];
    if (ntDecision1 === 'source') {
      ntRows.push(['Isio_core_top::dft_ram_bypass', 'dft_ram_bypass', 'U_BYPASS', 'input', 'direct_ctrl', '0', 'X', '*', 'source']);
    }
    if (ntDecision2 === 'target') {
      ntRows.push(['Isio_core_top::dft_tcam_ctrl_bus[10:0]', 'dft_tcam_ctrl_bus[10:0]', 'U_TCAM_CTRL', 'input', 'direct_ctrl', '1', 'X', '*', 'target']);
    }
    const normCsv = path.join(ntTargetHiddenDir, 'Isio_core_top.csv');
    writeCsvFile(normCsv, ['key', 'pin_name', 'dummy_inst_name', 'pin_attribute', 'ctrl_type', 'default_value', 'scan_insert', 'atpg_sae', 'decision'], ntRows);
    generatedCsv.push(normCsv);

    if (getDecision(resolvedDecisions, 'nt-6', 'target') === 'source') {
      const sheetCsv = path.join(ntTargetHiddenDir, 'new_module_sheet.csv');
      writeCsvFile(sheetCsv, ['key', 'status'], [['new_module_sheet', 'Sheet exists']]);
      generatedCsv.push(sheetCsv);
    }
    if (getDecision(resolvedDecisions, 'nt-7', 'target') === 'target') {
      const sheetCsv = path.join(ntTargetHiddenDir, 'deprecated_module_sheet.csv');
      writeCsvFile(sheetCsv, ['key', 'status'], [['deprecated_module_sheet', 'Sheet exists']]);
      generatedCsv.push(sheetCsv);
    }
  }

  return generatedCsv;
}

function buildAutoMergeDecisions(): Array<{ id: string; choice: 'source' | 'target' }> {
  return [
    { id: 'dt-3', choice: 'source' },
    { id: 'dt-4', choice: 'target' },
    { id: 'nt-1', choice: 'source' },
    { id: 'nt-2', choice: 'target' },
    { id: 'nt-6', choice: 'source' },
    { id: 'nt-7', choice: 'target' },
  ];
}

function getDecision(
  decisions: Array<{ id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>,
  id: string,
  fallback: 'source' | 'target' | 'custom'
): 'source' | 'target' | 'custom' {
  return decisions.find((decision) => decision.id === id)?.choice ?? fallback;
}

function resolveDecisionValue(
  decisions: Array<{ id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>,
  id: string,
  choice: 'source' | 'target' | 'custom',
  sourceValue: string,
  targetValue: string
): string {
  if (choice === 'source') {
    return sourceValue;
  }
  if (choice === 'custom') {
    return decisions.find((decision) => decision.id === id)?.customValue ?? '';
  }
  return targetValue;
}

function getCommonSyncHiddenDir(filePath: string): string {
  return path.join(path.dirname(filePath), `.${path.basename(filePath, path.extname(filePath))}`);
}

function writeCsvFile(filePath: string, headers: string[], rows: string[][]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((value) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    ),
  ];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

export function deactivate() {}
