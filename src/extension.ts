import * as vscode from 'vscode';
import * as path from 'path';
import { submitJob, queryJobStatus } from './services/donauService';
import { gitService } from './services/gitService';
import { obsService } from './services/obsService';

const VIEW_TYPE = 'dftIde.welcome';
const GLOBAL_KEY = 'dftIde.hasShownWelcome';
const LAYOUT_BACKUP_KEY = 'dftIde.layout.previousSettings';
const LOCAL_STATE_DIR_NAME = '.dft-ide';
const LOCAL_STATE_SUBDIR = 'local-state';
const OBS_READONLY_SCHEME = 'dft-obs-readonly';

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let activeCategory: string | undefined = undefined;
let pendingWebviewCommand: { command: 'showWelcome' } | { command: 'loadFlow'; category: string } | undefined;
const obsReadonlyDocuments = new Map<string, string>();
/** 优化3：跟踪活跃的任务轮询计时器，以便支持取消 */
const activeJobTimers = new Map<string, ReturnType<typeof setInterval>>();

export function activate(context: vscode.ExtensionContext) {
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
    label: '主页',
    icon: 'home',
    description: 'Project Console',
    tooltip: 'DFT IDE 项目主页',
    category: 'HOME',
    contextValue: 'dftFlow.home',
  },
  {
    label: 'Common',
    icon: 'settings-gear',
    description: 'Git · OBS · Paths',
    tooltip: '公共配置\n─────────────────\n• Git 设计/验证分支管理\n• Design Tree 路径配置\n• OBS 存储与公共数据下载\n• 归一化表格路径',
    category: 'Common',
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
  Common: 'DFT IDE — 公共配置',
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
        if (pendingWebviewCommand) {
          currentPanel?.webview.postMessage(pendingWebviewCommand);
          pendingWebviewCommand = undefined;
        }
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
        const requestId: string = msg.requestId;
        const title = typeof msg.title === 'string' && msg.title.trim()
          ? msg.title.trim()
          : 'DFT IDE Task';
        const command = typeof msg.command === 'string' ? msg.command.trim() : '';
        const requestedCwd = typeof msg.cwd === 'string' && msg.cwd.trim() ? msg.cwd.trim() : undefined;
        try {
          const terminal = vscode.window.createTerminal({
            name: title,
            cwd: requestedCwd ?? resolveProjectRoot(),
          });
          terminal.show();
          if (command) {
            terminal.sendText(command);
          }
          currentPanel?.webview.postMessage({
            command: 'openExecutionTerminalResponse',
            requestId,
            success: true,
          });
        } catch (err) {
          currentPanel?.webview.postMessage({
            command: 'openExecutionTerminalResponse',
            requestId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // ── 配置保存 ───────────────────────────────────────────────
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
        try {
          const data = await readDesignTreeState();
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
        const flow = String(msg.flow ?? 'design');
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

      case 'syncGit': {
        const requestId: string = msg.requestId;
        const flow    = msg.flow as 'common' | 'design' | 'verification';
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
          const projectRoot = resolveProjectRoot();
          if (!projectRoot) {
            throw new Error('未找到项目根目录');
          }
          const historyDir = path.join(projectRoot, '.dft-ide', 'local-state', 'history', flow);
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(historyDir));
          await ensureLocalStateIgnored(projectRoot, path.join(projectRoot, '.dft-ide', 'local-state'));

          // 滚动清理：保留最新 500 条
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
          const fullRecord = { ...record, id, executedAt: Date.now() };
          const filePath = path.join(historyDir, `${id}.json`);
          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(filePath),
            Buffer.from(JSON.stringify(fullRecord, null, 2))
          );

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
        ['Common 配置', 'Design 工作流', 'Verification 工作流'],
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
  const configured = vscode.workspace.getConfiguration('dftIde').get<string>('localConfigPath', '').trim();
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    return undefined;
  }

  if (configured) {
    return path.join(path.resolve(configured), toProjectStateDirectoryName(projectRoot), LOCAL_STATE_SUBDIR);
  }

  return path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR);
}

function resolveProjectRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  const expectedRoots = ['main', 'design', 'verification'];
  const matched = expectedRoots
    .map((name) => folders.find((folder) => folder.name.toLowerCase() === name))
    .filter((folder): folder is vscode.WorkspaceFolder => Boolean(folder));
  const parents = new Set(matched.map((folder) => path.dirname(folder.uri.fsPath)));
  if (matched.length >= 2 && parents.size === 1) {
    return [...parents][0];
  }

  return folders[0].uri.fsPath;
}

function normalizeHistoryFlow(flow: unknown): string {
  const value = typeof flow === 'string' ? flow : 'default';
  return /^[a-z0-9_-]+$/i.test(value) ? value : 'default';
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
}> {
  const configuredPath = vscode.workspace.getConfiguration('dftIde').get<string>('localConfigPath', '').trim();
  const projectRoot = resolveProjectRoot();
  const defaultPath = projectRoot ? path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR) : null;
  const effectivePath = resolveLocalConfigDirectory() ?? null;

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
  };
}

async function updateLocalConfigPath(localPath: string): Promise<void> {
  const target = vscode.workspace.workspaceFolders
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await vscode.workspace.getConfiguration('dftIde').update(
    'localConfigPath',
    localPath || undefined,
    target
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

async function readDesignTreeState(): Promise<Record<string, unknown> | null> {
  const commonPath = resolveConfigPath('common');
  if (!commonPath) {
    return null;
  }

  const common = await readJsonFile(commonPath);
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
  const designTreeFilePath = resolveDesignTreeFilePath(common);
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

export function deactivate() {}

