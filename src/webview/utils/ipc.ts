/**
 * Webview ↔ Extension IPC 通信工具
 *
 * 使用 requestId 关联请求与响应，保证多个并发调用互不干扰。
 * 所有向 extension 发出并期望获得响应的请求统一走 ipcRequest()。
 * 单向的通知（如 openFile）直接用 vscode.postMessage。
 */

import vscode from './vscode';

let _reqId = 0;
/** 等待响应的 Promise 回调池：key = `{command}Response:{requestId}` */
const pendingCallbacks = new Map<string, (data: Record<string, unknown>) => void>();

// 全局一次性注册消息监听，收到 extension 响应后派发给对应的 Promise
window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as Record<string, unknown>;
  if (!msg || typeof msg.requestId !== 'string') return;

  const key = `${String(msg.command)}:${msg.requestId}`;
  const cb = pendingCallbacks.get(key);
  if (cb) {
    pendingCallbacks.delete(key);
    cb(msg);
  }
});

/**
 * 向 extension 发送请求并等待响应。
 * extension 需要回复命令名为 `${command}Response`，并携带相同的 requestId。
 */
function ipcRequest(
  command: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 30_000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const id = String(++_reqId);
    const responseKey = `${command}Response:${id}`;

    const timer = setTimeout(() => {
      pendingCallbacks.delete(responseKey);
      reject(new Error(`IPC timeout: ${command} (${id})`));
    }, timeoutMs);

    pendingCallbacks.set(responseKey, (data) => {
      clearTimeout(timer);
      resolve(data);
    });

    vscode.postMessage({ command, requestId: id, ...payload });
  });
}

// ─── 公开 API ──────────────────────────────────────────────

/**
 * 获取当前环境的 Git 信息 (分支、修改状态等)
 */
export async function getGitInfo(): Promise<Record<string, unknown>> {
  return await ipcRequest('getGitInfo');
}

/**
 * 弹出 VS Code 文件/目录 选择器。
 * 返回选中的路径字符串，用户取消则返回 null。
 */
export async function selectPath(targetType: 'file' | 'folder' = 'file'): Promise<string | null> {
  const res = await ipcRequest('selectPath', { targetType });
  return typeof res.path === 'string' ? res.path : null;
}

/**
 * 在 VS Code 编辑器中打开指定文件路径。
 * 这是单向通知，不等待响应。
 */
export function openFileInEditor(path: string): void {
  vscode.postMessage({ command: 'openFile', path });
}

export async function openObsFileReadOnly(path: string): Promise<{ success: boolean; error?: string }> {
  const res = await ipcRequest('openObsFileReadOnly', { path });
  return res as { success: boolean; error?: string };
}

export function runVscodeDemo(action: string): void {
  vscode.postMessage({ command: 'vscodeDemo', action });
}

export async function openObsViewer(
  spaceName?: string
): Promise<{ success: boolean; url?: string; spaceName?: string; error?: string }> {
  const res = await ipcRequest('openObsViewer', { spaceName });
  return res as { success: boolean; url?: string; spaceName?: string; error?: string };
}

export async function openProjectWorkspace(
  rootPath: string
): Promise<{ success: boolean; opened?: boolean; alreadyOpen?: boolean; targetPath?: string; error?: string }> {
  const res = await ipcRequest('openProjectWorkspace', { rootPath });
  return res as { success: boolean; opened?: boolean; alreadyOpen?: boolean; targetPath?: string; error?: string };
}

/**
 * 保存配置数据到本地工作区文件。
 * @param flow  配置所属的流程，决定写入哪个子目录和文件名
 * @param data  要持久化的配置对象（会被序列化为 JSON）
 */
export async function saveConfig(
  flow: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  const res = await ipcRequest('saveConfig', { flow, data });
  return res as { success: boolean; filePath?: string; error?: string };
}

/**
 * 从本地工作区文件读取配置数据，用于表单回显。
 * @param flow  要读取的流程配置文件
 */
export async function readConfig(
  flow: string
): Promise<Record<string, unknown> | null> {
  const res = await ipcRequest('readConfig', { flow });
  if (res.error) return null;
  return res.data as Record<string, unknown> ?? null;
}

export async function readDesignTree(): Promise<Record<string, unknown> | null> {
  const res = await ipcRequest('readDesignTree');
  if (res.error) return null;
  return res.data as Record<string, unknown> ?? null;
}

export async function saveDesignTree(
  flow: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; filePath?: string; mode?: string; error?: string }> {
  const res = await ipcRequest('saveDesignTree', { flow, data });
  return res as { success: boolean; filePath?: string; mode?: string; error?: string };
}

export interface LocalConfigInfo {
  configuredPath: string;
  effectivePath: string | null;
  defaultPath: string | null;
  isDefault: boolean;
  error?: string;
}

export async function getLocalConfigInfo(): Promise<LocalConfigInfo> {
  const res = await ipcRequest('getLocalConfigInfo');
  return res as unknown as LocalConfigInfo;
}

export async function setLocalConfigPath(
  path: string
): Promise<{ success: boolean; error?: string } & LocalConfigInfo> {
  const res = await ipcRequest('setLocalConfigPath', { path });
  return res as unknown as { success: boolean; error?: string } & LocalConfigInfo;
}

/**
 * 将指定 flow 的配置文件提交到 Git，可选是否同时 push 到远端。
 * @param flow        要提交的流程
 * @param message     commit message（可选，不填则自动生成）
 * @param push        是否在 commit 后执行 git push（默认 false）
 */
export async function syncGit(
  flow: string,
  message?: string,
  push = false
): Promise<{ success: boolean; commitMessage?: string; error?: string }> {
  const res = await ipcRequest('syncGit', { flow, message, push });
  return res as { success: boolean; commitMessage?: string; error?: string };
}

// ─── 优化 2: 路径有效性验证 ────────────────────────────────────

/**
 * 验证一个本地路径是否存在。
 * 返回 { exists, isFile, isDirectory } 或 error。
 */
export async function validatePath(
  targetPath: string
): Promise<{ exists: boolean; isFile: boolean; isDirectory: boolean; error?: string }> {
  const res = await ipcRequest('validatePath', { path: targetPath }, 5_000);
  return res as { exists: boolean; isFile: boolean; isDirectory: boolean; error?: string };
}

// ─── 优化 3: 任务取消 ──────────────────────────────────────────

/**
 * 请求取消一个正在运行的 HPC 任务。
 * @param jobId  任务 ID
 */
export async function cancelTask(
  jobId: string
): Promise<{ success: boolean; error?: string }> {
  const res = await ipcRequest('cancelTask', { jobId });
  return res as { success: boolean; error?: string };
}

// ─── 优化 4: Git changed files (diff 预览) ─────────────────────

export interface GitChangedFileInfo {
  path: string;
  type: 'index' | 'workingTree' | 'merge' | 'unknown';
}

/**
 * 获取当前仓库的变更文件列表，供 Webview 展示 diff 预览。
 */
export async function getGitChangedFiles(): Promise<{
  files: GitChangedFileInfo[];
  branch?: string;
  error?: string;
}> {
  const res = await ipcRequest('getGitChangedFiles');
  return res as { files: GitChangedFileInfo[]; branch?: string; error?: string };
}

/**
 * 打开 VS Code Source Control（SCM）视图。
 */
export function openSourceControl(): void {
  vscode.postMessage({ command: 'openSourceControl' });
}

// ─── 优化 5: 专注模式切换 ──────────────────────────────────────

/**
 * 切换 VS Code 布局的专注模式（隐藏/恢复活动栏、菜单栏等）。
 */
export async function toggleZenMode(
  enable: boolean
): Promise<{ success: boolean; error?: string }> {
  const res = await ipcRequest('toggleZenMode', { enable });
  return res as { success: boolean; error?: string };
}

export async function openExecutionTerminal(options: {
  title: string;
  command?: string;
  cwd?: string;
}): Promise<{ success: boolean; error?: string }> {
  const res = await ipcRequest('openExecutionTerminal', options);
  return res as { success: boolean; error?: string };
}

export interface ExecutionHistoryRecord {
  id: string;
  flow: string;
  status: 'success' | 'error' | 'cancelled';
  logs: string[];
  executedAt: number;
}

/**
 * 保存执行记录到本地 .dft-ide/local-state/history。
 */
export async function saveExecutionHistory(
  flow: string,
  record: Omit<ExecutionHistoryRecord, 'id' | 'executedAt'>
): Promise<{ success: boolean; error?: string }> {
  const res = await ipcRequest('saveExecutionHistory', { flow, record });
  return res as { success: boolean; error?: string };
}

/**
 * 获取某个流程的历史执行记录列表（最多返回最新的 500 条）。
 */
export async function getExecutionHistory(
  flow: string
): Promise<{ success: boolean; history: ExecutionHistoryRecord[]; error?: string }> {
  const res = await ipcRequest('getExecutionHistory', { flow });
  return res as { success: boolean; history: ExecutionHistoryRecord[]; error?: string };
}
