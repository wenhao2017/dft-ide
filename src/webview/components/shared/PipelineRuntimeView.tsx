import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
} from '@xyflow/react';
import dagre from 'dagre';
import {
  Badge,
  Button,
  Descriptions,
  Empty,
  List,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CloseOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
const { Text, Title } = Typography;

type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'stopped' | 'skipped';

interface PipelineTask {
  id: string;
  name: string;
  command: string;
  status: TaskStatus;
  startedAt?: string;
  finishedAt?: string;
  duration?: string;
  attempts: number;
  description: string;
  logs: string[];
}

interface PipelineLink {
  source: string;
  target: string;
}

interface PipelineNodeData extends Record<string, unknown> {
  task: PipelineTask;
  selected: boolean;
  onSelect: (id: string) => void;
  onRerun: (id: string) => void;
  onStop: (id: string) => void;
}

interface RuntimeState {
  tasks: PipelineTask[];
  links: PipelineLink[];
  logs: string[];
  selectedTaskId?: string;
  runState: 'idle' | 'running' | 'completed' | 'stopped';
}

interface PipelineRuntimeViewProps {
  flowLabel?: string;
  onClose?: () => void;
  autoStart?: boolean;
}

export function buildExecutionTerminalCommandUri(title: string, command?: string): string {
  return `command:dftIde.openExecutionTerminalFromUri?${encodeURIComponent(JSON.stringify([{ title, command }]))}`;
}

const statusMeta: Record<TaskStatus, { label: string; color: string; tone: string }> = {
  pending: { label: '等待中', color: 'default', tone: '#8c8c8c' },
  running: { label: '运行中', color: 'processing', tone: '#1677ff' },
  success: { label: '成功', color: 'success', tone: '#52c41a' },
  failed: { label: '失败', color: 'error', tone: '#ff4d4f' },
  stopped: { label: '已停止', color: 'warning', tone: '#faad14' },
  skipped: { label: '已跳过', color: 'default', tone: '#8c8c8c' },
};

const initialRuntimeState: RuntimeState = {
  tasks: [],
  links: [],
  logs: ['流水线运行态已就绪，点击“启动流水线”开始接收事件流。'],
  runState: 'idle',
};

const now = () => new Date().toLocaleTimeString();

const taskLog = (message: string) => `[${now()}] ${message}`;

const makeTask = (
  id: string,
  name: string,
  command: string,
  description: string,
  status: TaskStatus = 'pending',
): PipelineTask => ({
  id,
  name,
  command,
  status,
  attempts: 1,
  description,
  startedAt: status === 'running' ? now() : undefined,
  logs: [taskLog(`${name} 已创建，初始状态：${statusMeta[status].label}。`)],
});

function PipelineTaskNode({ data }: NodeProps<Node<PipelineNodeData>>) {
  const { task, selected, onSelect, onRerun, onStop } = data;
  const meta = statusMeta[task.status];

  return (
    <div
      onClick={() => onSelect(task.id)}
      style={{
        width: 154,
        border: `1px solid ${selected ? 'var(--vscode-focusBorder, #1677ff)' : 'var(--vscode-panel-border, rgba(127,127,127,0.28))'}`,
        borderTop: `4px solid ${meta.tone}`,
        borderRadius: 8,
        padding: 7,
        cursor: 'pointer',
        background: 'var(--vscode-editor-background, #fff)',
        boxShadow: selected
          ? '0 0 0 2px color-mix(in srgb, var(--vscode-focusBorder, #1677ff) 20%, transparent)'
          : '0 8px 22px rgba(0,0,0,0.14)',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
          <Text strong style={{ maxWidth: 96, fontSize: 12 }} ellipsis title={task.name}>
            {task.name}
          </Text>
          <Badge
            status={
              task.status === 'running'
                ? 'processing'
                : task.status === 'failed'
                  ? 'error'
                  : task.status === 'success'
                    ? 'success'
                    : 'default'
            }
          />
        </Space>
        <Tag color={meta.color} style={{ margin: 0, width: 'fit-content' }}>
          {meta.label}
        </Tag>
        <Text code style={{ fontSize: 10 }} ellipsis title={task.command}>
          {task.command}
        </Text>
        {(task.status === 'failed' || task.status === 'running') && (
          <Space size={6} onClick={(event) => event.stopPropagation()}>
            {task.status === 'failed' && (
              <Tooltip title="重跑失败任务">
                <Button size="small" icon={<ReloadOutlined />} style={{ fontSize: 12, paddingInline: 6 }} onClick={() => onRerun(task.id)}>
                  重跑
                </Button>
              </Tooltip>
            )}
            {task.status === 'running' && (
              <Tooltip title="停止运行中的任务">
                <Button size="small" danger icon={<PauseCircleOutlined />} style={{ fontSize: 12, paddingInline: 6 }} onClick={() => onStop(task.id)}>
                  停止
                </Button>
              </Tooltip>
            )}
          </Space>
        )}
      </Space>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { pipelineTask: PipelineTaskNode };

function layoutGraph(
  tasks: PipelineTask[],
  links: PipelineLink[],
  handlers: Pick<PipelineNodeData, 'onSelect' | 'onRerun' | 'onStop'>,
  selectedTaskId?: string,
) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 34, ranksep: 58 });

  tasks.forEach((task) => graph.setNode(task.id, { width: 154, height: 96 }));
  links.forEach((link) => graph.setEdge(link.source, link.target));
  dagre.layout(graph);

  const nodes: Node<PipelineNodeData>[] = tasks.map((task) => {
    const point = graph.node(task.id) as { x: number; y: number };
    return {
      id: task.id,
      type: 'pipelineTask',
      position: { x: point.x - 77, y: point.y - 48 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        task,
        selected: task.id === selectedTaskId,
        ...handlers,
      },
      draggable: false,
    };
  });

  const edges: Edge[] = links.map((link) => ({
    id: `${link.source}-${link.target}`,
    source: link.source,
    target: link.target,
    animated: tasks.find((task) => task.id === link.source)?.status === 'running',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      stroke: 'var(--vscode-focusBorder, #1677ff)',
      strokeWidth: 1.7,
    },
  }));

  return { nodes, edges };
}

const PipelineRuntimeView: React.FC<PipelineRuntimeViewProps> = ({ flowLabel = 'DFT', onClose, autoStart }) => {
  const [runtime, setRuntime] = useState<RuntimeState>(initialRuntimeState);
  const timers = useRef<number[]>([]);
  const autoStarted = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const schedule = useCallback((delay: number, action: () => void) => {
    const timer = window.setTimeout(action, delay);
    timers.current.push(timer);
  }, []);

  const appendLog = useCallback((line: string) => {
    setRuntime((prev) => ({ ...prev, logs: [...prev.logs, taskLog(line)] }));
  }, []);

  const patchTask = useCallback((
    id: string,
    patch: Partial<PipelineTask> | ((task: PipelineTask) => Partial<PipelineTask>),
  ) => {
    setRuntime((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => {
        if (task.id !== id) return task;
        const nextPatch = typeof patch === 'function' ? patch(task) : patch;
        return {
          ...task,
          ...nextPatch,
          logs: nextPatch.logs ?? task.logs,
        };
      }),
    }));
  }, []);

  const addTasks = useCallback((tasks: PipelineTask[], links: PipelineLink[]) => {
    setRuntime((prev) => ({
      ...prev,
      tasks: [...prev.tasks, ...tasks],
      links: [...prev.links, ...links],
      selectedTaskId: prev.selectedTaskId ?? tasks[0]?.id,
    }));
  }, []);

  const startPipeline = useCallback(() => {
    clearTimers();
    const root = makeTask('pipeline', `${flowLabel}流水线`, 'dft-pipeline run', '顶层流水线运行会话。', 'running');
    setRuntime({
      tasks: [root],
      links: [],
      logs: [taskLog(`${flowLabel}流水线已启动。`), taskLog('主任务已生成。')],
      selectedTaskId: root.id,
      runState: 'running',
    });

    schedule(650, () => {
      appendLog('发现动态子任务：validate_inputs、prepare_workspace、run_job。');
      addTasks(
        [
          makeTask('validate_inputs', 'validate_inputs', 'python validate.py', '校验路径、配置和运行参数。', 'running'),
          makeTask('prepare_workspace', 'prepare_workspace', 'mkdir -p work/logs', '创建运行目录和日志目录。', 'pending'),
          makeTask('run_job', 'run_job', 'bsub < run_job.sh', '提交主 DFT 执行任务。', 'pending'),
        ],
        [
          { source: 'pipeline', target: 'validate_inputs' },
          { source: 'pipeline', target: 'prepare_workspace' },
          { source: 'pipeline', target: 'run_job' },
        ],
      );
    });

    schedule(1600, () => {
      appendLog('validate_inputs 校验完成。');
      patchTask('validate_inputs', (task) => ({
        status: 'success',
        finishedAt: now(),
        duration: '0.9s',
        logs: [...task.logs, taskLog('必要输入均已通过校验。')],
      }));
      patchTask('prepare_workspace', (task) => ({
        status: 'running',
        startedAt: now(),
        logs: [...task.logs, taskLog('开始准备运行工作区。')],
      }));
    });

    schedule(2500, () => {
      appendLog('prepare_workspace 完成，run_job 开始运行。');
      patchTask('prepare_workspace', (task) => ({
        status: 'success',
        finishedAt: now(),
        duration: '0.8s',
        logs: [...task.logs, taskLog('运行目录已准备完成。')],
      }));
      patchTask('run_job', (task) => ({
        status: 'running',
        startedAt: now(),
        logs: [...task.logs, taskLog('主任务已提交到模拟调度器。')],
      }));
    });

    schedule(3400, () => {
      appendLog('run_job 动态分叉出 module_a、module_b、module_c。');
      addTasks(
        [
          makeTask('module_a', 'module_a', 'run_module --name module_a', '执行 module_a 检查。', 'running'),
          makeTask('module_b', 'module_b', 'run_module --name module_b', '执行 module_b 检查。', 'running'),
          makeTask('module_c', 'module_c', 'run_module --name module_c', '执行 module_c 检查。', 'running'),
          makeTask('collect_reports', 'collect_reports', 'python collect_reports.py', '模块任务结束后收集报告。', 'pending'),
        ],
        [
          { source: 'run_job', target: 'module_a' },
          { source: 'run_job', target: 'module_b' },
          { source: 'run_job', target: 'module_c' },
          { source: 'module_a', target: 'collect_reports' },
          { source: 'module_b', target: 'collect_reports' },
          { source: 'module_c', target: 'collect_reports' },
        ],
      );
    });

    schedule(4600, () => {
      appendLog('module_a 执行成功。');
      patchTask('module_a', (task) => ({
        status: 'success',
        finishedAt: now(),
        duration: '1.2s',
        logs: [...task.logs, taskLog('module_a 结果正常。')],
      }));
    });

    schedule(5200, () => {
      appendLog('module_b 触发断言错误，任务失败。');
      patchTask('module_b', (task) => ({
        status: 'failed',
        finishedAt: now(),
        duration: '1.8s',
        logs: [...task.logs, taskLog('错误：pattern_017 触发断言失败。')],
      }));
      patchTask('collect_reports', (task) => ({
        status: 'skipped',
        finishedAt: now(),
        logs: [...task.logs, taskLog('因 module_b 失败，暂时跳过报告收集。')],
      }));
    });

    schedule(5900, () => {
      appendLog('module_c 执行成功，流水线等待失败任务处理。');
      patchTask('module_c', (task) => ({
        status: 'success',
        finishedAt: now(),
        duration: '2.3s',
        logs: [...task.logs, taskLog('module_c 完成，仅有普通告警。')],
      }));
      patchTask('run_job', (task) => ({
        status: 'failed',
        finishedAt: now(),
        duration: '3.4s',
        logs: [...task.logs, taskLog('子任务 module_b 失败。')],
      }));
      patchTask('pipeline', (task) => ({
        status: 'failed',
        finishedAt: now(),
        duration: '5.9s',
        logs: [...task.logs, taskLog('流水线存在一条失败分支。')],
      }));
      setRuntime((prev) => ({ ...prev, runState: 'completed' }));
    });
  }, [addTasks, appendLog, clearTimers, flowLabel, patchTask, schedule]);

  useEffect(() => {
    if (!autoStart || autoStarted.current) {
      return;
    }
    autoStarted.current = true;
    startPipeline();
  }, [autoStart, startPipeline]);

  const stopTask = useCallback((id: string) => {
    patchTask(id, (task) => ({
      status: 'stopped',
      finishedAt: now(),
      logs: [...task.logs, taskLog('用户手动停止任务。')],
    }));
    appendLog(`${id} 已由用户手动停止。`);
  }, [appendLog, patchTask]);

  const rerunTask = useCallback((id: string) => {
    patchTask(id, (task) => ({
      status: 'running',
      attempts: task.attempts + 1,
      startedAt: now(),
      finishedAt: undefined,
      logs: [...task.logs, taskLog('已触发重跑。')],
    }));
    appendLog(`${id} 已触发重跑。`);

    schedule(1100, () => {
      patchTask(id, (task) => ({
        status: 'success',
        finishedAt: now(),
        duration: '1.1s',
        logs: [...task.logs, taskLog('重跑成功。')],
      }));
      appendLog(`${id} 重跑成功。`);

      setRuntime((prev) => {
        const nextTasks = prev.tasks.map((task) => {
          if (task.id === 'collect_reports' && task.status === 'skipped') {
            return {
              ...task,
              status: 'running' as TaskStatus,
              startedAt: now(),
              logs: [...task.logs, taskLog('失败分支恢复后，继续执行报告收集。')],
            };
          }
          if (task.id === 'run_job' || task.id === 'pipeline') {
            return {
              ...task,
              status: 'running' as TaskStatus,
              logs: [...task.logs, taskLog('等待恢复后的分支完成。')],
            };
          }
          return task;
        });
        return { ...prev, tasks: nextTasks, runState: 'running' };
      });

      schedule(900, () => {
        setRuntime((prev) => ({
          ...prev,
          runState: 'completed',
          tasks: prev.tasks.map((task) => {
            if (task.id === 'collect_reports') {
              return {
                ...task,
                status: 'success',
                finishedAt: now(),
                duration: '0.9s',
                logs: [...task.logs, taskLog('报告收集完成。')],
              };
            }
            if (task.id === 'run_job' || task.id === 'pipeline') {
              return {
                ...task,
                status: 'success',
                finishedAt: now(),
                logs: [...task.logs, taskLog('流水线恢复后成功完成。')],
              };
            }
            return task;
          }),
          logs: [...prev.logs, taskLog('流水线已恢复并成功完成。')],
        }));
      });
    });
  }, [appendLog, patchTask, schedule]);

  const stopAll = useCallback(() => {
    clearTimers();
    setRuntime((prev) => ({
      ...prev,
      runState: 'stopped',
      tasks: prev.tasks.map((task) => {
        if (task.status === 'running') {
          return {
            ...task,
            status: 'stopped',
            finishedAt: now(),
            logs: [...task.logs, taskLog('已被“停止全部”中止。')],
          };
        }
        if (task.status === 'pending') {
          return {
            ...task,
            status: 'skipped',
            finishedAt: now(),
            logs: [...task.logs, taskLog('因“停止全部”跳过。')],
          };
        }
        return task;
      }),
      logs: [...prev.logs, taskLog('已触发“停止全部”。')],
    }));
  }, [clearTimers]);

  const selectTask = useCallback((id: string) => {
    setRuntime((prev) => ({ ...prev, selectedTaskId: id }));
  }, []);

  const handlers = useMemo(
    () => ({ onSelect: selectTask, onRerun: rerunTask, onStop: stopTask }),
    [rerunTask, selectTask, stopTask],
  );
  const { nodes, edges } = useMemo(
    () => layoutGraph(runtime.tasks, runtime.links, handlers, runtime.selectedTaskId),
    [handlers, runtime.links, runtime.selectedTaskId, runtime.tasks],
  );
  const selectedTask = runtime.tasks.find((task) => task.id === runtime.selectedTaskId);
  const failedCount = runtime.tasks.filter((task) => task.status === 'failed').length;
  const runningCount = runtime.tasks.filter((task) => task.status === 'running').length;
  const canStopAll = runtime.tasks.some((task) => task.status === 'running' || task.status === 'pending');
  const terminalTitle = `${flowLabel}流水线运行环境`;
  const terminalCommand = `echo [DFT IDE] ${flowLabel}流水线运行终端已打开`;
  const terminalCommandUri = buildExecutionTerminalCommandUri(terminalTitle, terminalCommand);

  return (
    <section className="dft-pipeline-runtime">
      <style>
        {`
          .dft-pipeline-runtime {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: grid;
            grid-template-rows: auto 1fr;
            background: var(--vscode-editor-background, #fff);
            color: var(--vscode-foreground, #222);
          }

          .dft-pipeline-runtime .pipeline-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 14px;
            border-bottom: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.24));
            background: color-mix(in srgb, var(--vscode-editor-background, #fff) 92%, var(--vscode-focusBorder, #1677ff));
          }

          .dft-pipeline-runtime .pipeline-body {
            min-height: 0;
            display: grid;
            grid-template-columns: minmax(720px, 1fr) 330px;
            gap: 10px;
            padding: 10px;
          }

          .dft-pipeline-runtime .pipeline-canvas {
            min-width: 0;
            min-height: 0;
            border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.24));
            border-radius: 8px;
            overflow: hidden;
            background: var(--vscode-editor-background, #fff);
          }

          .dft-pipeline-runtime .pipeline-side {
            min-width: 0;
            min-height: 0;
            display: grid;
            grid-template-rows: minmax(260px, 1fr) 220px;
            gap: 10px;
          }

          .dft-pipeline-runtime .pipeline-panel {
            min-height: 0;
            overflow: auto;
            border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.24));
            border-radius: 8px;
            padding: 10px;
            background: color-mix(in srgb, var(--vscode-editor-background, #fff) 94%, var(--vscode-focusBorder, #1677ff));
          }

          .dft-pipeline-runtime .pipeline-log {
            background: var(--vscode-terminal-background, color-mix(in srgb, var(--vscode-editor-background, #fff) 90%, #000));
          }

          .dft-pipeline-runtime .react-flow {
            width: 100%;
            height: 100%;
            direction: ltr;
            position: relative;
            overflow: hidden;
            background: var(--vscode-editor-background, #fff);
            --xy-edge-stroke-default: var(--vscode-focusBorder, #1677ff);
            --xy-edge-stroke-width-default: 1.7;
            --xy-background-color-default: var(--vscode-editor-background, #fff);
            --xy-minimap-background-color-default: var(--vscode-editor-background, #fff);
            --xy-controls-button-background-color-default: var(--vscode-editor-background, #fff);
            --xy-controls-button-color-default: var(--vscode-foreground, #222);
          }

          .dft-pipeline-runtime .react-flow__renderer,
          .dft-pipeline-runtime .react-flow__pane,
          .dft-pipeline-runtime .react-flow__viewport,
          .dft-pipeline-runtime .react-flow__container {
            width: 100%;
            height: 100%;
          }

          .dft-pipeline-runtime .react-flow__container,
          .dft-pipeline-runtime .react-flow__edgelabel-renderer,
          .dft-pipeline-runtime .react-flow__viewport-portal {
            position: absolute;
            inset: 0;
          }

          .dft-pipeline-runtime .react-flow__background {
            pointer-events: none;
            z-index: -1;
          }

          .dft-pipeline-runtime .react-flow__pane {
            z-index: 1;
          }

          .dft-pipeline-runtime .react-flow__viewport {
            transform-origin: 0 0;
            z-index: 2;
            pointer-events: none;
          }

          .dft-pipeline-runtime .react-flow__renderer {
            z-index: 4;
          }

          .dft-pipeline-runtime .react-flow .react-flow__edges,
          .dft-pipeline-runtime .react-flow .react-flow__edges svg,
          .dft-pipeline-runtime svg.react-flow__connectionline {
            position: absolute;
            overflow: visible;
            pointer-events: none;
          }

          .dft-pipeline-runtime .react-flow__edge-path,
          .dft-pipeline-runtime .react-flow__connection-path {
            stroke: var(--xy-edge-stroke, var(--xy-edge-stroke-default));
            stroke-width: var(--xy-edge-stroke-width, var(--xy-edge-stroke-width-default));
            fill: none;
          }

          .dft-pipeline-runtime .react-flow__edge {
            pointer-events: visibleStroke;
          }

          .dft-pipeline-runtime .react-flow__edge.animated path {
            stroke-dasharray: 5;
            animation: dashdraw 0.5s linear infinite;
          }

          .dft-pipeline-runtime .react-flow__nodes {
            pointer-events: none;
            transform-origin: 0 0;
          }

          .dft-pipeline-runtime .react-flow__node {
            position: absolute;
            font-family: inherit;
            user-select: none;
            pointer-events: all;
            transform-origin: 0 0;
            box-sizing: border-box;
          }

          .dft-pipeline-runtime .react-flow__handle {
            position: absolute;
            width: 8px;
            height: 8px;
            min-width: 5px;
            min-height: 5px;
            background: var(--vscode-focusBorder, #1677ff);
            border: 1px solid var(--vscode-editor-background, #fff);
            border-radius: 999px;
            pointer-events: none;
          }

          .dft-pipeline-runtime .react-flow__handle-left {
            top: 50%;
            left: 0;
            transform: translate(-50%, -50%);
          }

          .dft-pipeline-runtime .react-flow__handle-right {
            top: 50%;
            right: 0;
            transform: translate(50%, -50%);
          }

          .dft-pipeline-runtime .react-flow__panel {
            position: absolute;
            z-index: 5;
            margin: 15px;
          }

          .dft-pipeline-runtime .react-flow__panel.top {
            top: 0;
          }

          .dft-pipeline-runtime .react-flow__panel.bottom {
            bottom: 0;
          }

          .dft-pipeline-runtime .react-flow__panel.left {
            left: 0;
          }

          .dft-pipeline-runtime .react-flow__panel.right {
            right: 0;
          }

          .dft-pipeline-runtime .react-flow__controls {
            display: flex;
            flex-direction: column;
            box-shadow: none;
            border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.24));
          }

          .dft-pipeline-runtime .react-flow__controls-button {
            background: var(--vscode-editor-background, #fff);
            border-bottom: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.18));
            color: var(--vscode-foreground, #222);
          }

          .dft-pipeline-runtime .react-flow__controls-button svg {
            width: 100%;
            max-width: 12px;
            max-height: 12px;
            fill: currentColor;
          }

          .dft-pipeline-runtime .react-flow__minimap-svg {
            display: block;
          }

          @media (max-width: 980px) {
            .dft-pipeline-runtime .pipeline-body {
              grid-template-columns: 1fr;
              grid-template-rows: minmax(520px, 1fr) 330px;
            }

            .dft-pipeline-runtime .pipeline-side {
              grid-template-columns: 1fr 1fr;
              grid-template-rows: 1fr;
            }
          }

          @keyframes dashdraw {
            from {
              stroke-dashoffset: 10;
            }
          }
        `}
      </style>

      <header className="pipeline-header">
        <div style={{ minWidth: 0 }}>
          <Title level={4} style={{ margin: 0 }}>
            {flowLabel}流水线运行态
          </Title>
          <Text type="secondary">左到右展示任务依赖；点击节点查看详情，失败节点可重跑，运行节点可停止。</Text>
        </div>
        <Space size={8} wrap>
          <Tag color="processing">运行中 {runningCount}</Tag>
          <Tag color={failedCount > 0 ? 'error' : 'success'}>失败 {failedCount}</Tag>
          <Tag>任务 {runtime.tasks.length}</Tag>
          <Button type="primary" icon={<PlayCircleOutlined />} href={terminalCommandUri} onClick={startPipeline}>
            启动流水线
          </Button>
          <Button danger icon={<StopOutlined />} onClick={stopAll} disabled={!canStopAll}>
            停止全部
          </Button>
          {onClose && (
            <Button icon={<CloseOutlined />} onClick={onClose}>
              关闭
            </Button>
          )}
        </Space>
      </header>

      <main className="pipeline-body">
        <div className="pipeline-canvas">
          {runtime.tasks.length === 0 ? (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
              <Empty description="尚未启动流水线" />
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              proOptions={{ hideAttribution: true }}
              fitView
              fitViewOptions={{ padding: 0.52 }}
              minZoom={0.15}
              maxZoom={1.5}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
            >
              <Background color="var(--vscode-panel-border, rgba(127,127,127,0.24))" gap={18} />
            </ReactFlow>
          )}
        </div>

        <aside className="pipeline-side">
          <section className="pipeline-panel">
            {selectedTask ? (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                  <Text strong>{selectedTask.name}</Text>
                  <Tag color={statusMeta[selectedTask.status].color}>{statusMeta[selectedTask.status].label}</Tag>
                </Space>
                <Text type="secondary">{selectedTask.description}</Text>
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="命令">
                    <Text code>{selectedTask.command}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="次数">{selectedTask.attempts}</Descriptions.Item>
                  <Descriptions.Item label="开始">{selectedTask.startedAt ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="结束">{selectedTask.finishedAt ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="耗时">{selectedTask.duration ?? '-'}</Descriptions.Item>
                </Descriptions>
                <Space size={8}>
                  {selectedTask.status === 'failed' && (
                    <Button type="primary" icon={<ReloadOutlined />} onClick={() => rerunTask(selectedTask.id)}>
                      重跑
                    </Button>
                  )}
                  {selectedTask.status === 'running' && (
                    <Button danger icon={<PauseCircleOutlined />} onClick={() => stopTask(selectedTask.id)}>
                      停止
                    </Button>
                  )}
                </Space>
                <List
                  size="small"
                  header={<Text strong>节点日志</Text>}
                  dataSource={selectedTask.logs}
                  renderItem={(item) => (
                    <List.Item>
                      <Text style={{ fontSize: 12 }}>{item}</Text>
                    </List.Item>
                  )}
                />
              </Space>
            ) : (
              <Empty description="点击节点查看详情" />
            )}
          </section>

          <section className="pipeline-panel pipeline-log">
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text strong>全局日志</Text>
              {runtime.logs.map((line, index) => (
                <Text key={`${line}-${index}`} style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 12 }}>
                  {line}
                </Text>
              ))}
            </Space>
          </section>
        </aside>
      </main>
    </section>
  );
};

export default PipelineRuntimeView;
