import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Col,
  Empty,
  List,
  Modal,
  Row,
  Slider,
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
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import usePipelineRuntimeStore, {
  PipelineFlowKey,
  PipelineRuntimeSnapshot,
  getPipelineRuntimeKey,
  subscribePipelineRuntimeUpdates,
} from '../../store/pipelineRuntimeStore';
import { PipelineLink, PipelineTask, pipelineFlowConfigs } from './pipelineMockData';
import { openExecutionTerminal } from '../../utils/ipc';

type OverviewRunState = 'idle' | 'running' | 'completed' | 'stopped';

export interface PipelineExecutionRef {
  handleExternalRun: (keys: string[]) => void;
  handleExternalStop: (keys: string[]) => void;
}

interface PipelineExecutionOverviewProps {
  flowKey: PipelineFlowKey;
  flowLabel: string;
  moduleKeys: string[];
  activeModuleKey?: string;
  onActiveModuleChange?: (moduleKey: string) => void;
  onRetryStep?: (moduleKey: string, stepIndex: number) => void;
  onRetryFailedStep?: (moduleKey: string, stepIndex: number) => void;
  onRunSingleStep?: (moduleKey: string, stepIndex: number) => void;
  onCheckedModuleKeysChange?: (keys: string[]) => void;
}

interface PipelineRunOverview {
  moduleKey: string;
  runState: OverviewRunState;
  total: number;
  completed: number;
  failed: number;
  startedAt?: number;
  finishedAt?: number;
  logs: string[];
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

function makeTask(
  id: string,
  name: string,
  command: string,
  description: string,
  status: 'pending' | 'running' | 'success' | 'failed' | 'stopped' | 'skipped' = 'pending',
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

// Initial tasks and links fallback functions removed, configurations now load dynamically from workspace YAML files via runtime snapshots.

function getTaskMetrics(task: PipelineTask) {
  if (task.status === 'running') {
    return {
      cpu: `${Math.floor(Math.random() * 15) + 10}%`,
      mem: `${(Math.random() * 1.2 + 0.4).toFixed(1)}GB`,
    };
  }
  if (task.status === 'success' || task.status === 'passed' || task.status === 'completed') {
    const seed = task.name.charCodeAt(0) + task.name.charCodeAt(task.name.length - 1);
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
  runtime?: PipelineRuntimeSnapshot,
): PipelineRunOverview {
  const total = runtime?.tasks.length || 0;
  const tasks = runtime?.tasks || [];
  const links = runtime?.links || [];

  const completed = tasks.filter((task) =>
    task.status === 'success' ||
    task.status === 'failed' ||
    task.status === 'stopped' ||
    task.status === 'skipped'
  ).length;
  const failed = tasks.filter((task) => task.status === 'failed').length;
  const cpu = runtime?.runState === 'running' ? Math.floor(Math.random() * 40) + 30 : 0;
  const mem = runtime?.runState === 'running' ? Number((Math.random() * 4 + 2).toFixed(1)) : 0;

  return {
    moduleKey,
    runState: runtime?.runState ?? 'idle',
    total,
    completed,
    failed,
    startedAt: runtime?.startedAt,
    finishedAt: runtime?.finishedAt,
    logs: runtime?.logs.length ? runtime.logs : [`${moduleKey} is queued and waiting to start.`],
    tasks,
    links,
    cpu,
    mem,
  };
}

function getTaskHierarchy(run: PipelineRunOverview) {
  const taskIds = new Set(run.tasks.map((task) => task.id));
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
    const child = run.tasks.find((task) => task.id === link.target);
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

function getTrackTaskId(run: PipelineRunOverview, parentByChild: Map<string, string>): string | undefined {
  const activeTask =
    run.tasks.find((task) => task.status === 'failed') ??
    run.tasks.find((task) => task.status === 'running') ??
    run.tasks.find((task) => task.status === 'stopped') ??
    run.tasks.find((task) => task.status === 'pending');
  if (!activeTask) {
    return undefined;
  }
  return parentByChild.get(activeTask.id) ?? activeTask.id;
}

function getTaskDisplayInfo(run: PipelineRunOverview, stoppedSnapshots: Record<string, { taskIndex: number; taskName: string }>) {
  const stepCount = run.tasks.length;
  let currentTaskIndex = -1;
  let activeTaskName = '等待中';
  let counterText = `0/${stepCount} 空闲`;

  if (run.runState === 'running') {
    currentTaskIndex = run.tasks.findIndex((task) => task.status === 'running');
    if (currentTaskIndex === -1) {
      currentTaskIndex = run.tasks.findIndex((task) => task.status === 'pending');
    }
    if (currentTaskIndex === -1) {
      currentTaskIndex = Math.min(run.completed, Math.max(stepCount - 1, 0));
    }
    activeTaskName = run.tasks[currentTaskIndex]?.name || '运行中';
    counterText = `${Math.min(currentTaskIndex + 1, stepCount)}/${stepCount} 运行中`;
  } else if (run.runState === 'completed') {
    currentTaskIndex = stepCount - 1;
    activeTaskName = run.tasks[currentTaskIndex]?.name || '已完成';
    counterText = `${stepCount}/${stepCount} 已完成`;
  } else if (run.runState === 'stopped') {
    const snapshot = stoppedSnapshots[run.moduleKey];
    currentTaskIndex = snapshot?.taskIndex ?? Math.max(run.completed - 1, 0);
    activeTaskName = snapshot?.taskName || run.tasks[currentTaskIndex]?.name || '已停止';
    counterText = `${Math.min(currentTaskIndex + 1, stepCount)}/${stepCount} 已停止`;
  }

  return { currentTaskIndex, activeTaskName, counterText };
}

const PipelineExecutionOverview = forwardRef<PipelineExecutionRef, PipelineExecutionOverviewProps>(({
  flowKey,
  flowLabel,
  moduleKeys,
  activeModuleKey: externalActiveModuleKey,
  onActiveModuleChange,
  onRetryStep,
  onRetryFailedStep,
  onRunSingleStep,
  onCheckedModuleKeysChange,
}, ref) => {
  useEffect(() => {
    subscribePipelineRuntimeUpdates();
  }, []);

  const runtimes = usePipelineRuntimeStore((state) => state.runtimes);
  const ensureRuntime = usePipelineRuntimeStore((state) => state.ensureRuntime);
  const startRuntime = usePipelineRuntimeStore((state) => state.startRuntime);
  const stopRuntime = usePipelineRuntimeStore((state) => state.stopRuntime);
  const selectRuntimeTask = usePipelineRuntimeStore((state) => state.selectTask);
  const [activeModuleKey, setActiveModuleKey] = useState<string>();
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
  const [peakMetrics, setPeakMetrics] = useState<Record<string, { maxCpu: number; maxMem: number }>>({});
  const [stoppedTaskSnapshots, setStoppedTaskSnapshots] = useState<Record<string, { taskIndex: number; taskName: string }>>({});
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runModalTargets, setRunModalTargets] = useState<string[]>([]);
  const [runModalRange, setRunModalRange] = useState<[number, number]>([0, 0]);
  const taskDetailRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selectedModuleKeys = useMemo(() => {
    const cleanKeys = moduleKeys.map((key) => key.trim()).filter(Boolean);
    return Array.from(new Set(cleanKeys));
  }, [moduleKeys]);

  const [checkedModuleKeys, setCheckedModuleKeys] = useState<Set<string>>(() => new Set(selectedModuleKeys));

  useEffect(() => {
    setCheckedModuleKeys(new Set(selectedModuleKeys));
  }, [selectedModuleKeys]);

  const getFlowLabel = useCallback((moduleKey: string) => `${flowLabel} / ${moduleKey}`, [flowLabel]);

  const ensureRuntimeVisible = useCallback((moduleKey: string) => {
    ensureRuntime(flowKey, moduleKey, getFlowLabel(moduleKey));
  }, [ensureRuntime, flowKey, getFlowLabel]);

  useEffect(() => {
    selectedModuleKeys.forEach((moduleKey) => {
      ensureRuntime(flowKey, moduleKey, getFlowLabel(moduleKey));
    });
  }, [flowKey, selectedModuleKeys, ensureRuntime, getFlowLabel]);

  const displayedModuleKeys = useMemo(() => {
    const keys = [...selectedModuleKeys];
    if (activeModuleKey && !keys.includes(activeModuleKey)) {
      keys.unshift(activeModuleKey);
    }
    return keys;
  }, [selectedModuleKeys, activeModuleKey]);

  const visibleRuns = useMemo(() => (
    displayedModuleKeys.map((moduleKey) => {
      const runtime = runtimes[getPipelineRuntimeKey(flowKey, moduleKey)];
      return summarizeRuntime(moduleKey, flowKey, runtime);
    })
  ), [flowKey, runtimes, displayedModuleKeys]);

  const activeModuleData = visibleRuns.find((run) => run.moduleKey === activeModuleKey);
  const activeHierarchy = activeModuleData ? getTaskHierarchy(activeModuleData) : undefined;
  const selectedTask = activeModuleData?.tasks.find((task) => task.id === selectedTaskId);



  const activateModule = useCallback((moduleKey: string) => {
    setActiveModuleKey(moduleKey);
    onActiveModuleChange?.(moduleKey);
  }, [onActiveModuleChange]);

  const prepareRun = useCallback((targets: string[]) => {
    setRunModalTargets(targets);
    const targetKey = targets[0];
    const runtime = runtimes[getPipelineRuntimeKey(flowKey, targetKey)] || activeModuleData;
    const tasks = runtime?.tasks || [];
    if (tasks.length > 0) {
      setRunModalRange([0, tasks.length - 1]);
    } else {
      setRunModalRange([0, 0]);
    }
    setRunModalOpen(true);
  }, [activeModuleData, flowKey, runtimes]);

  const confirmRunModal = useCallback(() => {
    const targetKey = runModalTargets[0];
    const runtime = runtimes[getPipelineRuntimeKey(flowKey, targetKey)] || activeModuleData;
    const tasks = runtime?.tasks || [];
    const targetTasks = tasks.slice(runModalRange[0], runModalRange[1] + 1);
    const selectedTaskIds = targetTasks.length > 0 ? targetTasks.map((t) => t.id) : undefined;

    runModalTargets.forEach((moduleKey) => {
      setPeakMetrics((prev) => ({ ...prev, [moduleKey]: { maxCpu: 0, maxMem: 0 } }));
      setStoppedTaskSnapshots((prev) => {
        const next = { ...prev };
        delete next[moduleKey];
        return next;
      });
      ensureRuntimeVisible(moduleKey);
      startRuntime(flowKey, moduleKey, getFlowLabel(moduleKey), selectedTaskIds);
    });

    if (runModalTargets.length === 1) {
      activateModule(runModalTargets[0]);
    }
    setRunModalOpen(false);
  }, [runModalTargets, runModalRange, runtimes, flowKey, activeModuleData, ensureRuntimeVisible, getFlowLabel, startRuntime, activateModule]);

  const stopRun = useCallback((moduleKey: string) => {
    const runtime = runtimes[getPipelineRuntimeKey(flowKey, moduleKey)];
    const tasks = runtime?.tasks ?? [];
    let runningIndex = tasks.findIndex((task) => task.status === 'running');
    if (runningIndex === -1) {
      runningIndex = Math.max(tasks.findIndex((task) => task.status === 'pending'), 0);
    }
    setStoppedTaskSnapshots((prev) => ({
      ...prev,
      [moduleKey]: {
        taskIndex: runningIndex,
        taskName: tasks[runningIndex]?.name || `Task ${runningIndex + 1}`,
      },
    }));
    ensureRuntimeVisible(moduleKey);
    stopRuntime(flowKey, moduleKey, getFlowLabel(moduleKey));
  }, [ensureRuntimeVisible, flowKey, getFlowLabel, runtimes, stopRuntime]);

  const handleSingleRunClick = useCallback((moduleKey: string) => {
    const runtime = runtimes[getPipelineRuntimeKey(flowKey, moduleKey)];
    if (runtime?.runState === 'running') {
      Modal.confirm({
        title: '确认重新运行',
        content: `模块 ${moduleKey} 当前正在运行，是否要结束当前运行并重新开始？`,
        okText: '确定并重新开始',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => {
          stopRun(moduleKey);
          setTimeout(() => {
            prepareRun([moduleKey]);
          }, 150);
        },
      });
    } else {
      prepareRun([moduleKey]);
    }
  }, [runtimes, flowKey, stopRun, prepareRun]);

  const handleBatchRun = useCallback(() => {
    const keysToRun = Array.from(checkedModuleKeys);
    if (keysToRun.length === 0) return;

    const runningKeys = keysToRun.filter((key) => {
      const runtime = runtimes[getPipelineRuntimeKey(flowKey, key)];
      return runtime?.runState === 'running';
    });

    const proceedRun = (keys: string[]) => {
      prepareRun(keys);
    };

    if (runningKeys.length > 0) {
      Modal.confirm({
        title: '确认批量重新运行',
        content: `模块 ${runningKeys.join(', ')} 正在运行中，是否结束运行并重新开始？`,
        okText: '确定并重新开始',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => {
          runningKeys.forEach((key) => stopRun(key));
          setTimeout(() => {
            proceedRun(keysToRun);
          }, 150);
        },
      });
    } else {
      proceedRun(keysToRun);
    }
  }, [checkedModuleKeys, runtimes, flowKey, stopRun, prepareRun]);

  const handleBatchStop = useCallback(() => {
    const keysToStop = Array.from(checkedModuleKeys);
    keysToStop.forEach((key) => {
      const runtime = runtimes[getPipelineRuntimeKey(flowKey, key)];
      if (runtime?.runState === 'running') {
        stopRun(key);
      }
    });
  }, [checkedModuleKeys, runtimes, flowKey, stopRun]);

  useImperativeHandle(ref, () => ({
    handleExternalRun(keys: string[], selectedTaskIds?: string[]) {
      const cleanKeys = keys.filter(Boolean);
      if (selectedTaskIds && selectedTaskIds.length > 0) {
        cleanKeys.forEach((moduleKey) => {
          setPeakMetrics((prev) => ({ ...prev, [moduleKey]: { maxCpu: 0, maxMem: 0 } }));
          setStoppedTaskSnapshots((prev) => {
            const next = { ...prev };
            delete next[moduleKey];
            return next;
          });
          ensureRuntimeVisible(moduleKey);
          startRuntime(flowKey, moduleKey, getFlowLabel(moduleKey), selectedTaskIds);
        });
        if (cleanKeys.length === 1) {
          activateModule(cleanKeys[0]);
        }
      } else {
        prepareRun(cleanKeys);
      }
    },
    handleExternalStop(keys: string[]) {
      keys.filter(Boolean).forEach(stopRun);
    },
  }), [startRuntime, ensureRuntimeVisible, stopRun, flowKey, getFlowLabel, activateModule, prepareRun]);


  useEffect(() => {
    if (externalActiveModuleKey) {
      setActiveModuleKey(externalActiveModuleKey);
    } else if (selectedModuleKeys.length && !activeModuleKey) {
      setActiveModuleKey(selectedModuleKeys[0]);
    }
  }, [activeModuleKey, externalActiveModuleKey, selectedModuleKeys]);

  useEffect(() => {
    visibleRuns.forEach((run) => {
      if (run.runState !== 'running') {
        return;
      }
      setPeakMetrics((prev) => {
        const current = prev[run.moduleKey] || { maxCpu: 0, maxMem: 0 };
        if (run.cpu <= current.maxCpu && run.mem <= current.maxMem) {
          return prev;
        }
        return {
          ...prev,
          [run.moduleKey]: {
            maxCpu: Math.max(current.maxCpu, run.cpu),
            maxMem: Math.max(current.maxMem, run.mem),
          },
        };
      });
    });
  }, [visibleRuns]);


  const selectStep = useCallback((run: PipelineRunOverview, taskId: string) => {
    const hierarchy = getTaskHierarchy(run);
    const ancestorIds = getAncestorIds(taskId, hierarchy.parentByChild);
    activateModule(run.moduleKey);
    setSelectedTaskId(taskId);
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      ancestorIds.forEach((id) => next.add(id));
      if ((hierarchy.childrenByParent.get(taskId)?.length ?? 0) > 0) {
        next.add(taskId);
      }
      return next;
    });
    selectRuntimeTask(flowKey, run.moduleKey, taskId);

    const task = run.tasks.find((t) => t.id === taskId);
    if (task && task.command) {
      void openExecutionTerminal({
        title: `${run.moduleKey} - ${task.name || task.id}`,
        command: task.command,
      });
    }

    window.requestAnimationFrame(() => {
      taskDetailRefs.current[taskId]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [activateModule, flowKey, selectRuntimeTask]);

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

  useEffect(() => {
    if (!activeModuleData) {
      setSelectedTaskId(undefined);
      return;
    }
    const preferredTask =
      activeModuleData.tasks.find((task) => task.status === 'failed') ??
      activeModuleData.tasks.find((task) => task.status === 'running') ??
      activeModuleData.tasks.find((task) => task.id === activeModuleData.tasks[0]?.id);
    if (!selectedTaskId || !activeModuleData.tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(preferredTask?.id);
    }
  }, [activeModuleData, selectedTaskId]);

  useEffect(() => {
    if (!activeModuleData) {
      return;
    }
    const hierarchy = getTaskHierarchy(activeModuleData);
    const autoExpanded = new Set<string>();
    activeModuleData.tasks.forEach((task) => {
      if (task.status === 'running' || task.status === 'failed') {
        getAncestorIds(task.id, hierarchy.parentByChild).forEach((id) => autoExpanded.add(id));
        if ((hierarchy.childrenByParent.get(task.id)?.length ?? 0) > 0) {
          autoExpanded.add(task.id);
        }
      }
    });
    if (autoExpanded.size) {
      setExpandedTaskIds((prev) => new Set([...prev, ...autoExpanded]));
    }
  }, [activeModuleData]);

  const renderTaskDetail = useCallback((task: PipelineTask, depth = 0): React.ReactNode => {
    if (!activeModuleData || !activeHierarchy) {
      return null;
    }
    const children = activeHierarchy.childrenByParent.get(task.id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedTaskIds.has(task.id);
    const isSelected = selectedTaskId === task.id;
    const isRunning = task.status === 'running';
    const isChild = depth > 0;
    const color = getStatusColor(task.status);
    const latestLog = task.logs[task.logs.length - 1];
    const relationLabel = hasChildren ? '父步骤' : isChild ? '子步骤' : undefined;
    const action = task.status === 'success'
      ? <Tooltip title="重试该步骤"><Button size="small" type="text" icon={<ReloadOutlined style={{ color: themeStyles.accentText }} />} onClick={(e) => { e.stopPropagation(); onRetryStep?.(activeModuleData.moduleKey, activeModuleData.tasks.findIndex((item) => item.id === task.id)); }} /></Tooltip>
      : task.status === 'failed'
        ? <Tooltip title="重试失败步骤"><Button size="small" type="text" icon={<ReloadOutlined style={{ color: themeStyles.error }} />} onClick={(e) => { e.stopPropagation(); onRetryFailedStep?.(activeModuleData.moduleKey, activeModuleData.tasks.findIndex((item) => item.id === task.id)); }} /></Tooltip>
        : !isRunning
          ? <Tooltip title="单步运行"><Button size="small" type="text" icon={<PlayCircleOutlined style={{ color: themeStyles.success }} />} onClick={(e) => { e.stopPropagation(); onRunSingleStep?.(activeModuleData.moduleKey, activeModuleData.tasks.findIndex((item) => item.id === task.id)); }} /></Tooltip>
          : null;

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
                  <span>CPU: {getTaskMetrics(task).cpu}</span>
                  <span>MEM: {getTaskMetrics(task).mem}</span>
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
            {action}
          </div>
        </div>
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
    expandedTaskIds,
    onRetryFailedStep,
    onRetryStep,
    onRunSingleStep,
    selectStep,
    selectedTaskId,
    toggleExpanded,
  ]);

  if (!visibleRuns.length) {
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请在左侧模块列表中选择执行模块" />
    );
  }

  return (
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

      {/* 1. Left Column: Module Panel */}
      <Col span={7}>
        {/* Batch operations toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px', gap: 8 }}>
          <Checkbox
            indeterminate={checkedModuleKeys.size > 0 && checkedModuleKeys.size < displayedModuleKeys.length}
            checked={checkedModuleKeys.size === displayedModuleKeys.length && displayedModuleKeys.length > 0}
            onChange={(e) => {
              const next = e.target.checked ? new Set(displayedModuleKeys) : new Set<string>();
              setCheckedModuleKeys(next);
              onCheckedModuleKeysChange?.(Array.from(next));
            }}
            style={{ color: themeStyles.textSecondary, fontSize: 12 }}
          >
            全选
          </Checkbox>
          <Space size={4}>
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              disabled={checkedModuleKeys.size === 0}
              onClick={handleBatchRun}
              style={{ fontSize: 11, height: 22, padding: '0 8px' }}
            >
              运行已选
            </Button>
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              disabled={checkedModuleKeys.size === 0}
              onClick={handleBatchStop}
              style={{ fontSize: 11, height: 22, padding: '0 8px' }}
            >
              停止已选
            </Button>
          </Space>
        </div>

        <List
          size="small"
          dataSource={visibleRuns}
          renderItem={(run) => {
            const isSelected = run.moduleKey === activeModuleKey;
            const runHierarchy = getTaskHierarchy(run);
            const trackTasks = runHierarchy.topLevelTasks.length ? runHierarchy.topLevelTasks : run.tasks;
            const trackTaskId = getTrackTaskId(run, runHierarchy.parentByChild);
            const trackTaskIndex = trackTasks.findIndex((task) => task.id === trackTaskId);
            const { activeTaskName } = getTaskDisplayInfo(run, stoppedTaskSnapshots);
            const completedTrackTasks = trackTasks.filter((task) =>
              task.status === 'success' ||
              task.status === 'failed' ||
              task.status === 'stopped' ||
              task.status === 'skipped'
            ).length;
            const counterStateText = run.runState === 'running'
              ? '运行中'
              : run.runState === 'completed'
                ? '已完成'
                : run.runState === 'stopped'
                  ? '已停止'
                  : '空闲';
            const counterText = `${Math.min(Math.max(trackTaskIndex + 1, completedTrackTasks), trackTasks.length)}/${trackTasks.length} ${counterStateText}`;
            const hasEnded = run.runState === 'completed' || run.runState === 'stopped';
            const peak = peakMetrics[run.moduleKey] || { maxCpu: run.cpu, maxMem: run.mem };
            const displayCpu = hasEnded ? peak.maxCpu : run.cpu;
            const displayMem = hasEnded ? peak.maxMem : run.mem;
            const statusColor = run.runState === 'running'
              ? themeStyles.accent
              : run.runState === 'completed'
                ? themeStyles.success
                : run.runState === 'stopped'
                  ? themeStyles.warning
                  : themeStyles.idle;

            const isChecked = checkedModuleKeys.has(run.moduleKey);

            return (
              <List.Item
                onClick={() => activateModule(run.moduleKey)}
                style={{
                  cursor: 'pointer',
                  padding: 0,
                  marginBottom: 8,
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
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      background: 'var(--vscode-list-hoverBackground, rgba(127,127,127,0.08))',
                    }}
                  >
                    <Space size={6} style={{ minWidth: 0 }}>
                      <Checkbox
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          setCheckedModuleKeys((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) {
                              next.add(run.moduleKey);
                            } else {
                              next.delete(run.moduleKey);
                            }
                            onCheckedModuleKeysChange?.(Array.from(next));
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                      <span style={{ color: isSelected ? themeStyles.selectedFg : themeStyles.textPrimary, fontFamily: 'monospace', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                        {run.moduleKey}
                      </span>
                    </Space>
                    <Space size={4}>
                      {run.runState === 'running' && (
                        <Tooltip title="停止">
                          <Button type="text" size="small" icon={<StopOutlined style={{ color: themeStyles.error }} />} onClick={(event) => { event.stopPropagation(); stopRun(run.moduleKey); }} />
                        </Tooltip>
                      )}
                      <Tooltip title={run.runState === 'running' ? "重新运行" : "运行"}>
                        <Button type="text" size="small" icon={<PlayCircleOutlined style={{ color: themeStyles.success }} />} onClick={(event) => { event.stopPropagation(); handleSingleRunClick(run.moduleKey); }} />
                      </Tooltip>
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
                    </Space>
                  </div>

                  <div
                    style={{
                      padding: '6px 12px',
                      borderTop: `1px solid ${themeStyles.borderLight}`,
                      borderBottom: `1px solid ${themeStyles.borderLight}`,
                      background: 'var(--vscode-editorWidget-background, rgba(127,127,127,0.06))',
                    }}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <span style={{ fontSize: 9, color: themeStyles.textMuted, fontWeight: 800, letterSpacing: 1 }}>当前步骤</span>
                      <span style={{ color: run.runState === 'stopped' ? themeStyles.warning : themeStyles.accentText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {activeTaskName}
                      </span>
                    </Space>
                    <Space size={12} style={{ marginTop: 4 }}>
                      <span style={{ color: themeStyles.textSecondary, fontSize: 11 }}>CPU {displayCpu}%</span>
                      <span style={{ color: themeStyles.textSecondary, fontSize: 11 }}>MEM {displayMem.toFixed(1)}GB</span>
                      <span style={{ color: themeStyles.textSecondary, fontSize: 11 }}>{formatStartTime(run.startedAt)}</span>
                    </Space>
                  </div>

                  <div style={{ padding: '6px 12px 8px' }}>
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
                              aria-label={`打开步骤 ${task.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                selectStep(run, task.id);
                              }}
                              style={{
                                position: 'relative',
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: circleBg,
                                border: '2px solid var(--vscode-editor-background)',
                                cursor: 'pointer',
                                padding: 0,
                                transition: 'width 0.14s ease, height 0.14s ease, box-shadow 0.14s ease',
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
      </Col>

      {/* 2. Middle Column: Module's Pipeline */}
      <Col span={9}>
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
              <Space size={6} style={{ flexShrink: 0 }}>
                {activeModuleData.runState === 'running' ? (
                  <Button
                    type="primary"
                    danger
                    size="small"
                    icon={<StopOutlined />}
                    onClick={() => stopRun(activeModuleData.moduleKey)}
                    style={{ fontSize: 11, height: 22 }}
                  >
                    停止运行
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlayCircleOutlined />}
                    onClick={() => handleSingleRunClick(activeModuleData.moduleKey)}
                    style={{ fontSize: 11, height: 22 }}
                  >
                    开始运行
                  </Button>
                )}
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
              </Space>
            </div>

            {/* Module Metrics (CPU, MEM, Start Time, Run Time) displayed in the middle column header */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', background: 'var(--vscode-list-hoverBackground, rgba(127,127,127,0.04))', padding: '6px 10px', borderRadius: 6, border: `1px solid ${themeStyles.borderLight}`, fontSize: 12, marginBottom: 10 }}>
              <div><span style={{ color: themeStyles.textSecondary }}>CPU:</span> <span style={{ fontFamily: 'monospace', color: themeStyles.textPrimary, fontWeight: 700 }}>{(peakMetrics[activeModuleData.moduleKey]?.maxCpu || activeModuleData.cpu)}%</span></div>
              <div><span style={{ color: themeStyles.textSecondary }}>内存:</span> <span style={{ fontFamily: 'monospace', color: themeStyles.textPrimary, fontWeight: 700 }}>{(peakMetrics[activeModuleData.moduleKey]?.maxMem || activeModuleData.mem).toFixed(1)}GB</span></div>
              <div><span style={{ color: themeStyles.textSecondary }}>开始:</span> <span style={{ fontFamily: 'monospace', color: themeStyles.textPrimary, fontWeight: 700 }}>{formatStartTime(activeModuleData.startedAt)}</span></div>
              <div><span style={{ color: themeStyles.textSecondary }}>用时:</span> <span style={{ fontFamily: 'monospace', color: themeStyles.textPrimary, fontWeight: 700 }}>{getModuleRuntime(activeModuleData)}</span></div>
            </div>

            <div style={{ display: 'grid', gap: 5, flex: 1, overflowY: 'auto', maxHeight: 340, paddingRight: 4 }}>
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

      {/* 3. Right Column: Pipeline Step Details */}
      <Col span={8}>
        {activeModuleData ? (
          <aside
            style={{
              position: 'relative',
              background: themeStyles.cardBg,
              border: `1px solid ${themeStyles.border}`,
              borderRadius: 8,
              minHeight: 520,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: themeStyles.glowMagenta,
              overflow: 'hidden',
            }}
          >
            {selectedTask ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
                {/* Header */}
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${themeStyles.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, color: themeStyles.textMuted, fontWeight: 800, letterSpacing: 2 }}>步骤详情</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ color: themeStyles.accentText, fontFamily: 'monospace', fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedTask.name || selectedTask.id}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <Tag
                      style={{
                        margin: 0,
                        color: getStatusColor(selectedTask.status),
                        borderColor: `${getStatusColor(selectedTask.status)}66`,
                        background: themeStyles.metricBg,
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                    >
                      {statusText[selectedTask.status] ?? selectedTask.status}
                    </Tag>
                    {selectedTask.status === 'success' ? (
                      <Tooltip title="重试该步骤">
                        <Button size="small" type="text" icon={<ReloadOutlined style={{ color: themeStyles.accentText }} />} onClick={() => onRetryStep?.(activeModuleData.moduleKey, activeModuleData.tasks.findIndex((item) => item.id === selectedTask.id))} />
                      </Tooltip>
                    ) : selectedTask.status === 'failed' ? (
                      <Tooltip title="重试失败步骤">
                        <Button size="small" type="text" icon={<ReloadOutlined style={{ color: themeStyles.error }} />} onClick={() => onRetryFailedStep?.(activeModuleData.moduleKey, activeModuleData.tasks.findIndex((item) => item.id === selectedTask.id))} />
                      </Tooltip>
                    ) : selectedTask.status !== 'running' ? (
                      <Tooltip title="单步运行">
                        <Button size="small" type="text" icon={<PlayCircleOutlined style={{ color: themeStyles.success }} />} onClick={() => onRunSingleStep?.(activeModuleData.moduleKey, activeModuleData.tasks.findIndex((item) => item.id === selectedTask.id))} />
                      </Tooltip>
                    ) : null}
                  </div>
                </div>

                {/* Body Details */}
                <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
                  {selectedTask.description && (
                    <div style={{ fontSize: 13 }}>
                      <div style={{ color: themeStyles.textMuted, fontWeight: 700, marginBottom: 4, fontSize: 13 }}>步骤描述</div>
                      <div style={{ color: themeStyles.textPrimary, lineHeight: '1.4', fontSize: 13 }}>
                        {selectedTask.description}
                      </div>
                    </div>
                  )}

                  {selectedTask.command && (
                    <div style={{ fontSize: 13 }}>
                      <div style={{ color: themeStyles.textMuted, fontWeight: 700, marginBottom: 4, fontSize: 13 }}>执行命令</div>
                      <div
                        style={{
                          background: 'var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2))',
                          padding: '6px 8px',
                          borderRadius: 4,
                          border: `1px solid ${themeStyles.borderLight}`,
                          fontFamily: 'monospace',
                          color: themeStyles.accentText,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          fontSize: 13,
                        }}
                      >
                        {selectedTask.command}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Space direction="vertical" align="center">
                  <ClockCircleOutlined style={{ color: themeStyles.idle, fontSize: 40 }} />
                  <span style={{ color: themeStyles.textSecondary, fontSize: 13 }}>选择步骤查看详情与日志</span>
                </Space>
              </div>
            )}
          </aside>
        ) : (
          <div style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}`, borderRadius: 8, minHeight: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: themeStyles.glowMagenta }}>
            <Space direction="vertical" align="center">
              <ClockCircleOutlined style={{ color: themeStyles.idle, fontSize: 40 }} />
              <span style={{ color: themeStyles.textSecondary, fontSize: 13 }}>未选择模块</span>
            </Space>
          </div>
        )}
      </Col>

      {/* Run Confirmation and Step Range Selection Modal */}
      <Modal
        open={runModalOpen}
        title={
          <Space>
            <PlayCircleOutlined style={{ color: themeStyles.accent }} />
            <span>启动流水线 (选择步骤范围)</span>
          </Space>
        }
        okText="运行"
        cancelText="取消"
        onOk={confirmRunModal}
        onCancel={() => setRunModalOpen(false)}
      >
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div>
            <span style={{ color: themeStyles.textSecondary, fontSize: 12 }}>目标模块：</span>
            <strong style={{ color: themeStyles.textPrimary, fontSize: 13, fontFamily: 'monospace' }}>
              {runModalTargets.join(', ')}
            </strong>
          </div>
          {(() => {
            const targetKey = runModalTargets[0];
            const runtime = runtimes[getPipelineRuntimeKey(flowKey, targetKey)] || activeModuleData;
            const tasks = runtime?.tasks || [];
            if (tasks.length > 1) {
              return (
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'var(--vscode-sideBar-background, rgba(0,0,0,0.02))',
                    border: `1px solid ${themeStyles.border}`,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: themeStyles.textSecondary }}>执行步骤范围:</span>
                    <span style={{ fontSize: 12, color: themeStyles.accentText, fontWeight: 700, fontFamily: 'monospace' }}>
                      {tasks[runModalRange[0]]?.name} ➔ {tasks[runModalRange[1]]?.name}
                    </span>
                  </div>
                  <Slider
                    range
                    min={0}
                    max={tasks.length - 1}
                    value={runModalRange}
                    onChange={(val) => setRunModalRange(val as [number, number])}
                    tooltip={{
                      formatter: (val) => {
                        if (val === undefined) return '';
                        const task = tasks[val];
                        return task ? `${val + 1}. ${task.name}` : '';
                      }
                    }}
                    styles={{
                      track: {
                        background: themeStyles.accent,
                      },
                      handle: {
                        borderColor: themeStyles.accent,
                        backgroundColor: 'var(--vscode-editor-background)',
                      }
                    }}
                    style={{ margin: '8px 6px 4px' }}
                  />
                </div>
              );
            }
            return null;
          })()}
        </Space>
      </Modal>
    </Row>
  );
});

PipelineExecutionOverview.displayName = 'PipelineExecutionOverview';

export default PipelineExecutionOverview;
