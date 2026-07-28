import { create } from 'zustand';
import { z } from 'zod';
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
} from '../components/shared/pipelineMockData';
import { mergeLatestSnapshot } from './pipelineRuntimeMerge';

export type PipelineFlowKey = 'hibist' | 'sailor' | 'verification';
export type PipelineRunState = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface PipelineRuntimeSnapshot {
  runId?: string;
  flowKey: PipelineFlowKey;
  moduleKey: string;
  flowLabel: string;
  tasks: PipelineTask[];
  links: PipelineLink[];
  selectedTaskId?: string;
  runState: PipelineRunState;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
}

interface PipelineRuntimeStore {
  runtimes: Record<string, PipelineRuntimeSnapshot>;
  ensureRuntime: (
    flowKey: PipelineFlowKey,
    moduleKey: string,
    flowLabel: string,
  ) => Promise<PipelineRuntimeSnapshot | undefined>;
  startRuntime: (
    flowKey: PipelineFlowKey,
    moduleKey: string,
    flowLabel: string,
    selectedTaskIds?: string[],
    cwd?: string,
    selectedTasks?: Array<Pick<PipelineTask, 'id' | 'name' | 'command' | 'description'>>,
    runParameters?: unknown,
  ) => void;
  stopRuntime: (flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string) => void;
  selectTask: (flowKey: PipelineFlowKey, moduleKey: string, taskId: string) => void;
  stopTask: (flowKey: PipelineFlowKey, moduleKey: string, taskId: string, flowLabel: string) => void;
  rerunTask: (flowKey: PipelineFlowKey, moduleKey: string, taskId: string) => void;
  applyRuntime: (snapshot: PipelineRuntimeSnapshot) => void;
  applyRuntimes: (snapshots: PipelineRuntimeSnapshot[]) => void;
}

let subscribed = false;

const taskStatusSchema = z.enum(['pending', 'running', 'success', 'failed', 'stopped', 'skipped']);
const pipelineEcoPhaseSchema = z.enum(['before', 'after']);
const pipelineEcoHookSchema = z.object({
  phase: pipelineEcoPhaseSchema,
  scriptPath: z.string().optional(),
  status: taskStatusSchema,
  attempts: z.number(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  duration: z.string().optional(),
  exitCode: z.number().optional(),
  lastRunSource: z.enum(['pipeline', 'manual']).optional(),
});
const pipelineEcoRuntimeSchema = z.object({
  scriptName: z.string(),
  scriptPath: z.string().optional(),
  before: pipelineEcoHookSchema,
  after: pipelineEcoHookSchema,
});
const pipelineFlowKeySchema = z.enum(['hibist', 'sailor', 'verification']);
const pipelineRunStateSchema = z.enum(['idle', 'running', 'completed', 'failed', 'stopped']);
const pipelineTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string(),
  status: taskStatusSchema,
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  duration: z.string().optional(),
  attempts: z.number(),
  description: z.string(),
  eco: pipelineEcoRuntimeSchema.optional(),
});
const pipelineLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
});
const pipelineRuntimeSnapshotSchema = z.object({
  runId: z.string().optional(),
  flowKey: pipelineFlowKeySchema,
  moduleKey: z.string(),
  flowLabel: z.string(),
  tasks: z.array(pipelineTaskSchema),
  links: z.array(pipelineLinkSchema),
  selectedTaskId: z.string().optional(),
  runState: pipelineRunStateSchema,
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  updatedAt: z.number(),
});

function parseRuntimeSnapshot(value: unknown): PipelineRuntimeSnapshot | null {
  const result = pipelineRuntimeSnapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}

function parseRuntimeSnapshots(values: unknown[]): PipelineRuntimeSnapshot[] {
  return values
    .map(parseRuntimeSnapshot)
    .filter((snapshot): snapshot is PipelineRuntimeSnapshot => Boolean(snapshot));
}

export function getPipelineRuntimeKey(flowKey: PipelineFlowKey, moduleKey: string): string {
  return `${flowKey}:${moduleKey}`;
}

export function makeInitialRuntime(
  flowKey: PipelineFlowKey,
  moduleKey: string,
  flowLabel: string,
): PipelineRuntimeSnapshot {
  return {
    flowKey,
    moduleKey,
    flowLabel,
    tasks: [],
    links: [],
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
    if (msg.command === 'pipelineRuntimeUpdated') {
      const snapshot = parseRuntimeSnapshot(msg.snapshot);
      if (snapshot) {
        usePipelineRuntimeStore.getState().applyRuntime(snapshot);
      }
    }
    if (msg.command === 'pipelineRuntimesUpdated' && Array.isArray(msg.snapshots)) {
      usePipelineRuntimeStore.getState().applyRuntimes(parseRuntimeSnapshots(msg.snapshots));
    }
  });

  void getPipelineRuntimes().then((res) => {
    if (res.success) {
      usePipelineRuntimeStore.getState().applyRuntimes(parseRuntimeSnapshots(res.snapshots));
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
  };
}

function applySnapshot(
  runtimes: Record<string, PipelineRuntimeSnapshot>,
  snapshot: PipelineRuntimeSnapshot,
): Record<string, PipelineRuntimeSnapshot> {
  const key = getPipelineRuntimeKey(snapshot.flowKey, snapshot.moduleKey);
  return mergeLatestSnapshot(runtimes, key, snapshot);
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
    return ensurePipelineRuntime({ flowKey, moduleKey, flowLabel }).then((res) => {
      const snapshot = res.success ? parseRuntimeSnapshot(res.snapshot) : null;
      if (snapshot) {
        set((state) => {
          const key = getPipelineRuntimeKey(flowKey, moduleKey);
          const current = state.runtimes[key];
          // Ignore an ensure response that was sent before this run started.
          if (current?.runState === 'running' && snapshot.runState === 'idle') {
            return state;
          }
          return { runtimes: applySnapshot(state.runtimes, snapshot) };
        });
        return snapshot;
      }
      return undefined;
    });
  },

  startRuntime: (flowKey, moduleKey, flowLabel, selectedTaskIds, cwd, selectedTasks, runParameters) => {
    const normalizedSelectedTaskIds = selectedTaskIds?.length ? selectedTaskIds : undefined;
    const optimisticTasks: PipelineTask[] = (selectedTasks ?? []).map((task, index) => {
      const isSelected = !normalizedSelectedTaskIds || normalizedSelectedTaskIds.includes(task.id);
      const isFirstSelected = isSelected && (
        normalizedSelectedTaskIds ? task.id === normalizedSelectedTaskIds[0] : index === 0
      );
      return {
        ...task,
        status: isSelected ? (isFirstSelected ? 'running' : 'pending') : 'skipped',
        attempts: 1,
      };
    });
    set((state) => ({
      runtimes: applySnapshot(
        state.runtimes,
        {
          ...makeInitialRuntime(flowKey, moduleKey, flowLabel),
          tasks: optimisticTasks,
          links: optimisticTasks.slice(1).map((task, index) => ({
            source: optimisticTasks[index].id,
            target: task.id,
          })),
          selectedTaskId: optimisticTasks.find((task) => task.status === 'running')?.id
            ?? optimisticTasks[0]?.id,
          runState: 'running',
        },
      ),
    }));
    void startPipelineRuntime({ flowKey, moduleKey, flowLabel, selectedTaskIds, selectedTasks, cwd, runParameters });
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

  stopTask: (flowKey, moduleKey, taskId, flowLabel) => {
    void stopPipelineTask({ flowKey, moduleKey, taskId, flowLabel });
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
