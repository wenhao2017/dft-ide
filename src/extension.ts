import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { submitJob, queryJobStatus, getDonauResources } from './services/donauService';
import { gitService } from './services/gitService';
import { obsService } from './services/obsService';
import { isSpreadsheetFile } from './services/commonSyncArtifacts';
import { isPipelineFlowKey, isPipelineFlowKey as _isPipelineFlowKey, PipelineRuntimeService } from './services/pipelineRuntimeService';
import { getWebviewHtml, InitialWebviewCommand } from './webviewHtml';
import { SpreadsheetProvider } from "./spreadsheet"
import {
  handleGetLanderModePipelines,
} from './ipc/landerPipelineIpc';
// Import constants
import {
  VIEW_TYPE,
  GLOBAL_KEY,
  OBS_READONLY_SCHEME,
  LOCAL_STATE_DIR_NAME,
} from './services/constants';

// Import layout services
import {
  applyDftIdeLayout,
  restoreVscodeLayout,
} from './services/layoutService';

// Import workspace services
import {
  openProjectFromPicker,
  openProjectWorkspace,
  prepareProjectWorkspace,
  initProjectWorkspace,
  getLocalConfigInfo,
  updateLocalConfigPath,
  resolveProjectRoot,
  resolveConfigPath,
  resolveDefaultProjectName,
  normalizeProjectRepo,
  normalizeConfigFlow,
  getProjectRepoRoot,
  getCurrentWorkspaceProjectInfo,
  resolveProjectRepoRoot,
  ensureLocalConfigDirectory,
  isDirectoryExists,
  copyDirectory,
  genDefaultConfigs,
} from './services/workspaceService';

// Import config services
import {
  listFlowConfigFiles,
  createFlowConfigFile,
  duplicateFlowConfigFile,
  renameFlowConfigFile,
  deleteFlowConfigFile,
  mergeConfigFile,
  saveDefaultConfigLogs,
  getDefaultConfigLogs,
  readConfig,
  downLoadObsScripts,
} from './services/configService';

// Import design tree services
import {
  readDesignTreeState,
  saveDesignTreeState,
} from './services/designTreeService';

// Import sync services
import {
  getRepoGitInfoForWebview,
  submitRepoToCloud,
  syncCommonArtifactsToRepo,
  prepareCommonArtifactSyncToRepo,
  applyCommonArtifactSyncToRepo,
} from './services/syncService';

// Import diagnostics services
import {
  dftDiagnostics,
} from './services/diagnosticsService';

// Import terminal and execution history services
import {
  openExecutionTerminal,
  saveExecutionHistoryRecord,
  normalizeHistoryFlow,
} from './services/terminalService';

// Import vscode demo action services
import { runVscodeDemo } from './services/demoService';

// Import OBS preview services
import {
  obsReadonlyDocuments,
  openObsReadonlyDocument,
  cleanupObsReadonlyDocument,
} from './services/obsPreviewService';

const execFileAsync = promisify(execFile);

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let activeCategory: string | undefined = undefined;
let pendingWebviewCommand: InitialWebviewCommand | undefined;

let configQueue: Promise<any> = Promise.resolve();  // 全局配置读写队列

function enqueueConfigTask<T>(task: () => Promise<T>): Promise<T> {
  const run = configQueue.then(task, task);
  configQueue = run.then(() => undefined, () => undefined);
  return run;
}

const pipelineRuntimeService = new PipelineRuntimeService({
  onUpdate: (snapshot) => {
    currentPanel?.webview.postMessage({ command: 'pipelineRuntimeUpdated', snapshot });
  },
  onHistory: (record) => {
    void saveExecutionHistoryRecord(record.flow, record).catch((error) => {
      console.error('Failed to persist pipeline execution history', error);
    });
  },
  openTerminal: (title, command, cwd, shellPath) => {
    return openExecutionTerminal({ title, command, cwd, shellPath }).then(() => undefined);
  },
  getPipelineShellPath: () => {
    const configured = vscode.workspace.getConfiguration('dftIde').get<string>('pipeline.shellPath', 'csh');
    return configured.trim() || 'csh';
  },
});

const activeJobTimers = new Map<string, ReturnType<typeof setInterval>>();

function normalizePathForScope(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizePathForScope(targetPath);
  const normalizedRoot = normalizePathForScope(rootPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

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

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document.uri.scheme === OBS_READONLY_SCHEME) {
        void cleanupObsReadonlyDocument(document.uri);
      }
    })
  );

  vscode.window.registerTreeDataProvider('dftIde.views.flows', new DftFlowProvider());

  // Register VS Code Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('dftIde.openFlow', async (category: string) => {
      if (category === 'Formal' || category === 'STA') {
        vscode.window.showInformationMessage('该流程仍在开发中，暂不可打开。');
        return;
      }
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
      return os.userInfo().username.toLowerCase();
    })
  );

  const provider = new SpreadsheetProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('dftIde.spreadsheet', provider, { webviewOptions: { retainContextWhenHidden: true } })
  );

  void initializeDftWorkbench(context);
}

async function initializeDftWorkbench(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('dftIde');
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

// ============================================================
// Tree View Data Provider
// ============================================================

interface FlowMenuConfig {
  label: string;
  icon: string;
  description: string;
  tooltip: string;
  category: string;
  contextValue: string;
  disabled?: boolean;
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
    disabled: true,
  },
  {
    label: '静态时序',
    icon: 'graph',
    description: 'STA (Coming Soon)',
    tooltip: 'Static Timing Analysis\n─────────────────\n静态时序分析配置（开发中）',
    category: 'STA',
    contextValue: 'dftFlow.sta',
    disabled: true,
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
    if (!cfg.disabled) {
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
    }
    return item;
  }
}

// ============================================================
// Webview Management and Message Communication Routing
// ============================================================

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
        const repo = normalizeProjectRepo(msg.repo);
        try {
          if (!repo) {
            throw new Error('Unsupported repository.');
          }
          const resource = vscode.Uri.file(getProjectRepoRoot(repo));
          const gitInfo = await gitService.getCurrentGitInfo(resource);
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
            const selectedTaskIds = Array.isArray(msg.selectedTaskIds) && msg.selectedTaskIds.length > 0 ? msg.selectedTaskIds : undefined;
            const cwd = typeof msg.cwd === 'string' && msg.cwd.trim() ? msg.cwd.trim() : undefined;
            const envConfig = await readConfig(flowKey);
            const taskConfig = await readConfig(`${flowKey}/${moduleKey}/config`);
            pipelineRuntimeService.startRuntime(flowKey, moduleKey, flowLabel, selectedTaskIds, cwd, envConfig, taskConfig);
          } else if (msg.command === 'stopPipelineRuntime') {
            pipelineRuntimeService.stopRuntime(flowKey, moduleKey, flowLabel);
          } else if (msg.command === 'selectPipelineTask') {
            pipelineRuntimeService.selectTask(flowKey, moduleKey, taskId);
          } else if (msg.command === 'stopPipelineTask') {
            pipelineRuntimeService.stopTask(flowKey, moduleKey, taskId, flowLabel);
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
        const rootPath = typeof msg.rootPath === 'string' ? msg.rootPath.trim() : '';
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: targetType === 'file',
          canSelectFolders: targetType === 'folder',
          canSelectMany: false,
          openLabel: '选择',
          defaultUri: rootPath ? vscode.Uri.file(rootPath) : undefined,
        });
        const path = picked?.[0]?.fsPath ?? null;
        if (path && rootPath && !isPathInsideRoot(path, rootPath)) {
          currentPanel?.webview.postMessage({
            command: 'selectPathResponse',
            requestId,
            path: null,
            error: '选择的路径必须位于当前仓库目录内。',
          });
          return;
        }
        currentPanel?.webview.postMessage({
          command: 'selectPathResponse',
          requestId,
          path,
        });
        return;
      }

      case 'openFile': {
        const filePath: string | undefined = msg.path;
        if (!filePath) { return; }
        try {
          const uri = vscode.Uri.file(filePath);
          const stat = await vscode.workspace.fs.stat(uri);

          if (stat.type === vscode.FileType.Directory) {
            await vscode.commands.executeCommand('revealFileInOS', uri);
          } else if (isSpreadsheetFile(uri.fsPath)) {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              uri,
              'grapecity.gc-excelviewer',
              vscode.ViewColumn.Active
            );
          } else {
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

      case 'openFileReadonly': {
        const filePath: string | undefined = msg.path;
        if (!filePath) { return; }
        try {
          const uri = vscode.Uri.file(filePath);
          await fs.chmod(filePath, 0o444, ()=> {
            if (isSpreadsheetFile(uri.fsPath)) {
              vscode.commands.executeCommand(
                'vscode.openWith',
                uri,
                'grapecity.gc-excelviewer',
                vscode.ViewColumn.Active
              );
            } else {
              vscode.window.showTextDocument(uri, {
                viewColumn: vscode.ViewColumn.Active,
                preview: false,
              });
            }
          });
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

      case 'validatePath': {
        const requestId: string = msg.requestId;
        const targetPath = typeof msg.path === 'string' ? msg.path.trim() : '';
        const rootPath = typeof msg.rootPath === 'string' ? msg.rootPath.trim() : '';
        try {
          if (!targetPath) {
            currentPanel?.webview.postMessage({
              command: 'validatePathResponse', requestId,
              exists: false, isFile: false, isDirectory: false, withinRoot: !rootPath
            });
            return;
          }
          if (rootPath && !isPathInsideRoot(targetPath, rootPath)) {
            currentPanel?.webview.postMessage({
              command: 'validatePathResponse', requestId,
              exists: false, isFile: false, isDirectory: false, withinRoot: false,
              error: '路径必须位于当前仓库目录内。'
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
            withinRoot: true,
          });
        } catch {
          currentPanel?.webview.postMessage({
            command: 'validatePathResponse', requestId,
            exists: false, isFile: false, isDirectory: false, withinRoot: !rootPath
          });
        }
        return;
      }

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

      case 'openSourceControl': {
        await gitService.openSourceControl();
        return;
      }

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
        const command = typeof msg.cmd === 'string' ? msg.cmd.trim() : '';
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

        enqueueConfigTask(async () => {
          const filePath = resolveConfigPath(flow);

          if (!filePath) {
            currentPanel?.webview.postMessage({
              command: 'saveConfigResponse',
              requestId,
              success: false,
              error: '未找到工作区路径'
            });
            return;
          }

          await vscode.workspace.fs.createDirectory(
            vscode.Uri.file(path.dirname(filePath))
          );

          // gitignore（已经被串行保护）
          const projectRoot = resolveProjectRoot();
          if (projectRoot) {
            const gitignoreUri = vscode.Uri.file(path.join(projectRoot, '.gitignore'));

            let content = '';
            try {
              const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
              content = Buffer.from(bytes).toString('utf-8');
            } catch {}

            if (!content.includes(`${LOCAL_STATE_DIR_NAME}/`)) {
              const prefix = content && !content.endsWith('\n') ? '\n' : '';
              const next = `${content}${prefix}\n# DFT IDE local user state\n${LOCAL_STATE_DIR_NAME}/\n`;

              await vscode.workspace.fs.writeFile(
                gitignoreUri,
                Buffer.from(next, 'utf-8')
              );
            }
          }

          const merged = await mergeConfigFile(filePath, data);

          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(filePath),
            Buffer.from(JSON.stringify(merged, null, 2))
          );

          currentPanel?.webview.postMessage({
            command: 'saveConfigResponse',
            requestId,
            success: true,
            filePath: vscode.workspace.asRelativePath(filePath)
          });
        }).catch(err => {
          currentPanel?.webview.postMessage({
            command: 'saveConfigResponse',
            requestId,
            success: false,
            error: String(err)
          });
        });

        return;
      }

      case 'readConfig': {
        const requestId: string = msg.requestId;
        const flow = String(msg.flow ?? 'default');

        enqueueConfigTask(async () => {
            const data = await readConfig(flow);

            currentPanel?.webview.postMessage({
              command: 'readConfigResponse',
              requestId,
              data
            });
        });

        return;
      }

      case 'readDesignTreeState': {
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
        const scriptPath = msg.scriptPath;
        try {
          if (!flow) {
            throw new Error('Unsupported flow for config files.');
          }
          if (!scriptPath) {
            throw new Error('Unsupported flow for script files.');
          }
          // 根据flow 获取归一化表格文件和design tree, 归一化表格配置都在common.json中，所以传参'common'
          const filePath = resolveConfigPath('common');
          if (!filePath) {
            currentPanel?.webview.postMessage({
              command: 'generateDefaultFlowConfigsResponse', requestId, success: false, error: '获取归一化表格和designTree配置失败'
            });
            return;
          }

          const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
          const data = JSON.parse(Buffer.from(bytes).toString('utf-8'));
          if(!data[flow]){
            currentPanel?.webview.postMessage({
              command: 'generateDefaultFlowConfigsResponse', requestId, success: false, error: '获取归一化表格和designTree失败'
            });
            return;
          }
          const designTree = data[flow].designTree;
          const normTable = data[flow].normTable;
          // 从obs获取python脚本
          const configDirectory = await downLoadObsScripts(flow);
          if (!configDirectory) {
            currentPanel?.webview.postMessage({
              command: 'generateDefaultFlowConfigsResponse', requestId, success: false, error: '从obs获取py脚本失败'
            });
            return;
          }
          const configLog = await genDefaultConfigs({requestId, flow, scriptPath, configDirectory, designTree ,normTable});
          const result = await saveDefaultConfigLogs(configLog);
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
            throw new Error(`Source comparison file does not exist: ${path.basename(sourcePath)}`);
          }
          if (!fs.existsSync(targetPath)) {
            throw new Error(`Target comparison file does not exist: ${path.basename(targetPath)}`);
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

      case 'getWorkspaceProjectInfo': {
        const requestId: string = msg.requestId;
        try {
          currentPanel?.webview.postMessage({
            command: 'getWorkspaceProjectInfoResponse',
            requestId,
            success: true,
            ...getCurrentWorkspaceProjectInfo(),
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'getWorkspaceProjectInfoResponse',
            requestId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
            projectRoot: null,
            projectName: null,
            workspaceName: null,
            folders: [],
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
              } catch {}
            }
            history.sort((a: any, b: any) => (b.executedAt ?? 0) - (a.executedAt ?? 0));
          } catch {}

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
        let gitlabHost = process.env.GITLAB_HOST ?? vscode.workspace.getConfiguration('dftIde').get<string>('gitlabHost', '');
        gitlabHost = gitlabHost.replace(/\/+$/, '');
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

      case 'openExternalUrl': {
        const requestId: string = msg.requestId;
        const externalUrl = typeof msg.externalUrl === 'string' ? msg.externalUrl.trim() : '';
        const openUrl = async (url: string): Promise<boolean> => {
          const platform = process.platform;
          const urlToOpen = /^https?:\/\//i.test(url) ? url : `https://${url}`;

          switch (platform) {
            case 'win32':
              await execFileAsync('cmd', ['/c', 'start', '', urlToOpen]);
              return true;
            case 'darwin':
              await execFileAsync('open', [urlToOpen]);
              return true;
            default:
              try {
                await execFileAsync('xdg-open', [urlToOpen]);
                return true;
              } catch {
                const browsers = ['chromium', 'chrome', 'google-chrome', 'firefox', 'brave', 'epiphany', 'vivaldi'];
                for (const browser of browsers) {
                  try {
                    await execFileAsync(browser, [urlToOpen]);
                    return true;
                  } catch {
                    // Try the next browser candidate.
                  }
                }
                throw new Error('Could not find an executable to open the URL');
              }
          }
        };

        try {
          if (!externalUrl) {
            throw new Error('External URL is required.');
          }
          const success = await openUrl(externalUrl);
          currentPanel?.webview.postMessage({
            command: 'openExternalUrlResponse',
            requestId,
            success,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'openExternalUrlResponse',
            requestId,
            success: false,
            error: String(err),
          });
        }
        return;
      }

      case 'getBranches': {
        const requestId: string = msg.requestId;
        const repo = normalizeProjectRepo(msg.repo);
        try {
          if (!repo) {
            throw new Error('Unsupported repository.');
          }
          const resource = vscode.Uri.file(getProjectRepoRoot(repo));
          const branches = await gitService.getBranches(resource);
          currentPanel?.webview.postMessage({
            command: 'getBranchesResponse',
            requestId,
            success: true,
            branches
          });
        } catch (error) {
          currentPanel?.webview.postMessage({
            command: 'getBranchesResponse',
            requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      case 'fetchDefaultConfigLogs': {
        const requestId: string = msg.requestId;
        try {
          const history = await getDefaultConfigLogs(msg.flow);
          currentPanel?.webview.postMessage({
            command: 'fetchDefaultConfigLogsResponse', requestId,
            success: true,
            history
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'fetchDefaultConfigLogsResponse', requestId,
            success: false, error: String(err)
          });
        }
        return;
      }

      case 'appendLanderStage': {
        const requestId: string = msg.requestId;
        try {
          const repoRoot = await resolveProjectRepoRoot(msg.flow);
          const addStage = path.join(repoRoot, msg.addStage);
          const addExists = await isDirectoryExists(addStage);
          if (addExists){
            currentPanel?.webview.postMessage({
              command: 'appendLanderStageResponse', requestId,
              success: false, error: `stage ${msg.addStage} aready exists`
            });
            return;
          }
          await ensureLocalConfigDirectory(addStage);
          if (msg.extendStage) {
            const extendStage = path.join(repoRoot, msg.extendStage);
            const extendExists = await isDirectoryExists(extendStage);
            if (extendExists){
              await copyDirectory(extendStage, addStage);
            }
          }
          currentPanel?.webview.postMessage({
            command: 'appendLanderStageResponse', requestId,
            success: true
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'initLanderStageResponse', requestId,
            success: false, error: String(err)
          });
        }
        return;
      }

      case 'getLanderStages': {
        const requestId: string = msg.requestId;
        try {
          const repoRoot = await resolveProjectRepoRoot(msg.flow);
          const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(repoRoot));
          const stages = entries
                .filter(([name, type]) => (type === vscode.FileType.Directory && !name.startsWith('.')))
                .map(([name]) => name);
          currentPanel?.webview.postMessage({
            command: 'getLanderStagesResponse', requestId,
            success: true,
            stages
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'getLanderStagesResponse', requestId,
            success: false, error: String(err)
          });
        }
        return;
      }

      case 'removeLanderStage': {
        const requestId: string = msg.requestId;
        try {
          const repoRoot = await resolveProjectRepoRoot(msg.flow);
          const stage = path.join(repoRoot, msg.stage);
          await vscode.workspace.fs.delete(vscode.Uri.file(stage), { recursive: true });
          currentPanel?.webview.postMessage({
            command: 'removeLanderStageResponse', requestId,
            success: true
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'removeLanderStageResponse', requestId,
            success: false, error: String(err)
          });
        }
        return;
      }

      case 'getLanderModePipelines': {
        await handleGetLanderModePipelines(
          context,
          currentPanel,
          msg,
        );
        return;
      }

      default:
        return;
    }
  });
}

export function deactivate() {}
