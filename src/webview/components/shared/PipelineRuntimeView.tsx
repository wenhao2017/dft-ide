import React, { useCallback, useEffect, useMemo } from 'react';
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

import {
  TaskStatus,
  PipelineTask,
  PipelineLink,
  pipelineFlowConfigs,
} from './pipelineMockData';
import usePipelineRuntimeStore, {
  PipelineRuntimeSnapshot,
  makeInitialRuntime,
  getPipelineRuntimeKey,
  subscribePipelineRuntimeUpdates,
} from '../../store/pipelineRuntimeStore';

interface PipelineNodeData extends Record<string, unknown> {
  task: PipelineTask;
  selected: boolean;
  onSelect: (id: string) => void;
  onRerun: (id: string) => void;
  onStop: (id: string) => void;
}

export type RuntimeState = PipelineRuntimeSnapshot;

interface PipelineRuntimeViewProps {
  flowLabel?: string;
  flowKey?: 'hibist' | 'sailor' | 'verification';
  moduleKey?: string;
  snapshot?: PipelineRuntimeSnapshot;
  readOnly?: boolean;
  onClose?: () => void;
  autoStart?: boolean;
  startToken?: number;
  stopToken?: number;
  visible?: boolean;
  onReady?: (controls: PipelineRuntimeControls) => void;
  onRuntimeChange?: (runtime: RuntimeState) => void;
}

export interface PipelineRuntimeControls {
  start: () => void;
  stop: () => void;
}

const statusMeta: Record<TaskStatus, { label: string; color: string; tone: string }> = {
  pending: { label: '等待中', color: 'default', tone: '#8c8c8c' },
  running: { label: '运行中', color: 'processing', tone: '#1677ff' },
  success: { label: '成功', color: 'success', tone: '#52c41a' },
  failed: { label: '失败', color: 'error', tone: '#ff4d4f' },
  stopped: { label: '已停止', color: 'warning', tone: '#faad14' },
  skipped: { label: '已跳过', color: 'default', tone: '#8c8c8c' },
};

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
      <Handle type="target" position={Position.Top} />
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
      <Handle type="source" position={Position.Bottom} />
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
  graph.setGraph({ rankdir: 'TB', nodesep: 38, ranksep: 58 });

  tasks.forEach((task) => graph.setNode(task.id, { width: 154, height: 96 }));
  links.forEach((link) => graph.setEdge(link.source, link.target));
  dagre.layout(graph);

  const nodes: Node<PipelineNodeData>[] = tasks.map((task) => {
    const point = graph.node(task.id) as { x: number; y: number };
    return {
      id: task.id,
      type: 'pipelineTask',
      position: { x: point.x - 77, y: point.y - 48 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
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

const PipelineRuntimeView: React.FC<PipelineRuntimeViewProps> = ({
  flowLabel = 'DFT',
  flowKey,
  moduleKey,
  snapshot,
  readOnly,
  onClose,
  autoStart,
  startToken,
  stopToken,
  visible = true,
  onReady,
  onRuntimeChange,
}) => {
  useEffect(() => {
    subscribePipelineRuntimeUpdates();
  }, []);

  const activeFlowKey =
    flowKey ??
    snapshot?.flowKey ??
    (flowLabel === '验证' || flowLabel === 'Lander'
      ? 'verification'
      : flowLabel === 'Sailor'
        ? 'sailor'
        : 'hibist');

  const config = pipelineFlowConfigs[activeFlowKey];
  const activeModuleKey = moduleKey ?? snapshot?.moduleKey ?? flowLabel;
  const runtimeKey = getPipelineRuntimeKey(activeFlowKey, activeModuleKey);
  const runtime = usePipelineRuntimeStore((state) => (
    snapshot ?? state.runtimes[runtimeKey] ?? makeInitialRuntime(activeFlowKey, activeModuleKey, flowLabel)
  ));
  const ensureRuntime = usePipelineRuntimeStore((state) => state.ensureRuntime);
  const startRuntime = usePipelineRuntimeStore((state) => state.startRuntime);
  const stopRuntime = usePipelineRuntimeStore((state) => state.stopRuntime);
  const selectRuntimeTask = usePipelineRuntimeStore((state) => state.selectTask);
  const stopRuntimeTask = usePipelineRuntimeStore((state) => state.stopTask);
  const rerunRuntimeTask = usePipelineRuntimeStore((state) => state.rerunTask);

  useEffect(() => {
    if (snapshot) {
      return;
    }
    ensureRuntime(activeFlowKey, activeModuleKey, flowLabel);
  }, [activeFlowKey, activeModuleKey, ensureRuntime, flowLabel, snapshot]);

  const startPipelineWithTerminal = useCallback(() => {
    if (readOnly) {
      return;
    }
    startRuntime(activeFlowKey, activeModuleKey, flowLabel);
  }, [activeFlowKey, activeModuleKey, flowLabel, readOnly, startRuntime]);

  const stopAll = useCallback(() => {
    if (readOnly) {
      return;
    }
    stopRuntime(activeFlowKey, activeModuleKey, flowLabel);
  }, [activeFlowKey, activeModuleKey, flowLabel, readOnly, stopRuntime]);

  useEffect(() => {
    onReady?.({
      start: startPipelineWithTerminal,
      stop: stopAll,
    });
  }, [onReady, startPipelineWithTerminal, stopAll]);

  useEffect(() => {
    onRuntimeChange?.(runtime);
  }, [onRuntimeChange, runtime]);

  useEffect(() => {
    if (autoStart) {
      startPipelineWithTerminal();
    }
  }, [autoStart, startPipelineWithTerminal]);

  useEffect(() => {
    if (startToken) {
      startPipelineWithTerminal();
    }
  }, [startPipelineWithTerminal, startToken]);

  useEffect(() => {
    if (stopToken) {
      stopAll();
    }
  }, [stopAll, stopToken]);

  const stopTask = useCallback((id: string) => {
    if (readOnly) {
      return;
    }
    stopRuntimeTask(activeFlowKey, activeModuleKey, id);
  }, [activeFlowKey, activeModuleKey, readOnly, stopRuntimeTask]);

  const rerunTask = useCallback((id: string) => {
    if (readOnly) {
      return;
    }
    rerunRuntimeTask(activeFlowKey, activeModuleKey, id);
  }, [activeFlowKey, activeModuleKey, readOnly, rerunRuntimeTask]);

  const selectTask = useCallback((id: string) => {
    if (snapshot) {
      return;
    }
    selectRuntimeTask(activeFlowKey, activeModuleKey, id);
  }, [activeFlowKey, activeModuleKey, selectRuntimeTask, snapshot]);

  const handlers = useMemo(
    () => ({ onSelect: selectTask, onRerun: rerunTask, onStop: stopTask }),
    [rerunTask, selectTask, stopTask],
  );
  const layoutTaskSignature = useMemo(
    () => runtime.tasks.map((task) => task.id).join('\u001f'),
    [runtime.tasks],
  );
  const layoutLinkSignature = useMemo(
    () => runtime.links.map((link) => `${link.source}\u001f${link.target}`).join('\u001e'),
    [runtime.links],
  );

  // Calculate Dagre node positions only when task/link topology changes.
  const layoutPositions = useMemo(() => {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'TB', nodesep: 38, ranksep: 58 });

    runtime.tasks.forEach((task) => graph.setNode(task.id, { width: 154, height: 96 }));
    runtime.links.forEach((link) => graph.setEdge(link.source, link.target));
    dagre.layout(graph);

    const positions: Record<string, { x: number; y: number }> = {};
    runtime.tasks.forEach((task) => {
      const point = graph.node(task.id) as { x: number; y: number } | undefined;
      if (point) {
        positions[task.id] = { x: point.x - 77, y: point.y - 48 };
      }
    });
    return positions;
  }, [layoutLinkSignature, layoutTaskSignature]);

  const { nodes, edges } = useMemo(() => {
    const nodes: Node<PipelineNodeData>[] = runtime.tasks.map((task) => {
      const pos = layoutPositions[task.id] ?? { x: 0, y: 0 };
      return {
        id: task.id,
        type: 'pipelineTask',
        position: pos,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          task,
          selected: task.id === runtime.selectedTaskId,
          ...handlers,
        },
        draggable: false,
      };
    });

    const edges: Edge[] = runtime.links.map((link) => ({
      id: `${link.source}-${link.target}`,
      source: link.source,
      target: link.target,
      animated: runtime.tasks.find((task) => task.id === link.source)?.status === 'running',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: {
        stroke: 'var(--vscode-focusBorder, #1677ff)',
        strokeWidth: 1.7,
      },
    }));

    return { nodes, edges };
  }, [layoutPositions, runtime.tasks, runtime.links, runtime.selectedTaskId, handlers]);
  const selectedTask = runtime.tasks.find((task) => task.id === runtime.selectedTaskId);
  const failedCount = runtime.tasks.filter((task) => task.status === 'failed').length;
  const runningCount = runtime.tasks.filter((task) => task.status === 'running').length;
  const canStopAll = !readOnly && runtime.tasks.some((task) => task.status === 'running' || task.status === 'pending');

  if (!visible) {
    return null;
  }

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

          .dft-pipeline-runtime .react-flow__handle-top {
            top: 0;
            left: 50%;
            transform: translate(-50%, -50%);
          }

          .dft-pipeline-runtime .react-flow__handle-bottom {
            bottom: 0;
            left: 50%;
            transform: translate(-50%, 50%);
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
            {config.title}运行态
          </Title>
          <Text type="secondary">左到右展示任务依赖；点击节点查看详情，失败节点可重跑，运行节点可停止。</Text>
        </div>
        <Space size={8} wrap>
          <Tag color="processing">运行中 {runningCount}</Tag>
          <Tag color={failedCount > 0 ? 'error' : 'success'}>失败 {failedCount}</Tag>
          <Tag>任务 {runtime.tasks.length}</Tag>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={startPipelineWithTerminal} disabled={readOnly}>
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
                    <Button type="primary" icon={<ReloadOutlined />} onClick={() => rerunTask(selectedTask.id)} disabled={readOnly}>
                      重跑
                    </Button>
                  )}
                  {selectedTask.status === 'running' && (
                    <Button danger icon={<PauseCircleOutlined />} onClick={() => stopTask(selectedTask.id)} disabled={readOnly}>
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
