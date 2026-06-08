import React, { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Empty,
  List,
  Progress,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  FullscreenOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import PipelineRuntimeView from './PipelineRuntimeView';
import usePipelineRuntimeStore, {
  PipelineFlowKey,
  PipelineRuntimeSnapshot,
  getInitialTaskCount,
  getPipelineRuntimeKey,
} from '../../store/pipelineRuntimeStore';

const { Text } = Typography;

type OverviewRunState = 'idle' | 'running' | 'completed' | 'stopped';

interface PipelineRunOverview {
  moduleKey: string;
  runState: OverviewRunState;
  total: number;
  completed: number;
  running: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
  logs: string[];
}

interface PipelineExecutionOverviewProps {
  flowKey: PipelineFlowKey;
  flowLabel: string;
  moduleKeys: string[];
}

const statusText: Record<OverviewRunState, string> = {
  idle: '未启动',
  running: '运行中',
  completed: '已完成',
  stopped: '已停止',
};

const statusColor: Record<OverviewRunState, string> = {
  idle: 'default',
  running: 'processing',
  completed: 'success',
  stopped: 'warning',
};

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
  const running = tasks.filter((task) => task.status === 'running').length;
  const failed = tasks.filter((task) => task.status === 'failed').length;
  const startedAt = tasks.find((task) => task.startedAt)?.startedAt;
  const finishedAt = [...tasks].reverse().find((task) => task.finishedAt)?.finishedAt;

  return {
    moduleKey,
    runState: runtime?.runState ?? 'idle',
    total,
    completed,
    running,
    failed,
    startedAt,
    finishedAt,
    logs: runtime?.logs.length ? runtime.logs : [`${moduleKey} 已加入执行队列，等待启动。`],
  };
}

const PipelineExecutionOverview: React.FC<PipelineExecutionOverviewProps> = ({
  flowKey,
  flowLabel,
  moduleKeys,
}) => {
  const runtimes = usePipelineRuntimeStore((state) => state.runtimes);
  const ensureRuntime = usePipelineRuntimeStore((state) => state.ensureRuntime);
  const startRuntime = usePipelineRuntimeStore((state) => state.startRuntime);
  const stopRuntime = usePipelineRuntimeStore((state) => state.stopRuntime);
  const [runtimeModuleKeys, setRuntimeModuleKeys] = useState<string[]>([]);
  const [activeRuntimeModule, setActiveRuntimeModule] = useState<string>();

  const selectedModuleKeys = useMemo(() => {
    const cleanKeys = moduleKeys.map((key) => key.trim()).filter(Boolean);
    return Array.from(new Set(cleanKeys));
  }, [moduleKeys]);

  const getFlowLabel = useCallback((moduleKey: string) => `${flowLabel} / ${moduleKey}`, [flowLabel]);

  const ensureRuntimeVisible = useCallback((moduleKey: string) => {
    ensureRuntime(flowKey, moduleKey, getFlowLabel(moduleKey));
    setRuntimeModuleKeys((prev) => (
      prev.includes(moduleKey) ? prev : [...prev, moduleKey]
    ));
  }, [ensureRuntime, flowKey, getFlowLabel]);

  const startRun = useCallback((moduleKey: string) => {
    ensureRuntimeVisible(moduleKey);
    startRuntime(flowKey, moduleKey, getFlowLabel(moduleKey));
  }, [ensureRuntimeVisible, flowKey, getFlowLabel, startRuntime]);

  const stopRun = useCallback((moduleKey: string) => {
    ensureRuntimeVisible(moduleKey);
    stopRuntime(flowKey, moduleKey, getFlowLabel(moduleKey));
  }, [ensureRuntimeVisible, flowKey, getFlowLabel, stopRuntime]);

  const startSelectedRuns = useCallback(() => {
    selectedModuleKeys.forEach((moduleKey) => startRun(moduleKey));
  }, [selectedModuleKeys, startRun]);

  const stopAll = useCallback(() => {
    selectedModuleKeys.forEach((moduleKey) => stopRun(moduleKey));
  }, [selectedModuleKeys, stopRun]);

  const openRuntime = useCallback((moduleKey: string) => {
    ensureRuntimeVisible(moduleKey);
    setActiveRuntimeModule(moduleKey);
  }, [ensureRuntimeVisible]);

  const visibleRuns = selectedModuleKeys.map((moduleKey) => {
    const runtime = runtimes[getPipelineRuntimeKey(flowKey, moduleKey)];
    return summarizeRuntime(moduleKey, flowKey, runtime);
  });
  const runningCount = visibleRuns.filter((run) => run.runState === 'running').length;
  const completedCount = visibleRuns.filter((run) => run.runState === 'completed').length;
  const failedCount = visibleRuns.reduce((sum, run) => sum + run.failed, 0);
  const mountedRuntimeModuleKeys = Array.from(new Set([
    ...runtimeModuleKeys,
    ...(activeRuntimeModule ? [activeRuntimeModule] : []),
  ]));

  return (
    <>
      <Card
        size="small"
        title="流水线总览"
        extra={<Tag color="processing">当前页面可批量执行</Tag>}
        style={{ borderRadius: 8 }}
      >
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Space size={16} wrap>
            <Statistic title="已选模块" value={selectedModuleKeys.length} />
            <Statistic title="运行中" value={runningCount} />
            <Statistic title="已完成" value={completedCount} />
            <Statistic title="失败" value={failedCount} valueStyle={{ color: failedCount ? '#ff4d4f' : undefined }} />
          </Space>

          <Space wrap>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              disabled={!selectedModuleKeys.length}
              onClick={startSelectedRuns}
            >
              启动所选模块
            </Button>
            <Button icon={<ReloadOutlined />} disabled={!selectedModuleKeys.length} onClick={startSelectedRuns}>
              重新启动所选
            </Button>
            <Button danger icon={<StopOutlined />} onClick={stopAll} disabled={!visibleRuns.some((run) => run.runState === 'running')}>
              停止全部
            </Button>
          </Space>

          {visibleRuns.length ? (
            <List
              size="small"
              dataSource={visibleRuns}
              renderItem={(run) => {
                const percent = run.total > 0 ? Math.round((run.completed / run.total) * 100) : 0;
                const latestLog = run.logs[run.logs.length - 1];
                return (
                  <List.Item
                    actions={[
                      <Tooltip title="启动" key="start">
                        <Button size="small" type="text" icon={<PlayCircleOutlined />} onClick={() => startRun(run.moduleKey)} />
                      </Tooltip>,
                      <Tooltip title="停止" key="stop">
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<PauseCircleOutlined />}
                          disabled={run.runState !== 'running'}
                          onClick={() => stopRun(run.moduleKey)}
                        />
                      </Tooltip>,
                      <Tooltip title="打开流水线详情" key="open">
                        <Button
                          size="small"
                          type="text"
                          icon={<FullscreenOutlined />}
                          onClick={() => openRuntime(run.moduleKey)}
                        />
                      </Tooltip>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<Badge status={run.runState === 'running' ? 'processing' : run.runState === 'completed' ? 'success' : 'default'} />}
                      title={
                        <Space size={8} wrap>
                          <Text strong>{run.moduleKey}</Text>
                          <Tag color={statusColor[run.runState]}>{statusText[run.runState]}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {run.startedAt ? `启动 ${run.startedAt}` : '等待启动'}
                          </Text>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Progress percent={percent} size="small" status={run.runState === 'stopped' ? 'exception' : undefined} />
                          <Text type="secondary" ellipsis={{ tooltip: latestLog }}>
                            {latestLog}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请在左侧模块配置中选择执行模块" />
          )}
        </Space>
      </Card>

      {mountedRuntimeModuleKeys.map((moduleKey) => (
        <PipelineRuntimeView
          key={moduleKey}
          flowKey={flowKey}
          moduleKey={moduleKey}
          flowLabel={getFlowLabel(moduleKey)}
          visible={moduleKey === activeRuntimeModule}
          onClose={() => setActiveRuntimeModule(undefined)}
        />
      ))}
    </>
  );
};

export default PipelineExecutionOverview;
