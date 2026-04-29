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

export function runVscodeDemo(action: string): void {
  vscode.postMessage({ command: 'vscodeDemo', action });
}
