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
    startedAt: status === 'running' ? nowText() : undefined,
    logs: [],
  };
}

function createIdleRuntime(
  flowKey: PipelineFlowKey,
  moduleKey: string,
  flowLabel: string,
): PipelineRuntimeSnapshot {
  const config = pipelineFlowConfigs[flowKey];
  return {
    flowKey,
    moduleKey,
    flowLabel,
    tasks: [],
    links: [],
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

    const initialTasks = config.getInitialTasks((id, name, command, description, status) => ({
      ...makeTask(id, name, command, description, status),
      logs: [`[${nowText()}] ${config.logPrefix} ${name} 已创建，初始状态：${status ?? 'pending'}。`],
    }));
    const initialLinks = config.getInitialLinks();

    const runtime: PipelineRuntimeSnapshot = {
      runId,
      flowKey,
      moduleKey,
      flowLabel,
      tasks: initialTasks,
      links: initialLinks,
      logs: [`[${nowText()}] ${config.logPrefix} 流水线已启动。`],
      selectedTaskId: initialTasks[0]?.id,
      runState: 'running',
      startedAt: nowStamp(),
      updatedAt: nowStamp(),
    };
    this.runtimes.set(key, runtime);
    this.notify(key);

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
