import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Button,
  Col,
  Empty,
  List,
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
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import usePipelineRuntimeStore, {
  PipelineFlowKey,
  PipelineRuntimeSnapshot,
  getInitialTaskCount,
  getPipelineRuntimeKey,
  subscribePipelineRuntimeUpdates,
} from '../../store/pipelineRuntimeStore';
import { PipelineLink, PipelineTask } from './pipelineMockData';

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

function summarizeRuntime(
  moduleKey: string,
  flowKey: PipelineFlowKey,
  runtime?: PipelineRuntimeSnapshot,
): PipelineRunOverview {
  const total = runtime?.tasks.length || getInitialTaskCount(flowKey);
  const tasks = runtime?.tasks ?? [];
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
    links: runtime?.links ?? [],
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
  const taskDetailRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selectedModuleKeys = useMemo(() => {
    const cleanKeys = moduleKeys.map((key) => key.trim()).filter(Boolean);
    return Array.from(new Set(cleanKeys));
  }, [moduleKeys]);

  const getFlowLabel = useCallback((moduleKey: string) => `${flowLabel} / ${moduleKey}`, [flowLabel]);

  const activateModule = useCallback((moduleKey: string) => {
    setActiveModuleKey(moduleKey);
    onActiveModuleChange?.(moduleKey);
  }, [onActiveModuleChange]);

  const ensureRuntimeVisible = useCallback((moduleKey: string) => {
    ensureRuntime(flowKey, moduleKey, getFlowLabel(moduleKey));
  }, [ensureRuntime, flowKey, getFlowLabel]);

  const startRun = useCallback((moduleKey: string) => {
    setPeakMetrics((prev) => ({ ...prev, [moduleKey]: { maxCpu: 0, maxMem: 0 } }));
    setStoppedTaskSnapshots((prev) => {
      const next = { ...prev };
      delete next[moduleKey];
      return next;
    });
    ensureRuntimeVisible(moduleKey);
    startRuntime(flowKey, moduleKey, getFlowLabel(moduleKey));
    activateModule(moduleKey);
  }, [activateModule, ensureRuntimeVisible, flowKey, getFlowLabel, startRuntime]);

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

  useImperativeHandle(ref, () => ({
    handleExternalRun(keys: string[]) {
      keys.filter(Boolean).forEach(startRun);
    },
    handleExternalStop(keys: string[]) {
      keys.filter(Boolean).forEach(stopRun);
    },
  }), [startRun, stopRun]);

  const visibleRuns = useMemo(() => (
    selectedModuleKeys.map((moduleKey) => {
      const runtime = runtimes[getPipelineRuntimeKey(flowKey, moduleKey)];
      return summarizeRuntime(moduleKey, flowKey, runtime);
    })
  ), [flowKey, runtimes, selectedModuleKeys]);

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

  const activeModuleData = visibleRuns.find((run) => run.moduleKey === activeModuleKey);
  const activeHierarchy = activeModuleData ? getTaskHierarchy(activeModuleData) : undefined;
  const selectedTask = activeModuleData?.tasks.find((task) => task.id === selectedTaskId);

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
      ? <Tooltip title="重试该步骤"><Button size="small" type="text" icon={<ReloadOutlined style={{ color: themeStyles.accentText }} />} onClick={() => onRetryStep?.(activeModuleData.moduleKey, activeModuleData.tasks.findIndex((item) => item.id === task.id))} /></Tooltip>
      : task.status === 'failed'
        ? <Tooltip title="重试失败步骤"><Button size="small" type="text" icon={<ReloadOutlined style={{ color: themeStyles.error }} />} onClick={() => onRetryFailedStep?.(activeModuleData.moduleKey, activeModuleData.tasks.findIndex((item) => item.id === task.id))} /></Tooltip>
        : !isRunning
          ? <Tooltip title="单步运行"><Button size="small" type="text" icon={<PlayCircleOutlined style={{ color: themeStyles.success }} />} onClick={() => onRunSingleStep?.(activeModuleData.moduleKey, activeModuleData.tasks.findIndex((item) => item.id === task.id))} /></Tooltip>
          : null;

    return (
      <div
        key={task.id}
        style={{
          position: 'relative',
          marginLeft: isChild ? Math.min(depth, 3) * 18 : 0,
          paddingLeft: isChild ? 16 : 0,
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
                top: 22,
                width: 12,
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
            flexDirection: 'column',
            gap: 8,
            padding: '10px 11px',
            border: `1px solid ${isSelected ? themeStyles.selectedBorder : isRunning ? themeStyles.accentBorder : themeStyles.borderLight}`,
            borderLeft: `${hasChildren && !isChild ? 4 : 3}px solid ${color}`,
            borderRadius: 5,
            background: isSelected
              ? themeStyles.selectedBg
              : isRunning
                ? 'var(--vscode-list-hoverBackground, rgba(127,127,127,0.10))'
                : hasChildren
                  ? `linear-gradient(90deg, ${themeStyles.metricBg}, ${themeStyles.panelBg})`
                  : themeStyles.panelBg,
            boxShadow: isSelected ? themeStyles.selectedShadow : isRunning ? themeStyles.glowCyan : 'none',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasChildren ? (
              <Tooltip title={expanded ? '折叠子任务' : '展开子任务'}>
                <Button
                  size="small"
                  type="text"
                  aria-label={expanded ? '折叠子任务' : '展开子任务'}
                  icon={expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpanded(task.id);
                  }}
                  style={{
                    color: isSelected ? themeStyles.selectedFg : themeStyles.accentText,
                    width: 24,
                    height: 24,
                    padding: 0,
                    border: `1px solid ${themeStyles.borderLight}`,
                    background: themeStyles.metricBg,
                  }}
                />
              </Tooltip>
            ) : (
              <span style={{ width: 24, flex: '0 0 24px' }} />
            )}
            {task.status === 'success' ? (
              <CheckCircleOutlined style={{ color, fontSize: 16 }} />
            ) : task.status === 'running' ? (
              <SyncOutlined spin style={{ color, fontSize: 16 }} />
            ) : task.status === 'failed' || task.status === 'stopped' ? (
              <CloseCircleOutlined style={{ color, fontSize: 16 }} />
            ) : (
              <ClockCircleOutlined style={{ color, fontSize: 16 }} />
            )}
            <span style={{ color: isSelected ? themeStyles.selectedFg : themeStyles.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: isSelected ? 800 : 600 }}>
              {task.name || task.id}
            </span>
            {relationLabel && (
              <Tag style={{ marginRight: 0, color: themeStyles.textSecondary, borderColor: themeStyles.borderLight, background: themeStyles.metricBg, fontFamily: 'monospace' }}>
                {relationLabel}
              </Tag>
            )}
            {hasChildren && (
              <Tag style={{ marginRight: 4, color: themeStyles.textSecondary, borderColor: themeStyles.borderLight, background: themeStyles.metricBg, fontFamily: 'monospace' }}>
                {children.length} 子任务
              </Tag>
            )}
            <Tag style={{ marginRight: 4, color, borderColor: `${color}66`, background: themeStyles.metricBg, fontFamily: 'monospace' }}>
              {statusText[task.status] ?? task.status}
            </Tag>
            {action}
          </div>
          {(task.command || task.description || latestLog) && (
            <div style={{ display: 'grid', gap: 4, color: themeStyles.textSecondary, fontSize: 12 }}>
              {task.command && (
                <span style={{ color: themeStyles.accentText, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  $ {task.command}
                </span>
              )}
              {task.description && <span>{task.description}</span>}
              {latestLog && (
                <span style={{ color: task.status === 'failed' ? themeStyles.error : themeStyles.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {latestLog}
                </span>
              )}
            </div>
          )}
        </div>
        {hasChildren && expanded && (
          <div
            style={{
              marginTop: 8,
              display: 'grid',
              gap: 8,
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
      gutter={16}
      style={{
        position: 'relative',
        padding: 14,
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
      <Col span={10}>
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

            return (
              <List.Item
                onClick={() => activateModule(run.moduleKey)}
                style={{
                  cursor: 'pointer',
                  padding: 0,
                  marginBottom: 10,
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
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      background: 'var(--vscode-list-hoverBackground, rgba(127,127,127,0.08))',
                    }}
                  >
                    <Space size={8} style={{ minWidth: 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                      <span style={{ color: isSelected ? themeStyles.selectedFg : themeStyles.textPrimary, fontFamily: 'monospace', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {run.moduleKey}
                      </span>
                    </Space>
                    <Space size={4}>
                      {run.runState === 'running' ? (
                        <Tooltip title="停止">
                          <Button type="text" size="small" icon={<StopOutlined style={{ color: themeStyles.error }} />} onClick={(event) => { event.stopPropagation(); stopRun(run.moduleKey); }} />
                        </Tooltip>
                      ) : (
                        <Tooltip title="运行">
                          <Button type="text" size="small" icon={<PlayCircleOutlined style={{ color: themeStyles.success }} />} onClick={(event) => { event.stopPropagation(); startRun(run.moduleKey); }} />
                        </Tooltip>
                      )}
                      <Tag
                        style={{
                          margin: 0,
                          color: themeStyles.accentText,
                          borderColor: themeStyles.borderLight,
                          background: themeStyles.metricBg,
                          fontFamily: 'monospace',
                          fontWeight: 700,
                        }}
                      >
                        {counterText}
                      </Tag>
                    </Space>
                  </div>

                  <div
                    style={{
                      padding: '8px 12px',
                      borderTop: `1px solid ${themeStyles.borderLight}`,
                      borderBottom: `1px solid ${themeStyles.borderLight}`,
                      background: 'var(--vscode-editorWidget-background, rgba(127,127,127,0.06))',
                    }}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <span style={{ fontSize: 10, color: themeStyles.textMuted, fontWeight: 800, letterSpacing: 1 }}>当前步骤</span>
                      <span style={{ color: run.runState === 'stopped' ? themeStyles.warning : themeStyles.accentText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activeTaskName}
                      </span>
                    </Space>
                    <Space size={16} style={{ marginTop: 8 }}>
                      <span style={{ color: themeStyles.textSecondary, fontSize: 12 }}>CPU {displayCpu}%</span>
                      <span style={{ color: themeStyles.textSecondary, fontSize: 12 }}>MEM {displayMem.toFixed(1)}GB</span>
                      <span style={{ color: themeStyles.textSecondary, fontSize: 12 }}>{formatStartTime(run.startedAt)}</span>
                    </Space>
                  </div>

                  <div style={{ padding: '8px 12px 10px' }}>
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
                        const isRunning = task?.status === 'running';
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
                                width: 11,
                                height: 11,
                                borderRadius: '50%',
                                background: circleBg,
                                border: '2px solid var(--vscode-editor-background)',
                                boxShadow: undefined,
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

      <Col span={14}>
        {activeModuleData ? (
          <aside
            style={{
              position: 'relative',
              background: themeStyles.cardBg,
              border: `1px solid ${themeStyles.accentBorder}`,
              borderRadius: 8,
              minHeight: 520,
              overflow: 'hidden',
              boxShadow: themeStyles.glowCyan,
            }}
          >
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, var(--vscode-panel-border, rgba(127,127,127,0.10)), transparent 1px)', backgroundSize: '100% 8px', opacity: 0.14 }} />
            <div style={{ position: 'relative', padding: 16 }}>
              <Space direction="vertical" size={18} style={{ width: '100%' }}>
                <div>
                  <div style={{ fontSize: 10, color: themeStyles.textMuted, fontWeight: 800, letterSpacing: 2 }}>模块</div>
                  <h4 style={{ margin: '4px 0 0', color: themeStyles.accentText, fontFamily: 'monospace', fontSize: 18 }}>{activeModuleData.moduleKey}</h4>
                </div>

                <Row gutter={16} style={{ borderTop: `1px solid ${themeStyles.borderLight}`, paddingTop: 12 }}>
                  <Col span={8}>
                    <div style={{ padding: 10, border: `1px solid ${themeStyles.border}`, background: themeStyles.metricBg, borderRadius: 6 }}>
                      <strong style={{ color: themeStyles.textPrimary, fontSize: 18 }}>{(peakMetrics[activeModuleData.moduleKey]?.maxCpu || activeModuleData.cpu)}%</strong>
                      <div style={{ color: themeStyles.textSecondary, fontSize: 11, letterSpacing: 1 }}>CPU</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ padding: 10, border: `1px solid ${themeStyles.border}`, background: themeStyles.metricBg, borderRadius: 6 }}>
                      <strong style={{ color: themeStyles.textPrimary, fontSize: 18 }}>{(peakMetrics[activeModuleData.moduleKey]?.maxMem || activeModuleData.mem).toFixed(1)}GB</strong>
                      <div style={{ color: themeStyles.textSecondary, fontSize: 11, letterSpacing: 1 }}>MEM</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ padding: 10, border: `1px solid ${themeStyles.border}`, background: themeStyles.metricBg, borderRadius: 6 }}>
                      <strong style={{ color: themeStyles.amber, fontSize: 18 }}>{formatStartTime(activeModuleData.startedAt)}</strong>
                      <div style={{ color: themeStyles.textSecondary, fontSize: 11, letterSpacing: 1 }}>开始</div>
                    </div>
                  </Col>
                </Row>

                <div style={{ borderTop: `1px solid ${themeStyles.border}`, paddingTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <h5 style={{ margin: 0, color: themeStyles.accentText, letterSpacing: 1 }}>
                      步骤详情 ({activeModuleData.tasks.length})
                    </h5>
                    {selectedTask && (
                      <Tag
                        style={{
                          margin: 0,
                          color: getStatusColor(selectedTask.status),
                          borderColor: `${getStatusColor(selectedTask.status)}66`,
                          background: themeStyles.metricBg,
                          fontFamily: 'monospace',
                        }}
                      >
                        当前：{selectedTask.name}
                      </Tag>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 392, overflowY: 'auto', paddingRight: 4 }}>
                    {(activeHierarchy?.topLevelTasks ?? activeModuleData.tasks).map((task) => renderTaskDetail(task))}
                  </div>
                </div>
              </Space>
            </div>
          </aside>
        ) : (
          <aside style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}`, borderRadius: 8, minHeight: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: themeStyles.glowMagenta }}>
            <Space direction="vertical" align="center">
              <ClockCircleOutlined style={{ color: themeStyles.idle, fontSize: 48 }} />
              <span style={{ color: themeStyles.textSecondary }}>未选择模块</span>
            </Space>
          </aside>
        )}
      </Col>
    </Row>
  );
});

PipelineExecutionOverview.displayName = 'PipelineExecutionOverview';

export default PipelineExecutionOverview;
