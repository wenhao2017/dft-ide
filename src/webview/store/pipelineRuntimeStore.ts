import { create } from 'zustand';
import {
  ensurePipelineRuntime,
  getPipelineRuntimes,
  rerunPipelineTask,
  selectPipelineTask,
  startPipelineRuntime,
  stopPipelineRuntime,
  stopPipelineTask,
} from '../utils/ipc';
import {
  PipelineLink,
  PipelineTask,
  TaskStatus,
  pipelineFlowConfigs,
} from '../components/shared/pipelineMockData';

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

interface PipelineRuntimeStore {
  runtimes: Record<string, PipelineRuntimeSnapshot>;
  ensureRuntime: (flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string) => void;
  startRuntime: (flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string, selectedTaskIds?: string[]) => void;
  stopRuntime: (flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string) => void;
  selectTask: (flowKey: PipelineFlowKey, moduleKey: string, taskId: string) => void;
  stopTask: (flowKey: PipelineFlowKey, moduleKey: string, taskId: string) => void;
  rerunTask: (flowKey: PipelineFlowKey, moduleKey: string, taskId: string) => void;
  applyRuntime: (snapshot: PipelineRuntimeSnapshot) => void;
  applyRuntimes: (snapshots: PipelineRuntimeSnapshot[]) => void;
}

let subscribed = false;

export function getPipelineRuntimeKey(flowKey: PipelineFlowKey, moduleKey: string): string {
  return `${flowKey}:${moduleKey}`;
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
    updatedAt: Date.now(),
  };
}

export function subscribePipelineRuntimeUpdates(): void {
  if (subscribed) {
    return;
  }
  subscribed = true;

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as { command?: string; snapshot?: unknown; snapshots?: unknown[] };
    if (msg.command === 'pipelineRuntimeUpdated' && isRuntimeSnapshot(msg.snapshot)) {
      usePipelineRuntimeStore.getState().applyRuntime(msg.snapshot);
    }
    if (msg.command === 'pipelineRuntimesUpdated' && Array.isArray(msg.snapshots)) {
      usePipelineRuntimeStore.getState().applyRuntimes(msg.snapshots.filter(isRuntimeSnapshot));
    }
  });

  void getPipelineRuntimes().then((res) => {
    if (res.success) {
      usePipelineRuntimeStore.getState().applyRuntimes(res.snapshots.filter(isRuntimeSnapshot));
    }
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

function isRuntimeSnapshot(value: unknown): value is PipelineRuntimeSnapshot {
  const candidate = value as Partial<PipelineRuntimeSnapshot> | undefined;
  return !!candidate
    && (candidate.flowKey === 'hibist' || candidate.flowKey === 'sailor' || candidate.flowKey === 'verification')
    && typeof candidate.moduleKey === 'string'
    && typeof candidate.flowLabel === 'string'
    && Array.isArray(candidate.tasks)
    && Array.isArray(candidate.links)
    && Array.isArray(candidate.logs)
    && (candidate.runState === 'idle' || candidate.runState === 'running' || candidate.runState === 'completed' || candidate.runState === 'stopped');
}

function applySnapshot(
  runtimes: Record<string, PipelineRuntimeSnapshot>,
  snapshot: PipelineRuntimeSnapshot,
): Record<string, PipelineRuntimeSnapshot> {
  return {
    ...runtimes,
    [getPipelineRuntimeKey(snapshot.flowKey, snapshot.moduleKey)]: snapshot,
  };
}

const usePipelineRuntimeStore = create<PipelineRuntimeStore>((set) => ({
  runtimes: {},

  ensureRuntime: (flowKey, moduleKey, flowLabel) => {
    set((state) => {
      const key = getPipelineRuntimeKey(flowKey, moduleKey);
      if (state.runtimes[key]) {
        return state;
      }
      return {
        runtimes: {
          ...state.runtimes,
          [key]: makeInitialRuntime(flowKey, moduleKey, flowLabel),
        },
      };
    });
    void ensurePipelineRuntime({ flowKey, moduleKey, flowLabel });
  },

  startRuntime: (flowKey, moduleKey, flowLabel, selectedTaskIds) => {
    set((state) => ({
      runtimes: applySnapshot(
        state.runtimes,
        {
          ...makeInitialRuntime(flowKey, moduleKey, flowLabel),
          logs: [`${flowLabel} 已提交启动请求，等待 VS Code runtime 同步。`],
          runState: 'running',
        },
      ),
    }));
    void startPipelineRuntime({ flowKey, moduleKey, flowLabel, selectedTaskIds });
  },

  stopRuntime: (flowKey, moduleKey, flowLabel) => {
    void stopPipelineRuntime({ flowKey, moduleKey, flowLabel });
  },

  selectTask: (flowKey, moduleKey, taskId) => {
    set((state) => {
      const key = getPipelineRuntimeKey(flowKey, moduleKey);
      const runtime = state.runtimes[key];
      if (!runtime) {
        return state;
      }
      return {
        runtimes: {
          ...state.runtimes,
          [key]: { ...runtime, selectedTaskId: taskId },
        },
      };
    });
    void selectPipelineTask({ flowKey, moduleKey, taskId });
  },

  stopTask: (flowKey, moduleKey, taskId) => {
    void stopPipelineTask({ flowKey, moduleKey, taskId });
  },

  rerunTask: (flowKey, moduleKey, taskId) => {
    void rerunPipelineTask({ flowKey, moduleKey, taskId });
  },

  applyRuntime: (snapshot) => {
    set((state) => ({
      runtimes: applySnapshot(state.runtimes, snapshot),
    }));
  },

  applyRuntimes: (snapshots) => {
    set((state) => ({
      runtimes: snapshots.reduce(applySnapshot, state.runtimes),
    }));
  },
}));

export default usePipelineRuntimeStore;
