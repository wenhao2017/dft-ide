import * as vscode from 'vscode';
import * as path from 'path';
import {
  resolveExecutionCwd,
  resolveProjectRoot,
  ensureLocalStateIgnored,
} from './workspaceService';
import { runDftLogDiagnosticsDemo } from './diagnosticsService';
import type { PipelineRuntimeHistoryRecord } from './pipelineRuntimeService';

type TerminalDataEvent = { terminal: vscode.Terminal; data: string };
type TerminalShellEndEvent = { terminal: vscode.Terminal; exitCode?: number };
type WindowWithTerminalData = typeof vscode.window & {
  onDidWriteTerminalData?: (
    listener: (event: TerminalDataEvent) => unknown
  ) => vscode.Disposable;
  onDidEndTerminalShellExecution?: (
    listener: (event: TerminalShellEndEvent) => unknown
  ) => vscode.Disposable;
};

export interface ExecutionTerminalMonitor {
  onData?: (data: string, terminal: vscode.Terminal) => void;
  onShellEnd?: (exitCode: number | undefined, terminal: vscode.Terminal) => void;
  onClose?: (terminal: vscode.Terminal) => void;
}

export interface ExecutionTerminalCapabilities {
  data: boolean;
  shellEnd: boolean;
}

const terminalMonitors = new Map<string, Set<ExecutionTerminalMonitor>>();
let terminalListenersRegistered = false;

export function getExecutionTerminalCapabilities(): ExecutionTerminalCapabilities {
  const terminalDataApi = vscode.window as WindowWithTerminalData;
  return {
    data: typeof terminalDataApi.onDidWriteTerminalData === 'function',
    shellEnd: typeof terminalDataApi.onDidEndTerminalShellExecution === 'function',
  };
}

function ensureTerminalListeners(): void {
  if (terminalListenersRegistered) {
    return;
  }
  terminalListenersRegistered = true;

  const terminalDataApi = vscode.window as WindowWithTerminalData;
  terminalDataApi.onDidWriteTerminalData?.((event) => {
    const monitors = terminalMonitors.get(event.terminal.name);
    monitors?.forEach((monitor) => monitor.onData?.(event.data, event.terminal));
  });

  terminalDataApi.onDidEndTerminalShellExecution?.((event) => {
    const monitors = terminalMonitors.get(event.terminal.name);
    monitors?.forEach((monitor) => monitor.onShellEnd?.(event.exitCode, event.terminal));
  });

  vscode.window.onDidCloseTerminal((terminal) => {
    const monitors = terminalMonitors.get(terminal.name);
    monitors?.forEach((monitor) => monitor.onClose?.(terminal));
  });
}

export function registerExecutionTerminalMonitor(
  title: string,
  monitor: ExecutionTerminalMonitor,
): vscode.Disposable {
  ensureTerminalListeners();
  const monitors = terminalMonitors.get(title) ?? new Set<ExecutionTerminalMonitor>();
  monitors.add(monitor);
  terminalMonitors.set(title, monitors);

  return {
    dispose: () => {
      const current = terminalMonitors.get(title);
      if (!current) {
        return;
      }
      current.delete(monitor);
      if (current.size === 0) {
        terminalMonitors.delete(title);
      }
    },
  };
}

async function waitForNewTerminalReady(terminal: vscode.Terminal): Promise<void> {
  const terminalDataApi = vscode.window as WindowWithTerminalData;
  if (!terminalDataApi.onDidWriteTerminalData) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let disposable: vscode.Disposable | undefined;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        disposable?.dispose();
        resolve();
      }
    }, 1500);

    disposable = terminalDataApi.onDidWriteTerminalData!((event) => {
      if (event.terminal !== terminal || settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      disposable?.dispose();
      resolve();
    });
  });
}

export function normalizeHistoryFlow(flow: unknown): string {
  const value = typeof flow === 'string' ? flow : 'default';
  return /^[a-z0-9_-]+$/i.test(value) ? value : 'default';
}

export async function saveExecutionHistoryRecord(
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

export async function openExecutionTerminal(options: {
  title?: string;
  command?: string | string[];
  cwd?: string;
  flow?: string;
  shellPath?: string;
}): Promise<vscode.Terminal> {
  const title = typeof options.title === 'string' && options.title.trim()
    ? options.title.trim()
    : 'DFT IDE Task';

  let command = '';
  if (typeof options.command === 'string') {
    command = options.command.trim();
  } else if (Array.isArray(options.command) && options.command.length > 0) {
    command = options.command[options.command.length - 1].trim();
  }

  const requestedCwd = typeof options.cwd === 'string' && options.cwd.trim() ? options.cwd.trim() : undefined;
  const terminalCwd = requestedCwd ?? resolveExecutionCwd(title, command);

  if(terminalCwd){
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(terminalCwd));
  }

  let terminal = vscode.window.terminals.find((t) => t.name === title);
  const isNew = !terminal;

  if (isNew) {
    terminal = vscode.window.createTerminal({
      name: title,
      cwd: terminalCwd,
      shellPath: typeof options.shellPath === 'string' && options.shellPath.trim()
        ? options.shellPath.trim()
        : undefined,
    });
  }

  terminal!.show();

  if (isNew) {
    await waitForNewTerminalReady(terminal!);
  }

  if (command) {
    if (Array.isArray(options.command)) {
      for (const cmd of options.command) {
        terminal!.sendText(cmd.trim());
      }
    } else {
      terminal!.sendText(command);
    }
  }

  // void runDftLogDiagnosticsDemo(title, command).catch((error) => {
  //   vscode.window.showWarningMessage(
  //     `DFT IDE log diagnostics demo failed: ${error instanceof Error ? error.message : String(error)}`
  //   );
  // });

  return terminal!;
}

export async function stopExecutionTerminal(title: string) {
  let terminal = vscode.window.terminals.find((t) => t.name === title);
  if (terminal) {
    terminal.sendText('\u0003'); // \u0003 是 Ctrl+C 的 ASCII 码
  } else {
    console.error(`Not found terminal: ${title}`);
  }
}
