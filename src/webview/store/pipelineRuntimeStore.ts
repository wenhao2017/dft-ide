import { create } from 'zustand';
import {
  PipelineLink,
  PipelineTask,
  TaskStatus,
  pipelineFlowConfigs,
} from '../components/shared/pipelineMockData';
import { openExecutionTerminal } from '../utils/ipc';

export type PipelineFlowKey = 'hibist' | 'sailor' | 'verification';
export type PipelineRunState = 'idle' | 'running' | 'completed' | 'stopped';

export interface PipelineRuntimeSnapshot {
  flowKey: PipelineFlowKey;
  moduleKey: string;
  flowLabel: string;
  tasks: PipelineTask[];
  links: PipelineLink[];
  logs: string[];
  selectedTaskId?: string;
  runState: PipelineRunState;
}

interface PipelineRuntimeStore {
  runtimes: Record<string, PipelineRuntimeSnapshot>;
  ensureRuntime: (flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string) => void;
  startRuntime: (flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string) => void;
  stopRuntime: (flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string) => void;
  selectTask: (flowKey: PipelineFlowKey, moduleKey: string, taskId: string) => void;
  stopTask: (flowKey: PipelineFlowKey, moduleKey: string, taskId: string) => void;
  rerunTask: (flowKey: PipelineFlowKey, moduleKey: string, taskId: string) => void;
}

const timers: Record<string, number[]> = {};

const now = () => new Date().toLocaleTimeString();

export function getPipelineRuntimeKey(flowKey: PipelineFlowKey, moduleKey: string): string {
  return `${flowKey}:${moduleKey}`;
}

export function getInitialTaskCount(flowKey: PipelineFlowKey): number {
  const config = pipelineFlowConfigs[flowKey];
  return config.getInitialTasks(makeTask).length;
}

export function makeInitialRuntime(
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
  };
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
    startedAt: status === 'running' ? now() : undefined,
    logs: [],
  };
}

function clearRuntimeTimers(key: string) {
  timers[key]?.forEach((timer) => window.clearTimeout(timer));
  timers[key] = [];
}

function scheduleRuntime(key: string, delay: number, action: () => void) {
  const timer = window.setTimeout(action, delay);
  timers[key] = [...(timers[key] ?? []), timer];
}

const usePipelineRuntimeStore = create<PipelineRuntimeStore>((set, get) => {
  const ensureRuntime = (flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string) => {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    set((state) => {
      const existing = state.runtimes[key];
      if (existing) {
        return {
          runtimes: {
            ...state.runtimes,
            [key]: { ...existing, flowLabel },
          },
        };
      }

      return {
        runtimes: {
          ...state.runtimes,
          [key]: makeInitialRuntime(flowKey, moduleKey, flowLabel),
        },
      };
    });
  };

  const updateRuntime = (
    key: string,
    updater: (runtime: PipelineRuntimeSnapshot) => PipelineRuntimeSnapshot,
  ) => {
    set((state) => {
      const current = state.runtimes[key];
      if (!current) {
        return state;
      }

      return {
        runtimes: {
          ...state.runtimes,
          [key]: updater(current),
        },
      };
    });
  };

  const appendLog = (key: string, prefix: string, msg: string) => {
    const formatted = msg.startsWith(prefix) ? msg : `${prefix} ${msg}`;
    updateRuntime(key, (runtime) => ({
      ...runtime,
      logs: [...runtime.logs, `[${now()}] ${formatted}`],
    }));
  };

  const patchTask = (
    key: string,
    id: string,
    patch: Partial<PipelineTask> | ((task: PipelineTask) => Partial<PipelineTask>),
  ) => {
    updateRuntime(key, (runtime) => ({
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
  };

  return {
    runtimes: {},

    ensureRuntime,

    startRuntime: (flowKey, moduleKey, flowLabel) => {
      ensureRuntime(flowKey, moduleKey, flowLabel);

      const key = getPipelineRuntimeKey(flowKey, moduleKey);
      const config = pipelineFlowConfigs[flowKey];
      clearRuntimeTimers(key);

      void openExecutionTerminal({
        title: config.terminalTitle,
        command: config.terminalCommand,
      });

      const initialTasks = config.getInitialTasks((id, name, command, description, status) => ({
        ...makeTask(id, name, command, description, status),
        logs: [`[${now()}] ${config.logPrefix} ${name} 已创建，初始状态：${status ?? 'pending'}。`],
      }));
      const initialLinks = config.getInitialLinks();

      set((state) => ({
        runtimes: {
          ...state.runtimes,
          [key]: {
            flowKey,
            moduleKey,
            flowLabel,
            tasks: initialTasks,
            links: initialLinks,
            logs: [`[${now()}] ${config.logPrefix} 流水线已启动。`],
            selectedTaskId: initialTasks[0]?.id,
            runState: 'running',
          },
        },
      }));

      config.timeline.forEach((event) => {
        scheduleRuntime(key, event.delay, () => {
          event.action({
            appendLog: (msg) => appendLog(key, config.logPrefix, msg),
            addTasks: (newTasks, newLinks) => {
              updateRuntime(key, (runtime) => ({
                ...runtime,
                tasks: [...runtime.tasks, ...newTasks],
                links: [...runtime.links, ...newLinks],
              }));
            },
            patchTask: (id, patch) => patchTask(key, id, patch),
            setRunState: (runState) => {
              updateRuntime(key, (runtime) => ({ ...runtime, runState }));
            },
            getNow: now,
          });
        });
      });
    },

    stopRuntime: (flowKey, moduleKey, flowLabel) => {
      ensureRuntime(flowKey, moduleKey, flowLabel);

      const key = getPipelineRuntimeKey(flowKey, moduleKey);
      const config = pipelineFlowConfigs[flowKey];
      clearRuntimeTimers(key);

      updateRuntime(key, (runtime) => ({
        ...runtime,
        runState: 'stopped',
        tasks: runtime.tasks.map((task) => {
          if (task.status === 'running') {
            return {
              ...task,
              status: 'stopped',
              finishedAt: now(),
              logs: [...task.logs, `[${now()}] ${config.logPrefix} 已被“停止全部”中止。`],
            };
          }

          if (task.status === 'pending') {
            return {
              ...task,
              status: 'skipped',
              finishedAt: now(),
              logs: [...task.logs, `[${now()}] ${config.logPrefix} 因“停止全部”跳过。`],
            };
          }

          return task;
        }),
        logs: [...runtime.logs, `[${now()}] ${config.logPrefix} 已触发“停止全部”。`],
      }));
    },

    selectTask: (flowKey, moduleKey, taskId) => {
      const key = getPipelineRuntimeKey(flowKey, moduleKey);
      updateRuntime(key, (runtime) => ({ ...runtime, selectedTaskId: taskId }));
    },

    stopTask: (flowKey, moduleKey, taskId) => {
      const key = getPipelineRuntimeKey(flowKey, moduleKey);
      const config = pipelineFlowConfigs[flowKey];
      const logMsg = `[${now()}] ${config.logPrefix} 用户手动停止任务。`;

      updateRuntime(key, (runtime) => ({
        ...runtime,
        tasks: runtime.tasks.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          return {
            ...task,
            status: 'stopped',
            finishedAt: now(),
            logs: [...task.logs, logMsg],
          };
        }),
        logs: [...runtime.logs, `[${now()}] ${config.logPrefix} 任务 ${taskId} 已由用户手动停止。`],
      }));
    },

    rerunTask: (flowKey, moduleKey, taskId) => {
      const key = getPipelineRuntimeKey(flowKey, moduleKey);
      const config = pipelineFlowConfigs[flowKey];

      config.onRerun(taskId, {
        appendLog: (msg) => appendLog(key, config.logPrefix, msg),
        patchTask: (id, patch) => patchTask(key, id, patch),
        setRunState: (runState) => {
          updateRuntime(key, (runtime) => ({ ...runtime, runState }));
        },
        getNow: now,
        schedule: (delay, action) => scheduleRuntime(key, delay, action),
        setRuntime: (next) => {
          updateRuntime(key, (runtime) => (
            typeof next === 'function' ? next(runtime) : next
          ));
        },
      });
    },
  };
});

export default usePipelineRuntimeStore;
