import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { PipelineTask, TaskStatus, pipelineFlowConfigs } from './pipelineMockData';

const { Text } = Typography;

type FlowKey = 'hibist' | 'sailor' | 'verification';
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
  flowKey: FlowKey;
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

const now = () => new Date().toLocaleTimeString();

function makeInitialTaskCounter(flowKey: FlowKey): number {
  const config = pipelineFlowConfigs[flowKey];
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
    description,
    status,
    attempts: 1,
    logs: [],
  });

  return config.getInitialTasks(makeTask).length;
}

const PipelineExecutionOverview: React.FC<PipelineExecutionOverviewProps> = ({
  flowKey,
  flowLabel,
  moduleKeys,
}) => {
  const timers = useRef<Record<string, number[]>>({});
  const [runs, setRuns] = useState<Record<string, PipelineRunOverview>>({});
  const [runtimeStartTokens, setRuntimeStartTokens] = useState<Record<string, number>>({});
  const [runtimeStopTokens, setRuntimeStopTokens] = useState<Record<string, number>>({});
  const [runtimeModuleKeys, setRuntimeModuleKeys] = useState<string[]>([]);
  const [activeRuntimeModule, setActiveRuntimeModule] = useState<string>();

  const selectedModuleKeys = useMemo(() => {
    const cleanKeys = moduleKeys.map((key) => key.trim()).filter(Boolean);
    return Array.from(new Set(cleanKeys));
  }, [moduleKeys]);

  const visibleRuns = selectedModuleKeys.map((moduleKey) => runs[moduleKey] ?? {
    moduleKey,
    runState: 'idle' as OverviewRunState,
    total: makeInitialTaskCounter(flowKey),
    completed: 0,
    running: 0,
    failed: 0,
    logs: [`${moduleKey} 已加入执行队列，等待启动。`],
  });

  const clearModuleTimers = useCallback((moduleKey: string) => {
    timers.current[moduleKey]?.forEach((timer) => window.clearTimeout(timer));
    timers.current[moduleKey] = [];
  }, []);

  const schedule = useCallback((moduleKey: string, delay: number, action: () => void) => {
    const timer = window.setTimeout(action, delay);
    timers.current[moduleKey] = [...(timers.current[moduleKey] ?? []), timer];
  }, []);

  const startRun = useCallback((moduleKey: string) => {
    clearModuleTimers(moduleKey);
    const total = makeInitialTaskCounter(flowKey);
    const startedAt = now();

    setRuntimeModuleKeys((prev) => (
      prev.includes(moduleKey) ? prev : [...prev, moduleKey]
    ));
    setRuntimeStartTokens((prev) => ({
      ...prev,
      [moduleKey]: (prev[moduleKey] ?? 0) + 1,
    }));

    setRuns((prev) => ({
      ...prev,
      [moduleKey]: {
        moduleKey,
        runState: 'running',
        total,
        completed: 0,
        running: Math.min(1, total),
        failed: 0,
        startedAt,
        logs: [`[${startedAt}] ${flowLabel} ${moduleKey} 流水线已启动。`],
      },
    }));

    schedule(moduleKey, 900, () => {
      setRuns((prev) => {
        const current = prev[moduleKey];
        if (!current || current.runState !== 'running') return prev;
        return {
          ...prev,
          [moduleKey]: {
            ...current,
            completed: Math.max(1, Math.floor(total * 0.35)),
            running: Math.min(2, total),
            logs: [...current.logs, `[${now()}] ${moduleKey} 已完成环境准备，进入任务编排。`],
          },
        };
      });
    });

    schedule(moduleKey, 2100, () => {
      setRuns((prev) => {
        const current = prev[moduleKey];
        if (!current || current.runState !== 'running') return prev;
        return {
          ...prev,
          [moduleKey]: {
            ...current,
            completed: Math.max(current.completed, Math.floor(total * 0.72)),
            running: 1,
            logs: [...current.logs, `[${now()}] ${moduleKey} 关键执行节点已通过，等待结果收敛。`],
          },
        };
      });
    });

    schedule(moduleKey, 3600, () => {
      setRuns((prev) => {
        const current = prev[moduleKey];
        if (!current || current.runState !== 'running') return prev;
        return {
          ...prev,
          [moduleKey]: {
            ...current,
            runState: 'completed',
            completed: total,
            running: 0,
            failed: 0,
            finishedAt: now(),
            logs: [...current.logs, `[${now()}] ${moduleKey} 流水线执行完成。`],
          },
        };
      });
    });
  }, [clearModuleTimers, flowKey, flowLabel, schedule]);

  const startSelectedRuns = useCallback(() => {
    selectedModuleKeys.forEach((moduleKey) => startRun(moduleKey));
  }, [selectedModuleKeys, startRun]);

  const stopRun = useCallback((moduleKey: string) => {
    clearModuleTimers(moduleKey);
    setRuntimeStopTokens((prev) => ({
      ...prev,
      [moduleKey]: (prev[moduleKey] ?? 0) + 1,
    }));
    setRuns((prev) => {
      const current = prev[moduleKey];
      if (!current) return prev;
      return {
        ...prev,
        [moduleKey]: {
          ...current,
          runState: 'stopped',
          running: 0,
          finishedAt: now(),
          logs: [...current.logs, `[${now()}] ${moduleKey} 已手动停止。`],
        },
      };
    });
  }, [clearModuleTimers]);

  const stopAll = useCallback(() => {
    selectedModuleKeys.forEach((moduleKey) => stopRun(moduleKey));
  }, [selectedModuleKeys, stopRun]);

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
                          onClick={() => setActiveRuntimeModule(run.moduleKey)}
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
          flowLabel={`${flowLabel} / ${moduleKey}`}
          startToken={runtimeStartTokens[moduleKey] ?? 0}
          stopToken={runtimeStopTokens[moduleKey] ?? 0}
          visible={moduleKey === activeRuntimeModule}
          onClose={() => setActiveRuntimeModule(undefined)}
        />
      ))}
    </>
  );
};

export default PipelineExecutionOverview;
