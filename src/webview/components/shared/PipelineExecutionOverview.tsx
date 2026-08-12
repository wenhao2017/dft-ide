import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Col,
  Dropdown,
  Empty,
  Input,
  List,
  message,
  Pagination,
  Row,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import {
  CaretDownOutlined,
  CaretRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  FilterOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import usePipelineRuntimeStore, {
  PipelineFlowKey,
  PipelineRuntimeSnapshot,
  getPipelineRuntimeKey,
} from '../../store/pipelineRuntimeStore';
import { PipelineEcoPhase, PipelineEcoRuntime, PipelineLink, PipelineTask } from './pipelineMockData';
import {
  openFileInEditor,
  openExecutionTerminal,
  parseExecutionHistoryDiagnostics,
  revealExecutionHistory,
  runPipelineTaskEcoHook,
  stopPipelineTaskEcoHook,
} from '../../utils/ipc';
import { useShallow } from 'zustand/react/shallow';
import { getVersionFromModuleKey } from '../../components/verification/mode/ModePanel/utils'

type OverviewRunState = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

interface PipelineExecutionOverviewProps {
  flowKey: PipelineFlowKey;
  flowLabel: string;
  moduleKeys: string[];
  moduleWorkDirs?: Record<string, string>;
  defaultTasksByModule?: Record<string, Array<Pick<PipelineTask, 'id' | 'name' | 'command' | 'description'>>>;
  activeModuleKey?: string;
  onActiveModuleChange?: (moduleKey: string) => void;
}

interface PipelineRunOverview {
  runId?: string;
  flowLabel: string;
  moduleKey: string;
  runState: OverviewRunState;
  total: number;
  completed: number;
  failed: number;
  startedAt?: number;
  finishedAt?: number;
  updatedAt?: number;
  tasks: PipelineTask[];
  links: PipelineLink[];
  cpu: number;
  mem: number;
}

const themeStyles = {
  shellBg: 'var(--vscode-editor-background)',
  cardBg: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
  cardBgHover: 'var(--vscode-list-hoverBackground, rgba(127,127,127,0.10))',
  panelBg: 'var(--vscode-input-background, var(--vscode-editor-background))',
  metricBg: 'var(--vscode-editorWidget-background, var(--vscode-sideBar-background))',
  border: 'var(--vscode-panel-border, rgba(127,127,127,0.26))',
  borderLight: 'var(--vscode-widget-border, rgba(127,127,127,0.18))',
  textPrimary: 'var(--vscode-editor-foreground, var(--vscode-foreground))',
  textSecondary: 'var(--vscode-descriptionForeground, rgba(100,100,100,0.72))',
  textMuted: 'var(--vscode-disabledForeground, rgba(100,100,100,0.52))',
  accent: 'var(--vscode-focusBorder, #3b82f6)',
  accentText: 'var(--vscode-textLink-foreground, #2563eb)',
  accentBorder: 'var(--vscode-focusBorder, #3b82f6)',
  selectedBg: 'var(--vscode-list-inactiveSelectionBackground, color-mix(in srgb, var(--vscode-focusBorder, #2563eb) 14%, var(--vscode-editor-background, #ffffff)))',
  selectedFg: 'var(--vscode-list-inactiveSelectionForeground, var(--vscode-editor-foreground, var(--vscode-foreground)))',
  selectedBorder: 'color-mix(in srgb, var(--vscode-focusBorder, #2563eb) 72%, var(--vscode-panel-border, rgba(127,127,127,0.26)))',
  selectedShadow: '0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder, #2563eb) 28%, transparent), 0 8px 18px rgba(0,0,0,0.10)',
  magenta: 'var(--vscode-symbolIcon-operatorForeground, var(--vscode-descriptionForeground))',
  amber: 'var(--vscode-editorWarning-foreground, #b7791f)',
  success: 'var(--vscode-testing-iconPassed, #15803d)',
  error: 'var(--vscode-testing-iconFailed, #c2410c)',
  warning: 'var(--vscode-testing-iconQueued, #b7791f)',
  idle: 'var(--vscode-descriptionForeground, #6b7280)',
  glowCyan: '0 8px 18px rgba(0,0,0,0.10)',
  glowMagenta: '0 8px 18px rgba(0,0,0,0.08)',
};

const statusText: Record<string, string> = {
  idle: '空闲',
  pending: '等待',
  waiting: '等待',
  running: '运行中',
  success: '成功',
  passed: '成功',
  failed: '失败',
  stopped: '已停止',
  skipped: '已跳过',
  completed: '已完成',
};

const runStatusOptions: Array<{ value: OverviewRunState; label: string }> = [
  { value: 'idle', label: '等待' },
  { value: 'running', label: '运行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'stopped', label: '已停止' },
];

function getStatusColor(status?: string): string {
  if (status === 'success' || status === 'passed' || status === 'completed') {
    return themeStyles.success;
  }
  if (status === 'running') {
    return themeStyles.accent;
  }
  if (status === 'failed' || status === 'stopped') {
    return themeStyles.error;
  }
  if (status === 'skipped') {
    return themeStyles.idle;
  }
  return themeStyles.idle;
}

function makePendingEcoRuntime(flowKey: PipelineFlowKey, task: Pick<PipelineTask, 'command'>): PipelineEcoRuntime {
  const commandName = task.command.trim().split(/\s+/)[0];
  const runFlowScript = /^run_flow_[A-Za-z0-9_-]+$/.test(commandName)
    ? commandName
    : flowKey === 'verification'
      ? 'run_flow_lander'
      : `run_flow_${flowKey}`;
  const makeHook = (phase: PipelineEcoPhase) => ({
    phase,
    status: 'pending' as const,
    attempts: 0,
  });
  return {
    scriptName: `${runFlowScript}_eco`,
    before: makeHook('before'),
    after: makeHook('after'),
  };
}

function formatStartTime(time?: number): string {
  if (!time) {
    return '--:--:--';
  }
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function metricSeed(parts: Array<string | number | undefined>): number {
  return hashString(parts.map((part) => String(part ?? '')).join('|'));
}

// Initial tasks and links fallback functions removed, configurations now load dynamically from workspace YAML files via runtime snapshots.

function getTaskMetrics(task: PipelineTask) {
  const seed = metricSeed([task.id, task.name, task.status, task.startedAt, task.finishedAt, task.duration]);
  if (task.status === 'running') {
    return {
      cpu: `${(seed % 15) + 10}%`,
      mem: `${((seed % 12) / 10 + 0.4).toFixed(1)}GB`,
    };
  }
  if (['success', 'passed', 'completed'].includes(task.status)) {
    const mockCpu = (seed % 15) + 8;
    const mockMem = ((seed % 10) / 10 + 0.3).toFixed(1);
    return {
      cpu: `${mockCpu}%`,
      mem: `${mockMem}GB`,
    };
  }
  return { cpu: '--', mem: '--' };
}

function getModuleRuntime(run: PipelineRunOverview) {
  if (!run.startedAt) return '--';
  const end = run.finishedAt || Date.now();
  const diffMs = end - run.startedAt;
  if (diffMs < 0) return '0.0s';
  return (diffMs / 1000).toFixed(1) + 's';
}

function summarizeRuntime(
  moduleKey: string,
  flowKey: PipelineFlowKey,
  flowLabel: string,
  runtime?: PipelineRuntimeSnapshot,
): PipelineRunOverview {
  const total = runtime?.tasks.length || 0;
  const tasks = runtime?.tasks || [];
  const links = runtime?.links || [];

  let completed = 0;
  let failed = 0;
  tasks.forEach((task) => {
    if (
      task.status === 'success' ||
      task.status === 'failed' ||
      task.status === 'stopped' ||
      task.status === 'skipped'
    ) {
      completed += 1;
    }
    if (task.status === 'failed') {
      failed += 1;
    }
  });
  const runtimeSeed = metricSeed([runtime?.runId, moduleKey, runtime?.updatedAt]);
  const cpu = runtime?.runState === 'running' ? (runtimeSeed % 40) + 30 : 0;
  const mem = runtime?.runState === 'running' ? Number(((runtimeSeed % 40) / 10 + 2).toFixed(1)) : 0;

  return {
    runId: runtime?.runId,
    flowLabel: runtime?.flowLabel ?? flowLabel,
    moduleKey,
    runState: runtime?.runState ?? 'idle',
    total,
    completed,
    failed,
    startedAt: runtime?.startedAt,
    finishedAt: runtime?.finishedAt,
    updatedAt: runtime?.updatedAt,
    tasks,
    links,
    cpu,
    mem,
  };
}

function getTaskHierarchy(run: PipelineRunOverview) {
  const taskById = new Map(run.tasks.map((task) => [task.id, task]));
  const taskIds = new Set(taskById.keys());
  const outgoingCount = run.links.reduce<Record<string, number>>((acc, link) => {
    if (taskIds.has(link.source) && taskIds.has(link.target)) {
      acc[link.source] = (acc[link.source] ?? 0) + 1;
    }
    return acc;
  }, {});
  const childrenByParent = new Map<string, PipelineTask[]>();
  const parentByChild = new Map<string, string>();

  run.links.forEach((link) => {
    if (!taskIds.has(link.source) || !taskIds.has(link.target) || (outgoingCount[link.source] ?? 0) < 2) {
      return;
    }
    const child = taskById.get(link.target);
    if (!child || parentByChild.has(child.id)) {
      return;
    }
    parentByChild.set(child.id, link.source);
    childrenByParent.set(link.source, [...(childrenByParent.get(link.source) ?? []), child]);
  });

  const childIds = new Set(parentByChild.keys());
  const topLevelTasks = run.tasks.filter((task) => !childIds.has(task.id));

  return { topLevelTasks, childrenByParent, parentByChild };
}

function getAncestorIds(taskId: string, parentByChild: Map<string, string>): string[] {
  const ancestors: string[] = [];
  let current = parentByChild.get(taskId);
  while (current) {
    ancestors.push(current);
    current = parentByChild.get(current);
  }
  return ancestors;
}

function getStepTerminalTitle(flowLabel: string, moduleKey: string, runId: string): string {
  return `${flowLabel} / ${moduleKey} / ${runId}`;
}

function getTrackTaskId(run: PipelineRunOverview, parentByChild: Map<string, string>): string | undefined {
  let runningTask: PipelineTask | undefined;
  let stoppedTask: PipelineTask | undefined;
  let pendingTask: PipelineTask | undefined;
  for (const task of run.tasks) {
    if (task.status === 'failed') {
      return parentByChild.get(task.id) ?? task.id;
    }
    if (!runningTask && task.status === 'running') {
      runningTask = task;
    } else if (!stoppedTask && task.status === 'stopped') {
      stoppedTask = task;
    } else if (!pendingTask && task.status === 'pending') {
      pendingTask = task;
    }
  }
  const activeTask = runningTask ?? stoppedTask ?? pendingTask;
  if (!activeTask) {
    return undefined;
  }
  return parentByChild.get(activeTask.id) ?? activeTask.id;
}

const PipelineExecutionOverview: React.FC<PipelineExecutionOverviewProps> = ({
  flowKey,
  flowLabel,
  moduleKeys,
  moduleWorkDirs,
  defaultTasksByModule,
  activeModuleKey: externalActiveModuleKey,
  onActiveModuleChange,
}) => {
  const selectedModuleKeys = useMemo(() => {
    const cleanKeys = moduleKeys.map((key) => key.trim()).filter(Boolean);
    return Array.from(new Set(cleanKeys));
  }, [moduleKeys]);

  const runtimes = usePipelineRuntimeStore(
    useShallow((state) => {
      const subset: Record<string, PipelineRuntimeSnapshot> = {};
      Object.entries(state.runtimes).forEach(([key, runtime]) => {
        if (runtime.flowKey === flowKey && selectedModuleKeys.includes(runtime.moduleKey)) {
          subset[key] = runtime;
        }
      });
      return subset;
    })
  );
  const ensureRuntime = usePipelineRuntimeStore((state) => state.ensureRuntime);
  const selectRuntimeTask = usePipelineRuntimeStore((state) => state.selectTask);
  const stopRun = usePipelineRuntimeStore((state) => state.stopRun);
  const [activeModuleKey, setActiveModuleKey] = useState<string>();
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
  const [expandedEcoTaskKeys, setExpandedEcoTaskKeys] = useState<Set<string>>(() => new Set());
  const [peakMetrics, setPeakMetrics] = useState<Record<string, { maxCpu: number; maxMem: number }>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilters, setStatusFilters] = useState<OverviewRunState[]>([]);
  const [searchText, setSearchText] = useState('');
  const taskDetailRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const getFlowLabel = useCallback((_moduleKey: string) => flowLabel, [flowLabel]);

  useEffect(() => {
    selectedModuleKeys.forEach((moduleKey) => {
      ensureRuntime(flowKey, moduleKey, getFlowLabel(moduleKey), defaultTasksByModule?.[moduleKey]);
    });
  }, [defaultTasksByModule, flowKey, selectedModuleKeys, ensureRuntime, getFlowLabel]);

  const visibleRuns = useMemo(() => (
    selectedModuleKeys
    .filter(moduleKey => !moduleKey.includes('@') || Object.values(runtimes).some(runtime => runtime.moduleKey === moduleKey && runtime.runId))
    .flatMap((moduleKey) => {
      const moduleRuntimes = Object.values(runtimes)
        .filter((runtime) => runtime.moduleKey === moduleKey && runtime.runId)
        .sort((left, right) => (right.startedAt ?? right.updatedAt) - (left.startedAt ?? left.updatedAt));
      const draftRuntime = runtimes[getPipelineRuntimeKey(flowKey, moduleKey)];
      const sourceRuntimes = moduleRuntimes.length > 0 ? moduleRuntimes : [draftRuntime];
      const defaultTasks = defaultTasksByModule?.[moduleKey];
      return sourceRuntimes.map((runtime) => {
        const runtimeTasksById = new Map(runtime?.tasks.map((task) => [task.id, task]));
        const effectiveRuntime = runtime?.runState === 'idle' && defaultTasks?.length
          ? {
            ...runtime,
            tasks: defaultTasks.map((task) => ({
              ...task,
              status: 'pending' as const,
              attempts: 1,
              eco: runtimeTasksById.get(task.id)?.eco ?? makePendingEcoRuntime(flowKey, task),
            })),
            links: defaultTasks.slice(1).map((task, index) => ({
              source: defaultTasks[index].id,
              target: task.id,
            })),
          }
          : runtime;
        return summarizeRuntime(moduleKey, flowKey, getFlowLabel(moduleKey), effectiveRuntime);
      });
    })
  ), [defaultTasksByModule, flowKey, getFlowLabel, runtimes, selectedModuleKeys]);

  const getRunIdentity = useCallback(
    (run: PipelineRunOverview) => run.runId ?? getPipelineRuntimeKey(flowKey, run.moduleKey),
    [flowKey],
  );
  const activeModuleData = visibleRuns.find((run) => getRunIdentity(run) === activeModuleKey);
  const activeHierarchy = useMemo(() => {
    return activeModuleData ? getTaskHierarchy(activeModuleData) : undefined;
  }, [activeModuleData]);

  const activeRunId = activeModuleData?.runId;
  const activeRunUpdatedAt = activeModuleData?.updatedAt;
  const selectedTask = activeModuleData?.tasks.find((task) => task.id === selectedTaskId);
  const selectedNodeName = selectedTask?.name || selectedTask?.id;
  useEffect(() => {
    parseExecutionHistoryDiagnostics(flowKey, activeRunId, selectedNodeName);
  }, [activeModuleKey, activeRunId, activeRunUpdatedAt, flowKey, selectedNodeName]);

  const filteredRuns = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    const selectedStatuses = new Set(statusFilters);
    return visibleRuns.filter((run) => {
      const matchesStatus = !statusFilters.length || selectedStatuses.has(run.runState);
      const matchesSearch = !term || run.moduleKey.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [searchText, statusFilters, visibleRuns]);

  const pagedRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRuns.slice(start, start + pageSize).map((run) => {
      const hierarchy = getTaskHierarchy(run);
      const trackTasks = hierarchy.topLevelTasks.length ? hierarchy.topLevelTasks : run.tasks;
      const trackTaskId = getTrackTaskId(run, hierarchy.parentByChild);
      let trackTaskIndex = -1;
      let completedTrackTasks = 0;

      trackTasks.forEach((task, index) => {
        if (task.id === trackTaskId) {
          trackTaskIndex = index;
        }
        if (
          task.status === 'success' ||
          task.status === 'failed' ||
          task.status === 'stopped' ||
          task.status === 'skipped'
        ) {
          completedTrackTasks += 1;
        }
      });

      const counterText = `${Math.min(Math.max(trackTaskIndex + 1, completedTrackTasks), trackTasks.length)}/${trackTasks.length}`;
      return { counterText, hierarchy, run, trackTasks };
    });
  }, [currentPage, filteredRuns, pageSize]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredRuns.length / pageSize));
    if (currentPage > lastPage) setCurrentPage(lastPage);
  }, [currentPage, filteredRuns.length, pageSize]);

  useEffect(() => {
    if (!activeModuleKey || filteredRuns.some((run) => getRunIdentity(run) === activeModuleKey)) return;
    setActiveModuleKey(filteredRuns[0] ? getRunIdentity(filteredRuns[0]) : undefined);
  }, [activeModuleKey, filteredRuns, getRunIdentity]);



  const activateModule = useCallback((run: PipelineRunOverview) => {
    setActiveModuleKey(getRunIdentity(run));
    onActiveModuleChange?.(run.moduleKey);
  }, [getRunIdentity, onActiveModuleChange]);

  useEffect(() => {
    if (externalActiveModuleKey) {
      const matchingRun = visibleRuns.find((run) => run.moduleKey === externalActiveModuleKey);
      const activeMatchesExternal = visibleRuns.some(
        (run) => getRunIdentity(run) === activeModuleKey && run.moduleKey === externalActiveModuleKey,
      );
      if (matchingRun && !activeMatchesExternal) {
        setActiveModuleKey(getRunIdentity(matchingRun));
      }
      const selectedIndex = visibleRuns.findIndex((run) => run.moduleKey === externalActiveModuleKey);
      if (selectedIndex >= 0) {
        setCurrentPage(Math.floor(selectedIndex / pageSize) + 1);
      }
    } else if (visibleRuns.length && !activeModuleKey) {
      setActiveModuleKey(getRunIdentity(visibleRuns[0]));
    }
  }, [activeModuleKey, externalActiveModuleKey, getRunIdentity, pageSize, visibleRuns]);

  useEffect(() => {
    visibleRuns.forEach((run) => {
      if (run.runState !== 'running') {
        return;
      }
      setPeakMetrics((prev) => {
        const runKey = getRunIdentity(run);
        const current = prev[runKey] || { maxCpu: 0, maxMem: 0 };
        if (run.cpu <= current.maxCpu && run.mem <= current.maxMem) {
          return prev;
        }
        return {
          ...prev,
          [runKey]: {
            maxCpu: Math.max(current.maxCpu, run.cpu),
            maxMem: Math.max(current.maxMem, run.mem),
          },
        };
      });
    });
  }, [getRunIdentity, visibleRuns]);

  const selectStep = useCallback((run: PipelineRunOverview, taskId: string) => {
    const hierarchy = getTaskHierarchy(run);
    const ancestorIds = getAncestorIds(taskId, hierarchy.parentByChild);
    activateModule(run);
    setSelectedTaskId(taskId);
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      ancestorIds.forEach((id) => next.add(id));
      if ((hierarchy.childrenByParent.get(taskId)?.length ?? 0) > 0) {
        next.add(taskId);
      }
      return next;
    });
    if (run.runId) {
      selectRuntimeTask(flowKey, run.moduleKey, run.runId, taskId);
    }
    if (run.runId) {
      revealExecutionHistory(flowKey, run.runId);
    }

    const task = run.tasks.find((t) => t.id === taskId);
    if (task && run.runId && task.status !== 'pending' && task.status !== 'skipped') {
      void openExecutionTerminal({
        title: getStepTerminalTitle(flowLabel, run.moduleKey, run.runId),
        cwd: moduleWorkDirs?.[run.moduleKey],
      });
    }

    window.requestAnimationFrame(() => {
      taskDetailRefs.current[taskId]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [activateModule, flowKey, flowLabel, moduleWorkDirs, selectRuntimeTask]);

  const toggleExpanded = useCallback((taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const toggleEcoExpanded = useCallback((runKey: string, taskId: string) => {
    const key = `${runKey}:${taskId}`;
    setExpandedEcoTaskKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!activeModuleData) {
      setSelectedTaskId(undefined);
      return;
    }
    let runningTask: PipelineTask | undefined;
    let preferredTask = activeModuleData.tasks[0];
    for (const task of activeModuleData.tasks) {
      if (task.status === 'failed') {
        preferredTask = task;
        break;
      }
      if (!runningTask && task.status === 'running') {
        runningTask = task;
      }
    }
    preferredTask = preferredTask?.status === 'failed' ? preferredTask : runningTask ?? preferredTask;
    if (!selectedTaskId || !activeModuleData.tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(preferredTask?.id);
    }
  }, [activeModuleData, selectedTaskId]);

  useEffect(() => {
    if (!activeModuleData || !activeHierarchy) {
      return;
    }
    const autoExpanded = new Set<string>();
    activeModuleData.tasks.forEach((task) => {
      if (task.status === 'running' || task.status === 'failed') {
        getAncestorIds(task.id, activeHierarchy.parentByChild).forEach((id) => autoExpanded.add(id));
        if ((activeHierarchy.childrenByParent.get(task.id)?.length ?? 0) > 0) {
          autoExpanded.add(task.id);
        }
      }
    });
    if (autoExpanded.size) {
      setExpandedTaskIds((prev) => new Set([...prev, ...autoExpanded]));
    }
  }, [activeHierarchy, activeModuleData]);

  const runEcoHook = useCallback(async (task: PipelineTask, phase: PipelineEcoPhase) => {
    if (!activeModuleData?.runId) return;
    const result = await runPipelineTaskEcoHook({
      flowKey,
      moduleKey: activeModuleData.moduleKey,
      runId: activeModuleData.runId,
      taskId: task.id,
      phase,
      cwd: moduleWorkDirs?.[activeModuleData.moduleKey],
      stepStatus: task.status === 'failed' ? 1 : 0,
    });
    if (!result.success) {
      message.error(result.error ?? 'ECO Hook 启动失败');
    }
  }, [activeModuleData, flowKey, moduleWorkDirs]);

  const stopEcoHook = useCallback(async (task: PipelineTask, phase: PipelineEcoPhase) => {
    if (!activeModuleData?.runId) return;
    const result = await stopPipelineTaskEcoHook({
      flowKey,
      moduleKey: activeModuleData.moduleKey,
      runId: activeModuleData.runId,
      taskId: task.id,
      phase,
    });
    if (!result.success) {
      message.error(result.error ?? 'ECO Hook 停止失败');
    }
  }, [activeModuleData, flowKey]);

  const renderTaskDetail = useCallback((task: PipelineTask, depth = 0): React.ReactNode => {
    if (!activeModuleData || !activeHierarchy) {
      return null;
    }
    const children = activeHierarchy.childrenByParent.get(task.id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedTaskIds.has(task.id);
    const activeRunKey = getRunIdentity(activeModuleData);
    const ecoExpanded = expandedEcoTaskKeys.has(`${activeRunKey}:${task.id}`);
    const isSelected = selectedTaskId === task.id;
    const isRunning = task.status === 'running';
    const isChild = depth > 0;
    const color = getStatusColor(task.status);
    const metrics = getTaskMetrics(task);
    const relationLabel = hasChildren ? '父步骤' : isChild ? '子步骤' : undefined;
    const isExcluded = false;
    const opacity = task.status === 'skipped' ? 0.55 : 1;

    return (
      <div
        key={task.id}
        style={{
          position: 'relative',
          marginLeft: isChild ? Math.min(depth, 3) * 12 : 0,
          paddingLeft: isChild ? 10 : 0,
        }}
      >
        {isChild && (
          <>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: -8,
                bottom: -8,
                borderLeft: `1px solid ${themeStyles.border}`,
                opacity: 0.95,
              }}
            />
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: 16,
                width: 8,
                borderTop: `1px solid ${themeStyles.border}`,
                opacity: 0.95,
              }}
            />
          </>
        )}
        <div
          ref={(node) => { taskDetailRefs.current[task.id] = node; }}
          onClick={() => selectStep(activeModuleData, task.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '4px 8px',
            border: `1px solid ${isSelected ? themeStyles.selectedBorder : isRunning ? themeStyles.accentBorder : themeStyles.borderLight}`,
            borderLeft: `${hasChildren && !isChild ? 4 : 3}px solid ${isExcluded ? themeStyles.idle : color}`,
            borderRadius: 4,
            background: isSelected
              ? themeStyles.selectedBg
              : isRunning
                ? 'var(--vscode-list-hoverBackground, rgba(127,127,127,0.10))'
                : hasChildren
                  ? `linear-gradient(90deg, ${themeStyles.metricBg}, ${themeStyles.panelBg})`
                  : themeStyles.panelBg,
            boxShadow: isSelected ? themeStyles.selectedShadow : isRunning ? themeStyles.glowCyan : 'none',
            cursor: 'pointer',
            transition: 'all 0.12s ease',
            opacity,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            {task.eco ? (
              <Tooltip title={ecoExpanded ? '收起 ECO' : '展开 ECO'}>
                <Button
                  size="small"
                  type="text"
                  aria-label={ecoExpanded ? '收起 ECO' : '展开 ECO'}
                  aria-expanded={ecoExpanded}
                  icon={ecoExpanded
                    ? <CaretDownOutlined style={{ fontSize: 10 }} />
                    : <CaretRightOutlined style={{ fontSize: 10 }} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleEcoExpanded(activeRunKey, task.id);
                  }}
                  style={{
                    color: isSelected ? themeStyles.selectedFg : themeStyles.textSecondary,
                    width: 14,
                    height: 18,
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 14px',
                  }}
                />
              </Tooltip>
            ) : (
              <span style={{ width: 14, flex: '0 0 14px' }} />
            )}
            {hasChildren ? (
              <Button
                size="small"
                type="text"
                aria-label={expanded ? '折叠子任务' : '展开子任务'}
                icon={expanded ? <CaretDownOutlined style={{ fontSize: 9 }} /> : <CaretRightOutlined style={{ fontSize: 9 }} />}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpanded(task.id);
                }}
                style={{
                  color: isSelected ? themeStyles.selectedFg : themeStyles.accentText,
                  width: 16,
                  height: 16,
                  padding: 0,
                  border: `1px solid ${themeStyles.borderLight}`,
                  background: themeStyles.metricBg,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
            ) : (
              <span style={{ width: 16, flex: '0 0 16px' }} />
            )}
            {task.status === 'success' ? (
              <CheckCircleOutlined style={{ color, fontSize: 15 }} />
            ) : task.status === 'running' ? (
              <SyncOutlined spin style={{ color, fontSize: 15 }} />
            ) : task.status === 'failed' || task.status === 'stopped' ? (
              <CloseCircleOutlined style={{ color, fontSize: 15 }} />
            ) : (
              <ClockCircleOutlined style={{ color: isExcluded ? themeStyles.idle : color, fontSize: 15 }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <span style={{ color: isSelected ? themeStyles.selectedFg : themeStyles.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: isSelected ? 700 : 500, fontSize: 13 }}>
                {task.name || task.id}
              </span>
              {(task.status === 'running' || task.status === 'success' || task.status === 'failed') && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', fontSize: 11, color: isSelected ? themeStyles.selectedFg : themeStyles.textSecondary, marginTop: 2, opacity: 0.85, fontFamily: 'monospace' }}>
                  <span>CPU: {metrics.cpu}</span>
                  <span>MEM: {metrics.mem}</span>
                  {task.startedAt && <span>开始: {task.startedAt}</span>}
                  {task.duration && <span>用时: {task.duration}</span>}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {relationLabel && (
              <Tag style={{ margin: 0, color: themeStyles.textSecondary, borderColor: themeStyles.borderLight, background: themeStyles.metricBg, fontFamily: 'monospace', fontSize: 10, padding: '0 2px', height: 16, lineHeight: '14px' }}>
                {relationLabel}
              </Tag>
            )}
            {hasChildren && (
              <Tag style={{ margin: 0, color: themeStyles.textSecondary, borderColor: themeStyles.borderLight, background: themeStyles.metricBg, fontFamily: 'monospace', fontSize: 10, padding: '0 2px', height: 16, lineHeight: '14px' }}>
                {children.length}子项
              </Tag>
            )}
            <Tag style={{ margin: 0, color: isExcluded ? themeStyles.idle : color, borderColor: isExcluded ? themeStyles.borderLight : `${color}66`, background: themeStyles.metricBg, fontFamily: 'monospace', fontSize: 10, padding: '0 2px', height: 16, lineHeight: '14px' }}>
              {isExcluded ? '排除' : (statusText[task.status] ?? task.status)}
            </Tag>
          </div>
        </div>
        {ecoExpanded && task.eco && (
          <div
            style={{
              marginTop: 2,
              marginLeft: isChild ? 28 : 20,
              padding: '3px 0 3px 8px',
              borderLeft: `2px solid ${themeStyles.borderLight}`,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 5,
            }}
          >
            <span style={{ color: themeStyles.textMuted, fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>
              ECO
            </span>
            {(['before', 'after'] as const).map((phase) => {
              const hook = task.eco![phase];
              const hookColor = getStatusColor(hook.status);
              const running = hook.status === 'running';
              const hasRunningEco = activeModuleData.tasks.some(
                (item) => item.eco?.before.status === 'running' || item.eco?.after.status === 'running',
              );
              const canRun = activeModuleData.runState !== 'running'
                && !hasRunningEco;
              const hookDetails = [
                hook.scriptPath ?? task.eco!.scriptName,
                hook.lastRunSource === 'manual' ? '手动执行' : hook.lastRunSource === 'pipeline' ? '流水线执行' : '',
                hook.finishedAt ?? hook.startedAt ?? '',
                hook.exitCode !== undefined ? `exit ${hook.exitCode}` : '',
              ].filter(Boolean).join(' · ');
              return (
                <div
                  key={phase}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    minHeight: 22,
                    padding: '1px 4px',
                    border: `1px solid ${themeStyles.borderLight}`,
                    borderRadius: 3,
                    background: themeStyles.panelBg,
                  }}
                >
                  {running ? (
                    <SyncOutlined spin style={{ color: hookColor, fontSize: 11 }} />
                  ) : hook.status === 'success' ? (
                    <CheckCircleOutlined style={{ color: hookColor, fontSize: 11 }} />
                  ) : hook.status === 'failed' || hook.status === 'stopped' ? (
                    <CloseCircleOutlined style={{ color: hookColor, fontSize: 11 }} />
                  ) : (
                    <ClockCircleOutlined style={{ color: themeStyles.idle, fontSize: 11 }} />
                  )}
                  <Tooltip title={hookDetails}>
                    <span style={{ color: themeStyles.textPrimary, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {phase === 'before' ? 'Before ECO' : 'After ECO'}
                    </span>
                  </Tooltip>
                  <Tag style={{ margin: 0, color: hookColor, borderColor: themeStyles.borderLight, background: themeStyles.metricBg, fontSize: 9, padding: '0 2px', height: 16, lineHeight: '14px' }}>
                    {statusText[hook.status] ?? hook.status}
                  </Tag>
                  {hook.scriptPath && (
                    <Tooltip title="打开 ECO 脚本">
                      <Button
                        size="small"
                        type="text"
                        icon={<FileTextOutlined />}
                        onClick={(event) => {
                          event.stopPropagation();
                          openFileInEditor(hook.scriptPath!);
                        }}
                        style={{ width: 20, height: 20, padding: 0 }}
                      />
                    </Tooltip>
                  )}
                  {running ? (
                    <Tooltip title="停止 ECO Hook">
                      <Button
                        size="small"
                        danger
                        icon={<PauseCircleOutlined />}
                        onClick={(event) => {
                          event.stopPropagation();
                          void stopEcoHook(task, phase);
                        }}
                        style={{ width: 20, height: 20, padding: 0 }}
                      />
                    </Tooltip>
                  ) : (
                    <Tooltip title={hook.attempts > 0 ? '重跑 ECO Hook' : '单独运行 ECO Hook'}>
                      <Button
                        size="small"
                        type={hook.status === 'failed' ? 'primary' : 'default'}
                        icon={hook.attempts > 0 ? <ReloadOutlined /> : <PlayCircleOutlined />}
                        disabled={!canRun}
                        onClick={(event) => {
                          event.stopPropagation();
                          void runEcoHook(task, phase);
                        }}
                        style={{ width: 20, height: 20, padding: 0 }}
                      />
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hasChildren && expanded && (
          <div
            style={{
              marginTop: 5,
              display: 'grid',
              gap: 5,
            }}
          >
            {children.map((child) => renderTaskDetail(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }, [
    activeHierarchy,
    activeModuleData,
    expandedEcoTaskKeys,
    expandedTaskIds,
    selectStep,
    selectedTaskId,
    runEcoHook,
    stopEcoHook,
    toggleEcoExpanded,
    toggleExpanded,
  ]);

  if (!visibleRuns.length) {
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先在关注模块中选择要显示的模块" />
    );
  }

  return (
    <>
      <style>
        {`
          @keyframes dftPipelineStepPulse {
            0%, 100% {
              transform: scale(1);
              box-shadow: 0 0 0 0 rgba(35, 134, 54, 0.32);
            }
            50% {
              transform: scale(1.18);
              box-shadow: 0 0 0 5px rgba(35, 134, 54, 0);
            }
          }
          .dft-pipeline-step-dot:hover,
          .dft-pipeline-step-dot:focus-visible {
            transform: scale(1.18);
            box-shadow: 0 0 0 3px rgba(30, 144, 255, 0.22);
            outline: none;
          }
        `}
      </style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Dropdown
          trigger={['click']}
          menu={{
            multiple: true,
            selectable: true,
            selectedKeys: statusFilters,
            items: runStatusOptions.map((option) => ({ key: option.value, label: option.label })),
            onSelect: ({ selectedKeys }) => {
              setStatusFilters(selectedKeys as OverviewRunState[]);
              setCurrentPage(1);
            },
            onDeselect: ({ selectedKeys }) => {
              setStatusFilters(selectedKeys as OverviewRunState[]);
              setCurrentPage(1);
            },
          }}
        >
          <Button size={'small'} icon={<FilterOutlined />} type={statusFilters.length ? 'primary' : 'default'}>
            Status{statusFilters.length ? ` (${statusFilters.length})` : ''}
          </Button>
        </Dropdown>
        <Input
          allowClear
          size={'small'}
          prefix={<SearchOutlined />}
          placeholder={`搜索 ${flowKey === 'verification' ? 'mode' : 'module'}`}
          value={searchText}
          onChange={(event) => {
            setSearchText(event.target.value);
            setCurrentPage(1);
          }}
          style={{ width: 240 }}
        />
      </div>
      <Row
      gutter={12}
      style={{
        position: 'relative',
        padding: 10,
        borderRadius: 8,
        border: `1px solid ${themeStyles.border}`,
        background: themeStyles.shellBg,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04), ${themeStyles.glowCyan}, ${themeStyles.glowMagenta}`,
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(var(--vscode-panel-border, rgba(127,127,127,0.10)) 1px, transparent 1px), linear-gradient(90deg, var(--vscode-panel-border, rgba(127,127,127,0.10)) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.18,
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.38), transparent 82%)',
        }}
      />

      <Col span={16}>
        <List
          size="small"
          dataSource={pagedRuns}
          rowKey={(item) => getRunIdentity(item.run)}
          renderItem={({ run, counterText, trackTasks }) => {
            const isSelected = getRunIdentity(run) === activeModuleKey;
            const statusColor = run.runState === 'running'
              ? themeStyles.accent
              : run.runState === 'completed'
                ? themeStyles.success
                : run.runState === 'failed'
                  ? themeStyles.error
                : run.runState === 'stopped'
                  ? themeStyles.warning
                  : themeStyles.idle;
            const [oriModuleKey, version] = getVersionFromModuleKey(run.moduleKey);

            return (
              <List.Item
                onClick={() => activateModule(run)}
                style={{
                  cursor: 'pointer',
                  padding: 0,
                  marginBottom: 6,
                  borderRadius: 8,
                  border: `1px solid ${isSelected ? themeStyles.selectedBorder : themeStyles.border}`,
                  background: isSelected ? themeStyles.selectedBg : themeStyles.cardBg,
                  boxShadow: isSelected ? themeStyles.selectedShadow : '0 4px 12px rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ width: '100%' }}>
                  <div
                    style={{
                      padding: '6px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      background: 'var(--vscode-list-hoverBackground, rgba(127,127,127,0.08))',
                    }}
                  >
                    <Space size={6} style={{ minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                      <span style={{ color: isSelected ? themeStyles.selectedFg : themeStyles.textPrimary, fontFamily: 'monospace', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                        {version ? oriModuleKey : run.moduleKey}
                      </span>
                      {version && <Tag>{version}</Tag>}
                    </Space>
                    <Space size={4}>
                      {run.runId && (
                        <Tag style={{ margin: 0, fontFamily: 'monospace', fontSize: 10 }}>
                          {run.runId.slice(-8)}
                        </Tag>
                      )}
                      <Tag
                        style={{
                          margin: 0,
                          color: themeStyles.accentText,
                          borderColor: themeStyles.borderLight,
                          background: themeStyles.metricBg,
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: 10,
                          padding: '0 4px',
                        }}
                      >
                        {counterText}
                      </Tag>
                      {run.runId && run.runState === 'running' && (
                        <Tooltip title="停止此实例">
                          <Button
                            danger
                            type="text"
                            size="small"
                            icon={<PauseCircleOutlined />}
                            onClick={(event) => {
                              event.stopPropagation();
                              stopRun(flowKey, run.moduleKey, run.runId!, run.flowLabel);
                            }}
                          />
                        </Tooltip>
                      )}
                    </Space>
                  </div>

                  <div style={{ padding: '5px 10px 7px', borderTop: `1px solid ${themeStyles.borderLight}` }}>
                    <div
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 3px',
                      }}
                    >
                      <span style={{ position: 'absolute', left: 8, right: 8, height: 1, background: `linear-gradient(90deg, transparent, ${themeStyles.border}, transparent)` }} />
                      {trackTasks.map((task, index) => {
                        const circleBg = getStatusColor(task.status);
                        return (
                          <Tooltip key={task.id} title={`${task.name || `步骤 ${index + 1}`} [${statusText[task.status] ?? '等待'}]`}>
                            <button
                              type="button"
                              className="dft-pipeline-step-dot"
                              aria-label={`打开步骤 ${task.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                selectStep(run, task.id);
                              }}
                              style={{
                                position: 'relative',
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                background: circleBg,
                                border: '2px solid var(--vscode-editor-background)',
                                cursor: 'pointer',
                                padding: 0,
                                zIndex: 1,
                                transition: 'transform 0.14s ease, box-shadow 0.14s ease',
                                animation: task.status === 'running' ? 'dftPipelineStepPulse 1.35s ease-in-out infinite' : undefined,
                              }}
                            />
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
        {filteredRuns.length > 0 && (
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={filteredRuns.length}
            showSizeChanger
            pageSizeOptions={['10', '20', '50']}
            size="small"
            onChange={(page, nextPageSize) => {
              setCurrentPage(page);
              setPageSize(nextPageSize);
            }}
            style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}
          />
        )}
      </Col>

      <Col span={8}>
        {activeModuleData ? (
          <div
            style={{
              position: 'relative',
              background: themeStyles.cardBg,
              border: `1px solid ${themeStyles.border}`,
              borderRadius: 8,
              minHeight: 520,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: themeStyles.glowCyan,
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                <div style={{ fontSize: 10, color: themeStyles.textMuted, fontWeight: 800, letterSpacing: 2 }}>模块流水线</div>
                <h5 style={{ margin: '2px 0 0', color: themeStyles.accentText, fontWeight: 700, fontSize: 16, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeModuleData.moduleKey}
                </h5>
              </div>
              <Tag
                style={{
                  margin: 0,
                  color: themeStyles.textSecondary,
                  borderColor: themeStyles.borderLight,
                  background: themeStyles.metricBg,
                  fontFamily: 'monospace',
                  height: 22,
                  lineHeight: '20px',
                }}
              >
                共 {activeModuleData.tasks.length} 步
              </Tag>
            </div>

            {/* Module Metrics (CPU, MEM, Start Time, Run Time) displayed in the middle column header */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', background: 'var(--vscode-list-hoverBackground, rgba(127,127,127,0.04))', padding: '6px 10px', borderRadius: 6, border: `1px solid ${themeStyles.borderLight}`, fontSize: 12, marginBottom: 10 }}>
              <div><span style={{ color: themeStyles.textSecondary }}>CPU:</span> <span style={{ fontFamily: 'monospace', color: themeStyles.textPrimary, fontWeight: 700 }}>{(peakMetrics[getRunIdentity(activeModuleData)]?.maxCpu || activeModuleData.cpu)}%</span></div>
              <div><span style={{ color: themeStyles.textSecondary }}>内存:</span> <span style={{ fontFamily: 'monospace', color: themeStyles.textPrimary, fontWeight: 700 }}>{(peakMetrics[getRunIdentity(activeModuleData)]?.maxMem || activeModuleData.mem).toFixed(1)}GB</span></div>
              <div><span style={{ color: themeStyles.textSecondary }}>开始:</span> <span style={{ fontFamily: 'monospace', color: themeStyles.textPrimary, fontWeight: 700 }}>{formatStartTime(activeModuleData.startedAt)}</span></div>
              <div><span style={{ color: themeStyles.textSecondary }}>用时:</span> <span style={{ fontFamily: 'monospace', color: themeStyles.textPrimary, fontWeight: 700 }}>{getModuleRuntime(activeModuleData)}</span></div>
            </div>

            <div
              style={{
                display: 'grid',
                gridAutoRows: 'max-content',
                alignContent: 'start',
                gap: 6,
                flex: 1,
                overflowY: 'auto',
                maxHeight: 430,
                paddingRight: 4,
              }}
            >
              {(activeHierarchy?.topLevelTasks ?? activeModuleData.tasks).map((task) => renderTaskDetail(task))}
            </div>
          </div>
        ) : (
          <div style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}`, borderRadius: 8, minHeight: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: themeStyles.glowCyan }}>
            <Space direction="vertical" align="center">
              <ClockCircleOutlined style={{ color: themeStyles.idle, fontSize: 40 }} />
              <span style={{ color: themeStyles.textSecondary, fontSize: 13 }}>请先选择执行模块</span>
            </Space>
          </div>
        )}
      </Col>

      </Row>
    </>
  );
};

export default memo(PipelineExecutionOverview);
