import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  PipelineLink,
  PipelineTask,
  TaskStatus,
  pipelineFlowConfigs,
} from '../webview/components/shared/pipelineMockData';

export type PipelineFlowKey = 'hibist' | 'sailor' | 'verification';
export type PipelineRunState = 'idle' | 'running' | 'completed' | 'stopped';

export interface PipelineRuntimeSnapshot {
  runId?: string;
  flowKey: PipelineFlowKey;
  moduleKey: string;
  flowLabel: string;
  tasks: PipelineTask[];
  links: PipelineLink[];
  logs: string[];
  selectedTaskId?: string;
  runState: PipelineRunState;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
}

export interface PipelineRuntimeHistoryRecord {
  flow: string;
  flowKey: PipelineFlowKey;
  moduleKey: string;
  flowLabel: string;
  status: 'success' | 'error' | 'cancelled';
  logs: string[];
  runtimeSnapshot: PipelineRuntimeSnapshot;
}

interface PipelineRuntimeServiceOptions {
  onUpdate: (snapshot: PipelineRuntimeSnapshot) => void;
  onHistory: (record: PipelineRuntimeHistoryRecord) => void;
  openTerminal: (title: string, command: string) => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
const historySavedRunIds = new Set<string>();

const nowText = () => new Date().toLocaleTimeString();
const nowStamp = () => Date.now();

export function getPipelineRuntimeKey(flowKey: PipelineFlowKey, moduleKey: string): string {
  return `${flowKey}:${moduleKey}`;
}

export function isPipelineFlowKey(value: unknown): value is PipelineFlowKey {
  return value === 'hibist' || value === 'sailor' || value === 'verification';
}

function getProjectRootPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

// Lightweight YAML parser
function parseYamlTasks(content: string): PipelineTask[] {
  const lines = content.split(/\r?\n/);
  const tasks: PipelineTask[] = [];
  let currentTask: Partial<PipelineTask> | null = null;

  for (let line of lines) {
    const hashIndex = line.indexOf('#');
    if (hashIndex !== -1) {
      line = line.substring(0, hashIndex);
    }
    line = line.trimEnd();
    if (!line.trim()) continue;

    // Check for "- id: ..."
    const listItemMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listItemMatch) {
      if (currentTask && currentTask.id) {
        tasks.push({
          id: currentTask.id,
          name: currentTask.name || currentTask.id,
          command: currentTask.command || '',
          status: 'pending',
          attempts: 1,
          description: currentTask.description || '',
          logs: [],
        });
      }
      currentTask = {};
      const rest = listItemMatch[2].trim();
      const colonIndex = rest.indexOf(':');
      if (colonIndex !== -1) {
        const key = rest.substring(0, colonIndex).trim();
        let val = rest.substring(colonIndex + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        currentTask[key as keyof PipelineTask] = val as any;
      }
    } else {
      const kvMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (kvMatch && currentTask) {
        const key = kvMatch[2].trim();
        let val = kvMatch[3].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        currentTask[key as keyof PipelineTask] = val as any;
      }
    }
  }

  if (currentTask && currentTask.id) {
    tasks.push({
      id: currentTask.id,
      name: currentTask.name || currentTask.id,
      command: currentTask.command || '',
      status: 'pending',
      attempts: 1,
      description: currentTask.description || '',
      logs: [],
    });
  }

  return tasks;
}

function getYamlFileName(flowKey: PipelineFlowKey): string {
  if (flowKey === 'verification') return 'lander.yaml';
  return `${flowKey}.yaml`;
}

function getYamlPath(flowKey: PipelineFlowKey): string | undefined {
  const root = getProjectRootPath();
  if (!root) return undefined;
  return path.join(root, 'pipelines', getYamlFileName(flowKey));
}

function getDefaultYamlContent(flowKey: PipelineFlowKey): string {
  const config = pipelineFlowConfigs[flowKey];
  if (!config) return '';
  
  let content = `# DFT IDE Pipeline Configuration for ${flowKey.toUpperCase()}\n`;
  content += `# Modify this file to customize the steps and commands of the pipeline.\n\n`;
  
  const makeDummyTask = (id: string, name: string, command: string, description: string) => {
    return { id, name, command, description };
  };
  const tasks = config.getInitialTasks((id, name, command, description) => makeDummyTask(id, name, command, description) as any);
  
  tasks.forEach((task) => {
    content += `- id: ${task.id}\n`;
    content += `  name: ${task.name}\n`;
    content += `  command: "${task.command}"\n`;
    content += `  description: ${task.description}\n\n`;
  });
  
  return content;
}

function loadPipelineConfig(flowKey: PipelineFlowKey): { tasks: PipelineTask[]; links: PipelineLink[] } {
  const yamlPath = getYamlPath(flowKey);
  
  // Default values
  const defaultTasks = pipelineFlowConfigs[flowKey].getInitialTasks((id, name, command, description) => makeTask(id, name, command, description));
  const defaultLinks = pipelineFlowConfigs[flowKey].getInitialLinks();

  if (!yamlPath) {
    return { tasks: defaultTasks, links: defaultLinks };
  }

  try {
    const dir = path.dirname(yamlPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (!fs.existsSync(yamlPath)) {
      const defaultContent = getDefaultYamlContent(flowKey);
      fs.writeFileSync(yamlPath, defaultContent, 'utf-8');
      return { tasks: defaultTasks, links: defaultLinks };
    }

    const content = fs.readFileSync(yamlPath, 'utf-8');
    const parsedTasks = parseYamlTasks(content);
    
    if (parsedTasks.length === 0) {
      return { tasks: defaultTasks, links: defaultLinks };
    }

    // Auto-generate sequential links
    const links: PipelineLink[] = [];
    for (let i = 0; i < parsedTasks.length - 1; i++) {
      links.push({ source: parsedTasks[i].id, target: parsedTasks[i + 1].id });
    }

    return { tasks: parsedTasks, links };
  } catch (error) {
    console.error(`Error loading pipeline config for ${flowKey}:`, error);
    return { tasks: defaultTasks, links: defaultLinks };
  }
}

function runSequentialSimulation(
  key: string,
  tasks: PipelineTask[],
  logPrefix: string,
  patchTask: (id: string, patch: Partial<PipelineTask> | ((task: PipelineTask) => Partial<PipelineTask>)) => void,
  appendLog: (msg: string) => void,
  setRunState: (state: PipelineRunState) => void,
) {
  let delay = 500;
  tasks.forEach((task, index) => {
    // 1. Schedule Task Start
    scheduleRuntime(key, delay, () => {
      patchTask(task.id, {
        status: 'running',
        startedAt: nowText(),
      });
      appendLog(`${logPrefix} ${task.name} 运行启动。`);
    });

    delay += 1500;

    // 2. Schedule Task End
    scheduleRuntime(key, delay, () => {
      patchTask(task.id, {
        status: 'success',
        finishedAt: nowText(),
        duration: '1.2s',
        logs: [`[${nowText()}] ${logPrefix} ${task.name} 执行完成。`],
      });
      appendLog(`${logPrefix} ${task.name} 执行成功。`);
      
      // If it's the last task, complete the run
      if (index === tasks.length - 1) {
        setRunState('completed');
        appendLog(`${logPrefix} 流水线执行成功。`);
      }
    });

    delay += 500;
  });
}

function makeTask(
  id: string,
  name: string,
  command: string,
  description: string,
  status: TaskStatus = 'pending',
): PipelineTask {
  return {
    id,
    name,
    command,
    status,
    attempts: 1,
    description,
    logs: [],
  };
}

function createIdleRuntime(
  flowKey: PipelineFlowKey,
  moduleKey: string,
  flowLabel: string,
): PipelineRuntimeSnapshot {
  const config = pipelineFlowConfigs[flowKey];
  const { tasks, links } = loadPipelineConfig(flowKey);
  return {
    flowKey,
    moduleKey,
    flowLabel,
    tasks: tasks.map((t) => ({ ...t, status: 'pending' })),
    links,
    logs: [`流水线运行态已就绪，点击“启动流水线”开始接收 ${config.title} 事件流。`],
    runState: 'idle',
    updatedAt: nowStamp(),
  };
}

function clearRuntimeTimers(key: string) {
  timers.get(key)?.forEach((timer) => clearTimeout(timer));
  timers.set(key, []);
}

function scheduleRuntime(key: string, delay: number, action: () => void) {
  const timer = setTimeout(action, delay);
  timers.set(key, [...(timers.get(key) ?? []), timer]);
}

export class PipelineRuntimeService {
  private runtimes = new Map<string, PipelineRuntimeSnapshot>();

  constructor(private readonly options: PipelineRuntimeServiceOptions) {}

  getRuntimes(): PipelineRuntimeSnapshot[] {
    return Array.from(this.runtimes.values());
  }

  ensureRuntime(flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string): PipelineRuntimeSnapshot {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const existing = this.runtimes.get(key);
    if (existing) {
      const next = { ...existing, flowLabel, updatedAt: nowStamp() };
      this.runtimes.set(key, next);
      this.options.onUpdate(next);
      return next;
    }

    const runtime = createIdleRuntime(flowKey, moduleKey, flowLabel);
    this.runtimes.set(key, runtime);
    this.options.onUpdate(runtime);
    return runtime;
  }

  startRuntime(flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string): PipelineRuntimeSnapshot {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];
    const runId = `pipeline_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    clearRuntimeTimers(key);

    this.options.openTerminal(config.terminalTitle, config.terminalCommand);

    const { tasks: parsedTasks, links: parsedLinks } = loadPipelineConfig(flowKey);

    const initialTasks = parsedTasks.map((t, idx) => ({
      ...t,
      status: idx === 0 ? 'running' as TaskStatus : 'pending' as TaskStatus,
      startedAt: idx === 0 ? nowText() : undefined,
      logs: [`[${nowText()}] ${config.logPrefix} ${t.name} 已创建，初始状态：${idx === 0 ? 'running' : 'pending'}。`],
    }));

    const runtime: PipelineRuntimeSnapshot = {
      runId,
      flowKey,
      moduleKey,
      flowLabel,
      tasks: initialTasks,
      links: parsedLinks,
      logs: [`[${nowText()}] ${config.logPrefix} 流水线已启动。`],
      selectedTaskId: initialTasks[0]?.id,
      runState: 'running',
      startedAt: nowStamp(),
      updatedAt: nowStamp(),
    };
    this.runtimes.set(key, runtime);
    this.notify(key);

    // Decide if we run default simulation or custom sequential simulation
    const defaultTasks = config.getInitialTasks((id) => ({ id } as any));
    const isDefault = defaultTasks.length === parsedTasks.length && defaultTasks.every((t, i) => t.id === parsedTasks[i].id);

    if (isDefault) {
      config.timeline.forEach((event) => {
        scheduleRuntime(key, event.delay, () => {
          event.action({
            appendLog: (msg) => this.appendLog(key, config.logPrefix, msg),
            addTasks: (newTasks, newLinks) => {
              this.updateRuntime(key, (current) => ({
                ...current,
                tasks: [...current.tasks, ...newTasks],
                links: [...current.links, ...newLinks],
              }));
            },
            patchTask: (id, patch) => this.patchTask(key, id, patch),
            setRunState: (runState) => {
              this.updateRuntime(key, (current) => ({
                ...current,
                runState,
                finishedAt: runState === 'completed' || runState === 'stopped' ? nowStamp() : current.finishedAt,
              }));
            },
            getNow: nowText,
          });
        });
      });
    } else {
      runSequentialSimulation(
        key,
        initialTasks,
        config.logPrefix,
        (id, patch) => this.patchTask(key, id, patch),
        (msg) => this.appendLog(key, config.logPrefix, msg),
        (runState) => {
          this.updateRuntime(key, (current) => ({
            ...current,
            runState,
            finishedAt: runState === 'completed' || runState === 'stopped' ? nowStamp() : current.finishedAt,
          }));
        }
      );
    }

    return runtime;
  }

  stopRuntime(flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string): void {
    this.ensureRuntime(flowKey, moduleKey, flowLabel);

    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];
    clearRuntimeTimers(key);

    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      runState: 'stopped',
      finishedAt: nowStamp(),
      tasks: runtime.tasks.map((task) => {
        if (task.status === 'running') {
          return {
            ...task,
            status: 'stopped',
            finishedAt: nowText(),
            logs: [...task.logs, `[${nowText()}] ${config.logPrefix} 已被“停止全部”中止。`],
          };
        }

        if (task.status === 'pending') {
          return {
            ...task,
            status: 'skipped',
            finishedAt: nowText(),
            logs: [...task.logs, `[${nowText()}] ${config.logPrefix} 因“停止全部”跳过。`],
          };
        }

        return task;
      }),
      logs: [...runtime.logs, `[${nowText()}] ${config.logPrefix} 已触发“停止全部”。`],
    }));
  }

  selectTask(flowKey: PipelineFlowKey, moduleKey: string, taskId: string): void {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    this.updateRuntime(key, (runtime) => ({ ...runtime, selectedTaskId: taskId }));
  }

  stopTask(flowKey: PipelineFlowKey, moduleKey: string, taskId: string): void {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];
    const logMsg = `[${nowText()}] ${config.logPrefix} 用户手动停止任务。`;

    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      tasks: runtime.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        return {
          ...task,
          status: 'stopped',
          finishedAt: nowText(),
          logs: [...task.logs, logMsg],
        };
      }),
      logs: [...runtime.logs, `[${nowText()}] ${config.logPrefix} 任务 ${taskId} 已由用户手动停止。`],
    }));
  }

  rerunTask(flowKey: PipelineFlowKey, moduleKey: string, taskId: string): void {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];

    const { tasks: parsedTasks } = loadPipelineConfig(flowKey);
    const defaultTasks = config.getInitialTasks((id) => ({ id } as any));
    const isDefault = defaultTasks.length === parsedTasks.length && defaultTasks.every((t, i) => t.id === parsedTasks[i].id);

    if (isDefault) {
      config.onRerun(taskId, {
        appendLog: (msg) => this.appendLog(key, config.logPrefix, msg),
        patchTask: (id, patch) => this.patchTask(key, id, patch),
        setRunState: (runState) => {
          this.updateRuntime(key, (runtime) => ({
            ...runtime,
            runState,
            finishedAt: runState === 'completed' || runState === 'stopped' ? nowStamp() : runtime.finishedAt,
          }));
        },
        getNow: nowText,
        schedule: (delay, action) => scheduleRuntime(key, delay, action),
        setRuntime: (next) => {
          this.updateRuntime(key, (runtime) => (
            typeof next === 'function' ? next(runtime) : next
          ));
        },
      });
    } else {
      // Generic rerun
      this.patchTask(key, taskId, {
        status: 'running',
        startedAt: nowText(),
        finishedAt: undefined,
      });
      this.appendLog(key, config.logPrefix, `手动重跑任务 ${taskId}...`);

      scheduleRuntime(key, 1200, () => {
        this.patchTask(key, taskId, {
          status: 'success',
          finishedAt: nowText(),
          duration: '1.2s',
        });
        this.appendLog(key, config.logPrefix, `任务 ${taskId} 重跑成功。`);
      });
    }
  }

  private appendLog(key: string, prefix: string, msg: string): void {
    const formatted = msg.startsWith(prefix) ? msg : `${prefix} ${msg}`;
    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      logs: [...runtime.logs, `[${nowText()}] ${formatted}`],
    }));
  }

  private patchTask(
    key: string,
    id: string,
    patch: Partial<PipelineTask> | ((task: PipelineTask) => Partial<PipelineTask>),
  ): void {
    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      tasks: runtime.tasks.map((task) => {
        if (task.id !== id) {
          return task;
        }

        const nextPatch = typeof patch === 'function' ? patch(task) : patch;
        return {
          ...task,
          ...nextPatch,
          logs: nextPatch.logs ?? task.logs,
        };
      }),
    }));
  }

  private updateRuntime(
    key: string,
    updater: (runtime: PipelineRuntimeSnapshot) => PipelineRuntimeSnapshot,
  ): void {
    const current = this.runtimes.get(key);
    if (!current) {
      return;
    }

    const next = { ...updater(current), updatedAt: nowStamp() };
    this.runtimes.set(key, next);
    this.notify(key);
  }

  private notify(key: string): void {
    const runtime = this.runtimes.get(key);
    if (!runtime) {
      return;
    }

    this.options.onUpdate(runtime);
    this.maybeSaveHistory(runtime);
  }

  private maybeSaveHistory(runtime: PipelineRuntimeSnapshot): void {
    if (!runtime.runId || runtime.tasks.length === 0) {
      return;
    }
    if (runtime.runState !== 'completed' && runtime.runState !== 'stopped') {
      return;
    }
    if (historySavedRunIds.has(runtime.runId)) {
      return;
    }

    historySavedRunIds.add(runtime.runId);
    const failed = runtime.tasks.some((task) => task.status === 'failed');
    const status = runtime.runState === 'stopped'
      ? 'cancelled'
      : failed
        ? 'error'
        : 'success';

    this.options.onHistory({
      flow: runtime.flowKey,
      flowKey: runtime.flowKey,
      moduleKey: runtime.moduleKey,
      flowLabel: runtime.flowLabel,
      status,
      logs: runtime.logs,
      runtimeSnapshot: runtime,
    });
  }
}
