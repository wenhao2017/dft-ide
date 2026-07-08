import React, { useEffect, useMemo, useState } from 'react';
import 'antd/dist/reset.css';
import {
  Button,
  ConfigProvider,
  Empty,
  Input,
  message,
  Modal,
  Select,
  Slider,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { PlayCircleOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';

type FlowStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'paused';
type FlowMode = 'prod' | 'sim' | 'debug';
type NodeStatus = 'pending' | 'processing' | 'success' | 'failed';
type PresetType = 'plan' | 'env' | 'sim' | 'full';
type StatusFilter = 'all' | FlowStatus;

interface NodeItem {
  id: string;
  name: string;
  status: NodeStatus;
  duration: string;
  metric: string;
}

interface FlowItem {
  id: string;
  name: string;
  status: FlowStatus;
  progress: number;
  totalSteps: number;
  startTime: string;
  ramUsage: string;
  cpuUsage: string;
  networkIo: string;
  version: string;
  runId: string;
  mode: FlowMode;
  nodes: NodeItem[];
}

interface PathConfig {
  id: string;
  group: string;
  tc: string;
  subAttr: string;
  path: string;
}

interface RunConfiguration {
  id: string;
  name: string;
  mode: FlowMode;
  stepsMin: number;
  stepsMax: number;
  preset: PresetType | null;

  groupFilter: string[];
  tcFilter: string[];
  subAttrFilter: string[];

  groupEnabled: boolean;
  tcEnabled: boolean;
  subAttrEnabled: boolean;

  historicalParamStrategy: string;
  strategyNameInput: string;

  selectedPathIds: string[];
  paths: PathConfig[];
}

const getPopupContainer = (triggerNode: HTMLElement) =>
  triggerNode.parentElement || document.body;

const initialPaths: PathConfig[] = [
  {
    id: 'path_001',
    group: 'Core_Services',
    tc: 'TC_001',
    subAttr: 'Verbose_Log',
    path: 'Core_Services > TC_001 > Verbose_Log',
  },
  {
    id: 'path_002',
    group: 'Core_Services',
    tc: 'TC_042',
    subAttr: 'Cache_Flush',
    path: 'Core_Services > TC_042 > Cache_Flush',
  },
  {
    id: 'path_003',
    group: 'Data_Pipeline',
    tc: 'Pipeline_02',
    subAttr: 'Retry_Limit',
    path: 'Data_Pipeline > Pipeline_02 > Retry_Limit',
  },
  {
    id: 'path_004',
    group: 'Auth_Module',
    tc: 'SEC_88',
    subAttr: 'Token_Expiry',
    path: 'Auth_Module > SEC_88 > Token_Expiry',
  },
  {
    id: 'path_005',
    group: 'Core_Services',
    tc: 'TC_001',
    subAttr: 'Cache_Flush',
    path: 'Core_Services > TC_001 > Cache_Flush',
  },
  {
    id: 'path_006',
    group: 'Data_Pipeline',
    tc: 'Pipeline_02',
    subAttr: 'Verbose_Log',
    path: 'Data_Pipeline > Pipeline_02 > Verbose_Log',
  },
  {
    id: 'path_007',
    group: 'Auth_Module',
    tc: 'SEC_88',
    subAttr: 'Retry_Limit',
    path: 'Auth_Module > SEC_88 > Retry_Limit',
  },
  {
    id: 'path_008',
    group: 'Core_Services',
    tc: 'TC_042',
    subAttr: 'Token_Expiry',
    path: 'Core_Services > TC_042 > Token_Expiry',
  },
  {
    id: 'path_009',
    group: 'Scan_Chain',
    tc: 'SCAN_88',
    subAttr: 'Verbose_Log',
    path: 'Scan_Chain > SCAN_88 > Verbose_Log',
  },
  {
    id: 'path_010',
    group: 'MBIST',
    tc: 'MBIST_12',
    subAttr: 'Retry_Limit',
    path: 'MBIST > MBIST_12 > Retry_Limit',
  },
  {
    id: 'path_011',
    group: 'IJTAG',
    tc: 'IJTAG_03',
    subAttr: 'Token_Expiry',
    path: 'IJTAG > IJTAG_03 > Token_Expiry',
  },
  {
    id: 'path_012',
    group: 'Data_Pipeline',
    tc: 'Pipeline_02',
    subAttr: 'Cache_Flush',
    path: 'Data_Pipeline > Pipeline_02 > Cache_Flush',
  },
];

const groupOptions = [
  { value: 'All', label: 'Group: All' },
  { value: 'Core_Services', label: 'Core_Services' },
  { value: 'Data_Pipeline', label: 'Data_Pipeline' },
  { value: 'Auth_Module', label: 'Auth_Module' },
  { value: 'Scan_Chain', label: 'Scan_Chain' },
  { value: 'MBIST', label: 'MBIST' },
  { value: 'IJTAG', label: 'IJTAG' },
];

const tcOptions = [
  { value: 'All', label: 'TC: All' },
  { value: 'TC_001', label: 'TC_001' },
  { value: 'TC_042', label: 'TC_042' },
  { value: 'Pipeline_02', label: 'Pipeline_02' },
  { value: 'SEC_88', label: 'SEC_88' },
  { value: 'SCAN_88', label: 'SCAN_88' },
  { value: 'MBIST_12', label: 'MBIST_12' },
  { value: 'IJTAG_03', label: 'IJTAG_03' },
];

const subAttrOptions = [
  { value: 'All', label: 'SubAttr: All' },
  { value: 'Verbose_Log', label: 'Verbose_Log' },
  { value: 'Cache_Flush', label: 'Cache_Flush' },
  { value: 'Retry_Limit', label: 'Retry_Limit' },
  { value: 'Token_Expiry', label: 'Token_Expiry' },
];

function normalizeMultiSelect(nextValue: string[]) {
  if (nextValue.length === 0) return ['All'];

  const lastValue = nextValue[nextValue.length - 1];

  if (lastValue === 'All') return ['All'];

  return nextValue.filter((item) => item !== 'All');
}

function matchMultiFilter(
  enabled: boolean,
  selectedValues: string[],
  currentValue: string
) {
  if (!enabled) return true;
  if (selectedValues.includes('All')) return true;

  return selectedValues.includes(currentValue);
}

function formatRuntimeTime() {
  const now = new Date();

  return `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${now
    .getSeconds()
    .toString()
    .padStart(2, '0')}.${now
    .getMilliseconds()
    .toString()
    .padStart(3, '0')
    .slice(0, 2)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getNodeStatusLabel(status: NodeStatus) {
  const map: Record<NodeStatus, string> = {
    pending: 'PENDING',
    processing: 'RUNNING',
    success: 'PASS',
    failed: 'FAILED',
  };

  return map[status];
}

function getNodeStatusClass(status: NodeStatus) {
  if (status === 'success') return 'dftx-node-success';
  if (status === 'processing') return 'dftx-node-processing';
  if (status === 'failed') return 'dftx-node-failed';
  return 'dftx-node-pending';
}

function generateNodesForFlow(
  flowName: string,
  status: FlowStatus,
  progress: number,
  totalSteps: number
): NodeItem[] {
  return Array.from({ length: totalSteps }, (_, index) => {
    const step = index + 1;
    let nodeStatus: NodeStatus = 'pending';

    if (status === 'completed') {
      nodeStatus = 'success';
    } else if (status === 'failed') {
      if (index < progress) nodeStatus = 'success';
      else if (index === progress) nodeStatus = 'failed';
    } else if (status === 'running') {
      if (index < progress) nodeStatus = 'success';
      else if (index === progress) nodeStatus = 'processing';
    } else if (status === 'paused') {
      if (index < progress) nodeStatus = 'success';
      else if (index === progress) nodeStatus = 'processing';
    }

    return {
      id: `${flowName}_${step}`,
      name: `step_${step.toString().padStart(2, '0')}_${flowName
        .toLowerCase()
        .replace(/\s+/g, '_')}`,
      status: nodeStatus,
      duration:
        nodeStatus === 'pending'
          ? '--'
          : `${(0.8 + Math.random() * 4.8).toFixed(1)}s`,
      metric: getNodeStatusLabel(nodeStatus),
    };
  });
}

function createFlow(params: {
  id: string;
  name: string;
  status: FlowStatus;
  progress: number;
  totalSteps: number;
  mode: FlowMode;
  startTime: string;
  runId: string;
  version?: string;
}): FlowItem {
  return {
    ...params,
    version: params.version ?? 'v1.0.0',
    ramUsage:
      params.status === 'running'
        ? '1.3GB RAM'
        : params.status === 'paused'
        ? '0.5GB RAM'
        : '0.0GB RAM',
    cpuUsage:
      params.status === 'running'
        ? '38% CPU'
        : params.status === 'paused'
        ? '2% CPU'
        : '0% CPU',
    networkIo:
      params.status === 'running'
        ? '1.1GB/s'
        : params.status === 'paused'
        ? '0.0MB/s'
        : '0.0MB/s',
    nodes: generateNodesForFlow(
      params.name,
      params.status,
      params.progress,
      params.totalSteps
    ),
  };
}

const initialFlows: FlowItem[] = [
  createFlow({
    id: '0x82f6a',
    name: 'Alpha_Core_Regress',
    status: 'running',
    progress: 4,
    totalSteps: 12,
    mode: 'sim',
    startTime: '14:22:10.08',
    runId: 'RUN_4288_SIM',
    version: 'v1.2.4',
  }),
  createFlow({
    id: '0x19ac2',
    name: 'MBIST_Nightly_Check',
    status: 'completed',
    progress: 10,
    totalSteps: 10,
    mode: 'prod',
    startTime: '13:08:44.19',
    runId: 'RUN_3112_PRD',
    version: 'v1.1.8',
  }),
  createFlow({
    id: '0xf12d9',
    name: 'Fault_Injection_Debug',
    status: 'failed',
    progress: 3,
    totalSteps: 8,
    mode: 'debug',
    startTime: '15:01:32.41',
    runId: 'RUN_9917_DBG',
    version: 'v0.9.7',
  }),
  createFlow({
    id: '0x70bc1',
    name: 'IJTAG_Queue_Smoke',
    status: 'waiting',
    progress: 0,
    totalSteps: 6,
    mode: 'sim',
    startTime: '--:--:--',
    runId: 'RUN_6204_WAIT',
    version: 'v1.0.3',
  }),
];

function getFlowStepDotClass(status: NodeStatus) {
  if (status === 'success') return 'is-done';
  if (status === 'processing') return 'is-active';
  if (status === 'failed') return 'is-failed';
  return 'is-pending';
}

function FlowCard({
  flow,
  isSelected,
  onSelect,
  onRun,
  onStop,
}: {
  flow: FlowItem;
  isSelected: boolean;
  onSelect: () => void;
  onRun: (id: string, event: React.MouseEvent) => void;
  onStop: (id: string, event: React.MouseEvent) => void;
}) {
  const visibleNodes = flow.nodes.slice(0, 24);
  const canRun = flow.status !== 'running';
  const canStop =
    flow.status === 'running' ||
    flow.status === 'paused' ||
    flow.status === 'waiting';

  return (
    <div
      className={[
        'dftx-flow-card',
        isSelected ? 'is-selected' : '',
        flow.status === 'failed' ? 'is-failed' : '',
        flow.status === 'running' ? 'is-running' : '',
        flow.status === 'paused' ? 'is-paused' : '',
      ].join(' ')}
      onClick={onSelect}
    >
      <div className="dftx-flow-card-header">
        <div className="dftx-flow-card-header-left">
          <span className="dftx-flow-title">{flow.name}</span>
        </div>

        <div className="dftx-flow-card-actions" onClick={(event) => event.stopPropagation()}>
          <Tooltip title={canRun ? '运行' : '正在运行'}>
            <span>
              <Button
                size="small"
                type="text"
                aria-label="运行"
                disabled={!canRun}
                icon={<PlayCircleOutlined />}
                className="dftx-flow-icon-btn is-run"
                onClick={(event) => onRun(flow.id, event)}
              />
            </span>
          </Tooltip>

          <Tooltip title={canStop ? '停止' : '不可停止'}>
            <span>
              <Button
                size="small"
                type="text"
                danger
                aria-label="停止"
                disabled={!canStop}
                icon={<StopOutlined />}
                className="dftx-flow-icon-btn is-stop"
                onClick={(event) => onStop(flow.id, event)}
              />
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="dftx-flow-track">
        <div className="dftx-flow-track-line" />
        <div className="dftx-flow-step-dots">
          {visibleNodes.map((node, index) => (
            <Tooltip
              key={node.id}
              title={`${node.name || `步骤 ${index + 1}`} [${getNodeStatusLabel(node.status)}]`}
            >
              <button
                type="button"
                aria-label={`查看步骤 ${node.name}`}
                className={`dftx-flow-step-dot ${getFlowStepDotClass(node.status)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect();
                }}
              />
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="dftx-detail-metric-item">
      <span>{label}</span>
      <b className={highlight ? 'is-highlight' : ''}>{value}</b>
    </div>
  );
}

function FlowInspector({ flow }: { flow: FlowItem | undefined }) {
  if (!flow) {
    return (
      <aside className="dftx-detail-panel dftx-detail-empty">
        <Empty description="请选择一个 Flow 查看执行详情" />
      </aside>
    );
  }

  const activeNodeId =
    flow.nodes.find((node) => node.status === 'failed' || node.status === 'processing')?.id ??
    flow.nodes[0]?.id;

  return (
    <aside className="dftx-detail-panel">
      <div className="dftx-detail-header">
        <div className="dftx-detail-title-wrap">
          <div className="dftx-detail-eyebrow">模块流水线</div>
          <div className="dftx-detail-module-row">
            <Typography.Text className="dftx-detail-module-name" ellipsis>
              {flow.name}
            </Typography.Text>
          </div>
        </div>

        <div className="dftx-detail-header-meta">
          <Tag className="dftx-detail-count-tag">共 {flow.nodes.length} 步</Tag>
          <span className="dftx-run-id">{flow.runId}</span>
        </div>
      </div>

      <div className="dftx-detail-body">
        <div className="dftx-detail-metrics-bar">
          <DetailMetric label="CPU" value={flow.cpuUsage || '0% CPU'} highlight />
          <DetailMetric label="内存" value={flow.ramUsage || '--'} />
          <DetailMetric label="开始" value={flow.startTime} />
          <DetailMetric label="IO" value={flow.networkIo || '0.0MB/s'} />
        </div>

        <section className="dftx-task-section">
          <div className="dftx-task-section-header">
            <div className="dftx-section-title">节点列表</div>
          </div>

          <div className="dftx-task-list">
            {flow.nodes.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无节点" />
            ) : (
              flow.nodes.map((node) => {
                const isSelected = node.id === activeNodeId;
                const isRunning = node.status === 'processing';

                return (
                  <div
                    key={node.id}
                    className={[
                      'dftx-task-node',
                      getNodeStatusClass(node.status),
                      isSelected ? 'is-selected' : '',
                      isRunning ? 'is-running' : '',
                    ].join(' ')}
                  >
                    <div className="dftx-task-item">
                      <div className="dftx-task-main">
                        <span className="dftx-task-name">{node.name}</span>
                      </div>

                      <Tag className="dftx-task-status-tag">
                        {getNodeStatusLabel(node.status)}
                      </Tag>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="dftx-toggle-row">
      <span>{label}</span>
      <Switch size="small" checked={checked} onChange={onChange} />
    </div>
  );
}

function RunConfigModal({
  open,
  onClose,
  onExecute,
  onAddMessage,
  initialMode = 'sim',
}: {
  open: boolean;
  onClose: () => void;
  onExecute: (config: RunConfiguration) => void;
  onAddMessage: (type: 'success' | 'error' | 'info' | 'warning', text: string) => void;
  initialMode?: FlowMode;
}) {
  const [mode, setMode] = useState<FlowMode>(initialMode);
  const [stepsMin, setStepsMin] = useState(1);
  const [stepsMax, setStepsMax] = useState(12);
  const [preset, setPreset] = useState<PresetType | null>('plan');

  const [groupFilter, setGroupFilter] = useState<string[]>(['All']);
  const [tcFilter, setTcFilter] = useState<string[]>(['All']);
  const [subAttrFilter, setSubAttrFilter] = useState<string[]>(['All']);

  const [groupEnabled, setGroupEnabled] = useState(true);
  const [tcEnabled, setTcEnabled] = useState(true);
  const [subAttrEnabled, setSubAttrEnabled] = useState(false);

  const [historicalParamStrategy, setHistoricalParamStrategy] =
    useState('选择历史参数策略...');
  const [strategyNameInput, setStrategyNameInput] = useState('');

  const [paths] = useState<PathConfig[]>(initialPaths);
  const [selectedPathIds, setSelectedPathIds] = useState<string[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (!open) return;

    setMode(initialMode);
  }, [open, initialMode]);

  useEffect(() => {
    const max = mode === 'prod' ? 24 : mode === 'sim' ? 12 : 6;

    setStepsMin(1);
    setStepsMax(max);
  }, [mode]);

  useEffect(() => {
    setPage(1);
  }, [groupFilter, tcFilter, subAttrFilter, groupEnabled, tcEnabled, subAttrEnabled]);

  const maxStepLimit = mode === 'prod' ? 24 : mode === 'sim' ? 12 : 6;

  const filteredPaths = useMemo(() => {
    return paths.filter((item) => {
      const groupMatched = matchMultiFilter(groupEnabled, groupFilter, item.group);
      const tcMatched = matchMultiFilter(tcEnabled, tcFilter, item.tc);
      const subAttrMatched = matchMultiFilter(
        subAttrEnabled,
        subAttrFilter,
        item.subAttr
      );

      return groupMatched && tcMatched && subAttrMatched;
    });
  }, [
    paths,
    groupEnabled,
    tcEnabled,
    subAttrEnabled,
    groupFilter,
    tcFilter,
    subAttrFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredPaths.length / pageSize));

  const pagedPaths = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return filteredPaths.slice(start, start + pageSize);
  }, [filteredPaths, page, pageSize, totalPages]);

  const allPagedSelected =
    pagedPaths.length > 0 && pagedPaths.every((item) => selectedPathIds.includes(item.id));

  const handleTogglePath = (id: string) => {
    setSelectedPathIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }

      return [...prev, id];
    });
  };

  const handleToggleCurrentPageAll = () => {
    const currentPageIds = pagedPaths.map((item) => item.id);

    setSelectedPathIds((prev) => {
      if (currentPageIds.every((id) => prev.includes(id))) {
        return prev.filter((id) => !currentPageIds.includes(id));
      }

      return Array.from(new Set([...prev, ...currentPageIds]));
    });
  };

  const cancelPresetByManualStepChange = () => {
  setPreset(null);
};

const handleStepsRangeChange = (value: number | number[]) => {
  if (!Array.isArray(value)) return;

  const [nextMin, nextMax] = value;

  setStepsMin(clamp(nextMin, 1, maxStepLimit));
  setStepsMax(clamp(nextMax, nextMin, maxStepLimit));
  cancelPresetByManualStepChange();
};

  const handlePresetSelect = (value: PresetType) => {
    setPreset(value);

    if (value === 'plan') {
      setGroupEnabled(true);
      setTcEnabled(true);
      setSubAttrEnabled(false);
    } else if (value === 'env') {
      setGroupEnabled(true);
      setTcEnabled(false);
      setSubAttrEnabled(true);
    } else if (value === 'sim') {
      setGroupEnabled(true);
      setTcEnabled(true);
      setSubAttrEnabled(true);
    } else {
      setGroupEnabled(true);
      setTcEnabled(true);
      setSubAttrEnabled(true);
      setGroupFilter(['All']);
      setTcFilter(['All']);
      setSubAttrFilter(['All']);
    }

    onAddMessage('info', `配置预设切换为: ${value.toUpperCase()}`);
  };

  const handleSaveStrategy = () => {
    const name = strategyNameInput.trim();

    if (!name) {
      onAddMessage('warning', '请输入策略名称');
      return;
    }

    onAddMessage('success', `策略「${name}」已保存`);
  };

  const handleExecute = () => {
    if (stepsMin > stepsMax) {
      onAddMessage('error', '步骤范围错误: Min 不能大于 Max');
      return;
    }

    const selectedPaths =
      selectedPathIds.length > 0
        ? filteredPaths.filter((item) => selectedPathIds.includes(item.id))
        : filteredPaths;

    const config: RunConfiguration = {
      id: `run_${Date.now()}`,
      name: `Flow_Custom_${Math.floor(100 + Math.random() * 899)}`,
      mode,
      stepsMin,
      stepsMax,
      preset,
      groupFilter,
      tcFilter,
      subAttrFilter,
      groupEnabled,
      tcEnabled,
      subAttrEnabled,
      historicalParamStrategy,
      strategyNameInput,
      selectedPathIds,
      paths: selectedPaths,
    };

    onExecute(config);
  };

  const gotoPrevPage = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const gotoNextPage = () => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  };

  const visiblePageNumbers = Array.from(
    { length: Math.min(totalPages, 4) },
    (_, index) => index + 1
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width="min(1120px, 94vw)"
      centered
      footer={null}
      destroyOnClose={false}
      getContainer={false}
      maskClosable={false}
      maskStyle={{
        background: 'rgba(11, 19, 38, 0.8)',
        backdropFilter: 'blur(4px)',
      }}
      className="dftx-run-modal-ref"
      title={
        <div className="dftx-ref-modal-title">
          <span className="dftx-title-symbol">▣</span>
          <span className="dftx-ref-modal-title-main">运行配置</span>
          <span className="dftx-ref-modal-subtitle">Flow Parameters / Steps / Filters</span>
        </div>
      }
      closeIcon={<span className="dftx-close-x">×</span>}
    >
      <div className="dftx-ref-modal-body">
        <div className="dftx-ref-block">
          <label className="dftx-ref-label">模式选择 (MODE SELECTION)</label>
          <Select
            getPopupContainer={getPopupContainer}
            value={mode}
            onChange={(value) => setMode(value as FlowMode)}
            className="dftx-ref-select"
            options={[
              { value: 'prod', label: '生产模式 (Production) - Range: 1-24' },
              { value: 'sim', label: '仿真模式 (Simulation) - Range: 1-12' },
              { value: 'debug', label: '调试模式 (Debug) - Range: 1-6' },
            ]}
          />
        </div>

        <div className="dftx-ref-block">
          <label className="dftx-ref-label">配置预设 (PRESETS)</label>

          <div className="dftx-ref-presets">
            {(['plan', 'env', 'sim', 'full'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={preset === item ? 'is-active' : ''}
                onClick={() => handlePresetSelect(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="dftx-ref-block">
          <label className="dftx-ref-label">步骤范围 (STEPS RANGE)</label>

<Slider
  range
  min={1}
  max={maxStepLimit}
  value={[stepsMin, stepsMax]}
  onChange={handleStepsRangeChange}
  className="dftx-ref-slider"
/>

          <div className="dftx-ref-step-foot">
            <span>Min: 1</span>
            <span>Max: {maxStepLimit}</span>
          </div>
        </div>

        <div className="dftx-ref-param">
          <div className="dftx-ref-param-head">
            <div className="dftx-ref-filter-row">
              <Select
                mode="multiple"
                maxTagCount="responsive"
                getPopupContainer={getPopupContainer}
                value={groupFilter}
                onChange={(value) => setGroupFilter(normalizeMultiSelect(value))}
                options={groupOptions}
                className="dftx-ref-multi"
              />

              <Select
                mode="multiple"
                maxTagCount="responsive"
                getPopupContainer={getPopupContainer}
                value={tcFilter}
                onChange={(value) => setTcFilter(normalizeMultiSelect(value))}
                options={tcOptions}
                className="dftx-ref-multi"
              />

              <Select
                mode="multiple"
                maxTagCount="responsive"
                getPopupContainer={getPopupContainer}
                value={subAttrFilter}
                onChange={(value) => setSubAttrFilter(normalizeMultiSelect(value))}
                options={subAttrOptions}
                className="dftx-ref-multi"
              />
            </div>

            <div className="dftx-ref-switch-row">
              <ToggleRow
                label="Group 使能"
                checked={groupEnabled}
                onChange={setGroupEnabled}
              />
              <ToggleRow label="TC 使能" checked={tcEnabled} onChange={setTcEnabled} />
              <ToggleRow
                label="SubAttr 使能"
                checked={subAttrEnabled}
                onChange={setSubAttrEnabled}
              />
            </div>
          </div>

          <div className="dftx-ref-strategy-row">
            <Select
              getPopupContainer={getPopupContainer}
              value={historicalParamStrategy}
              onChange={(value) => {
                setHistoricalParamStrategy(value);
                if (value !== '选择历史参数策略...') {
                  setStrategyNameInput(value);
                }
              }}
              className="dftx-ref-history-select"
              options={[
                {
                  value: '选择历史参数策略...',
                  label: '选择历史参数策略...',
                },
                {
                  value: 'Core_Services_Default',
                  label: 'Core_Services_Default',
                },
                {
                  value: 'Data_Pipeline_Optimized',
                  label: 'Data_Pipeline_Optimized',
                },
              ]}
            />

            <Input
              value={strategyNameInput}
              onChange={(event) => setStrategyNameInput(event.target.value)}
              placeholder="策略名称..."
              className="dftx-ref-strategy-input"
            />

            <Button className="dftx-ref-save-btn" onClick={handleSaveStrategy}>
              保存策略
            </Button>
          </div>

          <div className="dftx-ref-path-shell">
            <div className="dftx-ref-path-head">
              <div className="dftx-ref-check-cell">
                <button
                  type="button"
                  className={allPagedSelected ? 'dftx-ref-check is-checked' : 'dftx-ref-check'}
                  onClick={handleToggleCurrentPageAll}
                >
                  {allPagedSelected ? '✓' : ''}
                </button>
              </div>

              <div className="dftx-ref-path-head-main">
                <div className="dftx-ref-path-head-title">全选参数</div>
                <div className="dftx-ref-path-head-subtitle">
                  当前页 {pagedPaths.length} 项 · 已选 {selectedPathIds.length} 项 · 匹配 {filteredPaths.length} 项
                </div>
              </div>
            </div>

            <div className="dftx-ref-path-list">
              {pagedPaths.length === 0 ? (
                <div className="dftx-ref-empty-row">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配参数" />
                </div>
              ) : (
                pagedPaths.map((item) => {
                  const checked = selectedPathIds.includes(item.id);

                  return (
                    <div key={item.id} className="dftx-ref-path-row">
                      <div className="dftx-ref-check-cell">
                        <button
                          type="button"
                          className={checked ? 'dftx-ref-check is-checked' : 'dftx-ref-check'}
                          onClick={() => handleTogglePath(item.id)}
                        >
                          {checked ? '✓' : ''}
                        </button>
                      </div>

                      <div className="dftx-ref-path-content">
                        <span>Path</span>
                        <b>{item.path}</b>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="dftx-ref-pagination">
            <div className="dftx-ref-page-controls">
              <button type="button" onClick={gotoPrevPage} disabled={page <= 1}>
                ‹
              </button>

              <div className="dftx-ref-page-numbers">
                {visiblePageNumbers.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={page === item ? 'is-active' : ''}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <button type="button" onClick={gotoNextPage} disabled={page >= totalPages}>
                ›
              </button>
            </div>

            <div className="dftx-ref-page-size">
              <span>每页行数:</span>
              <Select
                getPopupContainer={getPopupContainer}
                value={pageSize}
                onChange={(value) => {
                  setPageSize(value);
                  setPage(1);
                }}
                options={[
                  { value: 10, label: '10' },
                  { value: 20, label: '20' },
                  { value: 50, label: '50' },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="dftx-ref-modal-footer">
        <button type="button" className="dftx-ref-cancel-btn" onClick={onClose}>
          取消
        </button>

        <button type="button" className="dftx-ref-run-btn" onClick={handleExecute}>
          执行
        </button>
      </div>
    </Modal>
  );
}

export default function FlowExecutionPanel() {
  const [messageApi, contextHolder] = message.useMessage();

  const [flows, setFlows] = useState<FlowItem[]>(() =>
    JSON.parse(JSON.stringify(initialFlows))
  );
  const [selectedFlowId, setSelectedFlowId] = useState('0x82f6a');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [isRunConfigOpen, setIsRunConfigOpen] = useState(false);
  const [runConfigMode, setRunConfigMode] = useState<FlowMode>('sim');

  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId);

  const filteredFlows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return flows.filter((flow) => {
      const matchesSearch =
        !query ||
        flow.name.toLowerCase().includes(query) ||
        flow.id.toLowerCase().includes(query) ||
        flow.runId.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === 'all' ? true : flow.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [flows, searchQuery, statusFilter]);

  const addMessage = (
    type: 'success' | 'error' | 'info' | 'warning',
    text: string
  ) => {
    messageApi.open({
      type,
      content: text,
      duration: 3,
    });
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      let pendingMessage: {
        type: 'success' | 'error' | 'info' | 'warning';
        text: string;
      } | null = null;

      setFlows((prevFlows) => {
        const runningCount = prevFlows.filter(
          (flow) => flow.status === 'running'
        ).length;

        return prevFlows.map((flow) => {
          if (flow.status === 'waiting') {
            if (runningCount < 3 && Math.random() < 0.25) {
              pendingMessage = {
                type: 'success',
                text: `工作流「${flow.name}」开始执行`,
              };

              return {
                ...flow,
                status: 'running',
                startTime: formatRuntimeTime(),
                ramUsage: '1.1GB RAM',
                cpuUsage: '15% CPU',
                networkIo: '200MB/s',
                nodes: generateNodesForFlow(
                  flow.name,
                  'running',
                  flow.progress,
                  flow.totalSteps
                ),
              };
            }

            return flow;
          }

          if (flow.status !== 'running') {
            return flow;
          }

          const nextProgress = flow.progress + 1;

          if (
            flow.name.toLowerCase().includes('fault') &&
            nextProgress === 2 &&
            Math.random() < 0.5
          ) {
            pendingMessage = {
              type: 'error',
              text: `工作流「${flow.name}」执行失败`,
            };

            return {
              ...flow,
              status: 'failed',
              progress: nextProgress - 1,
              ramUsage: '0.0GB RAM',
              cpuUsage: '0% CPU',
              networkIo: '0.0MB/s',
              nodes: generateNodesForFlow(
                flow.name,
                'failed',
                nextProgress - 1,
                flow.totalSteps
              ),
            };
          }

          if (nextProgress >= flow.totalSteps) {
            pendingMessage = {
              type: 'success',
              text: `工作流「${flow.name}」已完成`,
            };

            return {
              ...flow,
              status: 'completed',
              progress: flow.totalSteps,
              ramUsage: '0.0GB RAM',
              cpuUsage: '0% CPU',
              networkIo: '0.0MB/s',
              nodes: generateNodesForFlow(
                flow.name,
                'completed',
                flow.totalSteps,
                flow.totalSteps
              ),
            };
          }

          const randomRam = (1.1 + Math.random() * 0.4).toFixed(1);
          const randomCpu = Math.floor(30 + Math.random() * 35);
          const randomNet = (0.8 + Math.random() * 0.8).toFixed(1);

          return {
            ...flow,
            progress: nextProgress,
            ramUsage: `${randomRam}GB RAM`,
            cpuUsage: `${randomCpu}% CPU`,
            networkIo: `${randomNet}GB/s`,
            nodes: generateNodesForFlow(
              flow.name,
              'running',
              nextProgress,
              flow.totalSteps
            ),
          };
        });
      });

      if (pendingMessage) {
        window.setTimeout(() => {
          addMessage(pendingMessage!.type, pendingMessage!.text);
        }, 0);
      }
    }, 4500);

    return () => window.clearInterval(timer);
  }, []);

  const handleStopFlow = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();

    const target = flows.find((flow) => flow.id === id);
    if (!target) return;

    if (target.status === 'completed' || target.status === 'failed') {
      return;
    }

    addMessage('error', `工作流「${target.name}」已停止`);

    setFlows((prevFlows) =>
      prevFlows.map((flow) => {
        if (flow.id !== id) return flow;

        return {
          ...flow,
          status: 'failed',
          ramUsage: '0.0GB RAM',
          cpuUsage: '0% CPU',
          networkIo: '0.0MB/s',
          nodes: generateNodesForFlow(
            flow.name,
            'failed',
            flow.progress,
            flow.totalSteps
          ),
        };
      })
    );
  };

  const handleRunFlow = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();

    const target = flows.find((flow) => flow.id === id);
    if (!target || target.status === 'running') return;

    const shouldRestart = target.status === 'completed' || target.status === 'failed';
    const nextProgress = shouldRestart ? 0 : target.progress;

    addMessage(
      'success',
      shouldRestart
        ? `工作流「${target.name}」已重新开始执行`
        : `工作流「${target.name}」已开始执行`
    );

    setFlows((prevFlows) =>
      prevFlows.map((flow) => {
        if (flow.id !== id) return flow;

        return {
          ...flow,
          status: 'running',
          progress: nextProgress,
          startTime: shouldRestart || flow.startTime === '--:--:--'
            ? formatRuntimeTime()
            : flow.startTime,
          ramUsage: '1.2GB RAM',
          cpuUsage: '24% CPU',
          networkIo: '300MB/s',
          nodes: generateNodesForFlow(
            flow.name,
            'running',
            nextProgress,
            flow.totalSteps
          ),
        };
      })
    );
  };

  const handleExecuteNewFlow = (config: RunConfiguration) => {
    const randomHexId = `0x${Math.floor(
      65536 + Math.random() * 983039
    ).toString(16)}`;

    const runningCount = flows.filter((flow) => flow.status === 'running').length;
    const startStatus: FlowStatus = runningCount < 3 ? 'running' : 'waiting';

    const flowName =
      config.strategyNameInput.trim() ||
      config.name ||
      `Flow_Custom_${Math.floor(100 + Math.random() * 899)}`;

    const newFlow = createFlow({
      id: randomHexId,
      name: flowName,
      status: startStatus,
      progress: 0,
      totalSteps: config.stepsMax,
      mode: config.mode,
      startTime: startStatus === 'running' ? formatRuntimeTime() : '--:--:--',
      runId: `RUN_${Math.floor(1000 + Math.random() * 8999)}_USR`,
      version: 'v1.0.0-custom',
    });

    setFlows((prev) => [newFlow, ...prev]);
    setSelectedFlowId(randomHexId);
    setIsRunConfigOpen(false);

    addMessage(
      startStatus === 'running' ? 'success' : 'info',
      startStatus === 'running'
        ? `工作流「${newFlow.name}」已开始执行`
        : `运行队列已满，工作流「${newFlow.name}」进入等待队列`
    );
  };

  const handleReset = () => {
    setFlows(JSON.parse(JSON.stringify(initialFlows)));
    setSelectedFlowId('0x82f6a');
    setSearchQuery('');
    setStatusFilter('all');
    addMessage('info', '执行队列已重置');
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#adc6ff',
          colorBgContainer: '#131b2e',
          colorBgElevated: '#131b2e',
          colorText: '#dae2fd',
          colorTextSecondary: '#c2c6d6',
          colorBorder: '#424754',
          borderRadius: 3,
          fontSize: 12,
        },
        components: {
          Button: {
            colorPrimary: '#adc6ff',
            colorPrimaryHover: '#c3d4ff',
            colorPrimaryActive: '#9db8f5',
            primaryColor: '#0b1326',
          },
          Input: {
            colorBgContainer: '#2d3449',
            colorText: '#dae2fd',
            colorTextPlaceholder: '#8c909f',
          },
          Select: {
            colorBgContainer: '#2d3449',
            colorText: '#dae2fd',
            colorTextPlaceholder: '#8c909f',
            optionSelectedBg: 'rgba(173, 198, 255, 0.16)',
            optionActiveBg: 'rgba(173, 198, 255, 0.1)',
          },
          Card: {
            colorBgContainer: 'rgba(255,255,255,0.025)',
          },
          Modal: {
            contentBg: '#131b2e',
            headerBg: '#171f33',
            titleColor: '#dae2fd',
          },
        },
      }}
    >
      <div className="dftx-exec">
        {contextHolder}
        <style>{dftxStyles}</style>

        <main className="dftx-main">
          <section className="dftx-flow-panel">
            <div className="dftx-toolbar">
              <div className="dftx-toolbar-right">
                <Input
                  allowClear
                  size="small"
                  placeholder="搜索 Flow / ID / Run ID"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="dftx-search"
                />

                <Select
                  getPopupContainer={getPopupContainer}
                  size="small"
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                  className="dftx-filter-select"
                  options={[
                    { value: 'all', label: '全部' },
                    { value: 'running', label: '执行中' },
                    { value: 'waiting', label: '等待中' },
                    { value: 'completed', label: '已完成' },
                    { value: 'failed', label: '失败' },
                    { value: 'paused', label: '暂停' },
                  ]}
                />

                <Tooltip title="重置队列">
                  <Button
                    size="small"
                    type="text"
                    aria-label="重置队列"
                    icon={<ReloadOutlined />}
                    className="dftx-toolbar-icon-btn"
                    onClick={handleReset}
                  />
                </Tooltip>

                <Tooltip title="新建运行">
                  <Button
                    size="small"
                    type="primary"
                    aria-label="新建运行"
                    icon={<PlayCircleOutlined />}
                    className="dftx-toolbar-icon-btn is-primary"
                    onClick={() => {
                      setRunConfigMode('sim');
                      setIsRunConfigOpen(true);
                    }}
                  />
                </Tooltip>
              </div>
            </div>

            <div className="dftx-flow-list">
              {filteredFlows.length === 0 ? (
                <div className="dftx-empty-box">
                  <Empty description="无匹配的 Flow" />
                </div>
              ) : (
                filteredFlows.map((flow) => (
                  <FlowCard
                    key={flow.id}
                    flow={flow}
                    isSelected={flow.id === selectedFlowId}
                    onSelect={() => setSelectedFlowId(flow.id)}
                    onRun={handleRunFlow}
                    onStop={handleStopFlow}
                  />
                ))
              )}
            </div>
          </section>

          <FlowInspector flow={selectedFlow} />
        </main>

        <RunConfigModal
          open={isRunConfigOpen}
          onClose={() => setIsRunConfigOpen(false)}
          onExecute={handleExecuteNewFlow}
          onAddMessage={addMessage}
          initialMode={runConfigMode}
        />
      </div>
    </ConfigProvider>
  );
}

const dftxStyles = `
.dftx-exec {
  --dftx-bg: var(--vscode-editor-background, #0b1326);
  --dftx-panel: var(--vscode-sideBar-background, #131b2e);
  --dftx-panel-header: var(--vscode-titleBar-activeBackground, #171f33);
  --dftx-panel-strong: var(--vscode-list-hoverBackground, #222a3d);
  --dftx-control: var(--vscode-input-background, #2d3449);
  --dftx-control-hover: var(--vscode-list-hoverBackground, #31394d);
  --dftx-text: var(--vscode-foreground, #dae2fd);
  --dftx-text-muted: var(--vscode-descriptionForeground, #c2c6d6);
  --dftx-text-subtle: var(--vscode-disabledForeground, #8c909f);
  --dftx-border: var(--vscode-panel-border, #424754);
  --dftx-border-soft: color-mix(in srgb, var(--dftx-border) 58%, transparent);
  --dftx-primary: var(--vscode-textLink-foreground, #adc6ff);
  --dftx-primary-bg: color-mix(in srgb, var(--dftx-primary) 12%, transparent);
  --dftx-primary-text: #0b1326;
  --dftx-error: var(--vscode-errorForeground, #f87171);
  --dftx-success: #22c55e;
  --dftx-warning: #facc15;
  --dftx-idle: var(--vscode-descriptionForeground, #8c909f);
  --dftx-card-bg: color-mix(in srgb, var(--dftx-panel) 72%, var(--dftx-bg));
  --dftx-card-bg-hover: color-mix(in srgb, var(--dftx-panel-strong) 72%, var(--dftx-bg));
  --dftx-metric-bg: color-mix(in srgb, var(--dftx-control) 70%, var(--dftx-bg));
  --dftx-selected-bg: color-mix(in srgb, var(--dftx-primary) 14%, var(--dftx-bg));
  --dftx-selected-border: color-mix(in srgb, var(--dftx-primary) 68%, var(--dftx-border));
  --dftx-selected-shadow: 0 0 0 1px color-mix(in srgb, var(--dftx-primary) 28%, transparent), 0 8px 18px rgba(0, 0, 0, 0.18);
  --dftx-select-head-bg: color-mix(in srgb, var(--dftx-control) 78%, var(--dftx-bg));
  --dftx-select-head-border: color-mix(in srgb, var(--dftx-border) 72%, transparent);
  --dftx-select-head-hover-border: color-mix(in srgb, var(--dftx-primary) 28%, var(--dftx-border));

  height: 100%;
  min-height: 720px;
  background: var(--dftx-bg);
  color: var(--dftx-text);
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  overflow: hidden;
}

.dftx-exec * {
  box-sizing: border-box;
}

/* Layout */
.dftx-main {
  height: 100%;
  display: flex;
  overflow: hidden;
  background:
    linear-gradient(var(--dftx-border-soft) 1px, transparent 1px),
    linear-gradient(90deg, var(--dftx-border-soft) 1px, transparent 1px),
    var(--dftx-bg);
  background-size: 28px 28px;
  background-blend-mode: soft-light;
}

.dftx-flow-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--dftx-bg) 92%, transparent);
  border-right: 1px solid var(--dftx-border);
}

.dftx-toolbar {
  height: 44px;
  min-height: 44px;
  flex-shrink: 0;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border-bottom: 1px solid var(--dftx-border);
  background: color-mix(in srgb, var(--dftx-panel-header) 86%, transparent);
}

.dftx-toolbar-left,
.dftx-toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.dftx-logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--dftx-border);
  background: var(--dftx-primary-bg);
  color: var(--dftx-primary);
  font-size: 13px;
  font-weight: 800;
  font-family: Consolas, monospace;
  border-radius: 4px;
}

.dftx-page-title {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--dftx-text);
}

.dftx-page-subtitle {
  margin-top: 2px;
  font-size: 10px;
  font-family: Consolas, monospace;
  color: var(--dftx-text-subtle);
  white-space: nowrap;
}

.dftx-stat-tag {
  margin: 0;
  border-color: color-mix(in srgb, var(--dftx-primary) 32%, transparent);
  background: var(--dftx-primary-bg);
  color: var(--dftx-primary);
  font-family: Consolas, monospace;
  font-size: 10px;
}

.dftx-search {
  width: min(280px, 42vw);
}

.dftx-search .ant-input-affix-wrapper,
.dftx-filter-select .ant-select-selector {
  min-height: 24px !important;
}

.dftx-filter-select {
  width: 110px;
}

/* Flow overview */
.dftx-flow-list {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.dftx-empty-box {
  height: 100%;
  min-height: 360px;
  display: grid;
  place-items: center;
  border: 1px dashed var(--dftx-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--dftx-panel) 34%, transparent);
}

.dftx-flow-card {
  position: relative;
  overflow: hidden;
  padding: 8px 10px 9px;
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
  border: 1px solid var(--dftx-border);
  background: var(--dftx-card-bg);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.dftx-flow-card:hover {
  border-color: color-mix(in srgb, var(--dftx-primary) 36%, var(--dftx-border));
  background: var(--dftx-card-bg-hover);
}

.dftx-flow-card.is-selected {
  border-color: var(--dftx-selected-border);
  background: var(--dftx-selected-bg);
  box-shadow: var(--dftx-selected-shadow);
}

.dftx-flow-card.is-failed {
  border-color: color-mix(in srgb, var(--dftx-error) 48%, var(--dftx-border));
}

.dftx-flow-card-header {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dftx-flow-card-header-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
}

.dftx-flow-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dftx-text);
  font-family: Consolas, monospace;
  font-size: 13px;
  font-weight: 800;
}

.dftx-flow-card-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dftx-flow-icon-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid var(--dftx-border-soft);
  background: var(--dftx-control);
  color: var(--dftx-text-muted);
  flex-shrink: 0;
}

.dftx-flow-icon-btn:hover:not(:disabled) {
  border-color: var(--dftx-primary);
  background: var(--dftx-primary-bg);
  color: var(--dftx-primary);
}

.dftx-flow-icon-btn.is-run:not(:disabled) {
  color: var(--dftx-primary);
}

.dftx-flow-icon-btn.is-stop:not(:disabled) {
  color: var(--dftx-error);
}

.dftx-flow-icon-btn:disabled {
  opacity: 0.38;
  color: var(--dftx-text-subtle);
}

.dftx-toolbar-icon-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid var(--dftx-border-soft);
  background: var(--dftx-control);
  color: var(--dftx-text-muted);
}

.dftx-toolbar-icon-btn:hover {
  border-color: var(--dftx-primary) !important;
  background: var(--dftx-primary-bg) !important;
  color: var(--dftx-primary) !important;
}

.dftx-toolbar-icon-btn.is-primary {
  border-color: var(--dftx-primary);
  background: var(--dftx-primary);
  color: var(--dftx-primary-text);
}

.dftx-toolbar-icon-btn.is-primary:hover {
  background: color-mix(in srgb, var(--dftx-primary) 88%, white) !important;
  color: var(--dftx-primary-text) !important;
}

.dftx-flow-track {
  position: relative;
  height: 24px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  padding: 0 4px;
}

.dftx-flow-track-line {
  position: absolute;
  left: 10px;
  right: 10px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--dftx-border), transparent);
}

.dftx-flow-step-dots {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dftx-flow-step-dot {
  width: 12px;
  height: 12px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid var(--dftx-bg);
  background: var(--dftx-idle);
  cursor: pointer;
  transition:
    transform 140ms ease,
    box-shadow 140ms ease,
    background 140ms ease;
}

.dftx-flow-step-dot:hover,
.dftx-flow-step-dot:focus-visible {
  transform: scale(1.18);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dftx-primary) 22%, transparent);
  outline: none;
}

.dftx-flow-step-dot.is-done {
  background: var(--dftx-success);
}

.dftx-flow-step-dot.is-active {
  background: var(--dftx-primary);
  animation: dftx-flow-step-pulse 1.35s ease-in-out infinite;
}

.dftx-flow-step-dot.is-failed {
  background: var(--dftx-error);
  box-shadow: 0 0 8px color-mix(in srgb, var(--dftx-error) 60%, transparent);
}

.dftx-flow-step-dot.is-pending {
  background: var(--dftx-idle);
}

/* Shared status */
.dftx-status-pill {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.dftx-flow-status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--dftx-idle);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dftx-idle) 14%, transparent);
}

.dftx-status-running {
  color: var(--dftx-primary);
  border-color: color-mix(in srgb, var(--dftx-primary) 36%, transparent);
  background: color-mix(in srgb, var(--dftx-primary) 12%, transparent);
}

.dftx-flow-status-dot.dftx-status-running {
  background: var(--dftx-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dftx-primary) 16%, transparent);
}

.dftx-status-completed {
  color: var(--dftx-success);
  border-color: color-mix(in srgb, var(--dftx-success) 35%, transparent);
  background: color-mix(in srgb, var(--dftx-success) 9%, transparent);
}

.dftx-flow-status-dot.dftx-status-completed {
  background: var(--dftx-success);
}

.dftx-status-failed {
  color: var(--dftx-error);
  border-color: color-mix(in srgb, var(--dftx-error) 35%, transparent);
  background: color-mix(in srgb, var(--dftx-error) 9%, transparent);
}

.dftx-flow-status-dot.dftx-status-failed {
  background: var(--dftx-error);
}

.dftx-status-paused {
  color: var(--dftx-warning);
  border-color: color-mix(in srgb, var(--dftx-warning) 35%, transparent);
  background: color-mix(in srgb, var(--dftx-warning) 10%, transparent);
}

.dftx-flow-status-dot.dftx-status-paused {
  background: var(--dftx-warning);
}

.dftx-status-waiting {
  color: var(--dftx-text-subtle);
  border-color: color-mix(in srgb, var(--dftx-text-subtle) 34%, transparent);
  background: rgba(255, 255, 255, 0.035);
}

/* Detail panel */
.dftx-detail-panel {
  width: 32%;
  min-width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--dftx-panel);
  border-left: 1px solid var(--dftx-border);
}

.dftx-detail-empty {
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.dftx-detail-header {
  height: 44px;
  min-height: 44px;
  flex-shrink: 0;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  overflow: hidden;
  background: var(--dftx-panel-header);
  border-bottom: 1px solid var(--dftx-border);
}

.dftx-detail-title-wrap {
  min-width: 0;
  flex: 1;
}

.dftx-detail-eyebrow {
  color: var(--dftx-text-subtle);
  font-size: 9px;
  line-height: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.dftx-detail-module-row {
  margin-top: 1px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dftx-detail-module-name {
  max-width: 100%;
  color: var(--dftx-primary) !important;
  font-family: Consolas, monospace;
  font-size: 13px;
  line-height: 16px;
  font-weight: 800;
}

.dftx-detail-header-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.dftx-detail-count-tag,
.dftx-run-id {
  margin: 0;
  padding: 0 6px;
  height: 18px;
  border: 1px solid var(--dftx-border-soft);
  background: var(--dftx-metric-bg);
  color: var(--dftx-text-muted);
  border-radius: 3px;
  font-family: Consolas, monospace;
  font-size: 9px;
  line-height: 16px;
  font-weight: 600;
}

.dftx-detail-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.dftx-detail-metrics-bar {
  margin-bottom: 10px;
  padding: 7px 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  border: 1px solid var(--dftx-border-soft);
  background: color-mix(in srgb, var(--dftx-panel-strong) 52%, transparent);
  border-radius: 6px;
}

.dftx-detail-metric-item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  color: var(--dftx-text-muted);
  font-size: 12px;
}

.dftx-detail-metric-item b {
  color: var(--dftx-text);
  font-family: Consolas, monospace;
  font-size: 12px;
  font-weight: 800;
}

.dftx-detail-metric-item b.is-highlight {
  color: var(--dftx-primary);
}

.dftx-task-section {
  min-height: 0;
  padding: 10px;
  border: 1px solid var(--dftx-border);
  background: color-mix(in srgb, var(--dftx-card-bg) 88%, transparent);
  border-radius: 8px;
}

.dftx-task-section-header {
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.dftx-detail-subline {
  margin-top: 2px;
  color: var(--dftx-text-subtle);
  font-family: Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
}

.dftx-section-title {
  color: var(--dftx-text-muted);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.dftx-task-list {
  margin-top: 8px;
  max-height: 430px;
  overflow: auto;
  padding-right: 4px;
  display: grid;
  gap: 5px;
}

.dftx-task-node {
  position: relative;
  margin-left: 0;
  padding-left: 0;
}

.dftx-task-node + .dftx-task-node {
  margin-top: 0;
}

.dftx-task-node:not(:first-child) {
  margin-left: 0;
  padding-left: 0;
}

.dftx-task-item {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  overflow: hidden;
  padding: 5px 8px;
  border: 1px solid var(--dftx-border-soft);
  border-left: 3px solid var(--dftx-idle);
  background: var(--dftx-control);
  border-radius: 4px;
  cursor: default;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.dftx-task-node.is-selected .dftx-task-item {
  border-color: var(--dftx-selected-border);
  background: var(--dftx-selected-bg);
  box-shadow: var(--dftx-selected-shadow);
}

.dftx-task-node.is-running .dftx-task-item {
  border-color: color-mix(in srgb, var(--dftx-primary) 56%, var(--dftx-border));
  background: var(--dftx-card-bg-hover);
}

.dftx-task-status-dot {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--dftx-border);
  background: var(--dftx-idle);
}

.dftx-task-main {
  min-width: 0;
  flex: 1;
}

.dftx-task-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dftx-text);
  font-family: Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
}

.dftx-task-status-tag {
  margin: 0;
  height: 18px;
  line-height: 16px;
  padding: 0 6px;
  border-color: var(--dftx-border-soft);
  background: var(--dftx-metric-bg);
  color: var(--dftx-text-muted);
  font-family: Consolas, monospace;
  font-size: 10px;
  flex-shrink: 0;
}

.dftx-node-success .dftx-task-item {
  border-left-color: var(--dftx-success);
}

.dftx-node-success .dftx-task-status-dot {
  background: var(--dftx-success);
  border-color: var(--dftx-bg);
}

.dftx-node-success .dftx-task-status-tag {
  color: var(--dftx-success);
  border-color: color-mix(in srgb, var(--dftx-success) 38%, var(--dftx-border));
}

.dftx-node-processing .dftx-task-item {
  border-left-color: var(--dftx-primary);
}

.dftx-node-processing .dftx-task-status-dot {
  background: var(--dftx-primary);
  border-color: var(--dftx-bg);
  box-shadow: 0 0 8px color-mix(in srgb, var(--dftx-primary) 60%, transparent);
}

.dftx-node-processing .dftx-task-status-tag {
  color: var(--dftx-primary);
  border-color: color-mix(in srgb, var(--dftx-primary) 38%, var(--dftx-border));
}

.dftx-node-failed .dftx-task-item {
  border-left-color: var(--dftx-error);
}

.dftx-node-failed .dftx-task-status-dot {
  background: var(--dftx-error);
  border-color: var(--dftx-bg);
}

.dftx-node-failed .dftx-task-status-tag {
  color: var(--dftx-error);
  border-color: color-mix(in srgb, var(--dftx-error) 38%, var(--dftx-border));
}

.dftx-node-pending {
  opacity: 0.62;
}

/* AntD scoped overrides */
.dftx-exec .ant-input,
.dftx-exec .ant-input-number,
.dftx-exec .ant-select-selector {
  background: var(--dftx-control) !important;
  border-color: var(--dftx-border) !important;
  color: var(--dftx-text) !important;
  border-radius: 3px !important;
}

.dftx-exec .ant-input::placeholder,
.dftx-exec .ant-select-selection-placeholder {
  color: var(--dftx-text-subtle) !important;
}

.dftx-exec .ant-btn-default {
  background: var(--dftx-control);
  border-color: var(--dftx-border);
  color: var(--dftx-text);
  border-radius: 3px;
}

.dftx-exec .ant-btn-default:hover {
  border-color: var(--dftx-primary) !important;
  color: var(--dftx-primary) !important;
}

.dftx-exec .ant-btn-primary {
  background: var(--dftx-primary);
  border-color: var(--dftx-primary);
  color: var(--dftx-primary-text);
  border-radius: 3px;
}

.dftx-exec .ant-empty-description {
  color: var(--dftx-text-subtle);
}

.dftx-exec .ant-select-dropdown {
  background: var(--dftx-panel) !important;
  border: 1px solid var(--dftx-border) !important;
}

.dftx-exec .ant-select-item {
  color: var(--dftx-text-muted) !important;
}

.dftx-exec .ant-select-item-option-active {
  background: color-mix(in srgb, var(--dftx-primary) 10%, transparent) !important;
}

.dftx-exec .ant-select-item-option-selected {
  background: color-mix(in srgb, var(--dftx-primary) 16%, transparent) !important;
  color: var(--dftx-primary) !important;
}

.dftx-exec .ant-select-selection-item {
  color: var(--dftx-text) !important;
}

.dftx-exec .ant-select-selection-placeholder {
  color: var(--dftx-text-subtle) !important;
}

@keyframes dftx-flow-step-pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--dftx-primary) 36%, transparent);
  }

  50% {
    transform: scale(1.18);
    box-shadow: 0 0 0 5px transparent;
  }
}

/* Reference Modal */
.dftx-run-modal-ref {
  max-width: min(1120px, 94vw) !important;
  padding-bottom: 0 !important;
}

.dftx-run-modal-ref .ant-modal-content {
  width: 100%;
  height: min(840px, 88vh);
  padding: 0 !important;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(var(--dftx-border-soft) 1px, transparent 1px),
    linear-gradient(90deg, var(--dftx-border-soft) 1px, transparent 1px),
    var(--dftx-bg) !important;
  background-size: 28px 28px !important;
  border: 1px solid var(--dftx-border) !important;
  border-radius: 8px !important;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.48) !important;
}

.dftx-run-modal-ref .ant-modal-header {
  flex-shrink: 0;
  min-height: 52px;
  margin: 0 !important;
  padding: 8px 44px 8px 12px !important;
  background: color-mix(in srgb, var(--dftx-panel-header) 88%, transparent) !important;
  border-bottom: 1px solid var(--dftx-border) !important;
  border-radius: 8px 8px 0 0 !important;
}

.dftx-run-modal-ref .ant-modal-title {
  color: var(--dftx-text) !important;
}

.dftx-run-modal-ref .ant-modal-body {
  flex: 1;
  min-height: 0;
  padding: 0 !important;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dftx-run-modal-ref .ant-modal-close {
  top: 10px !important;
  right: 14px !important;
  width: 28px !important;
  height: 28px !important;
  color: var(--dftx-text-muted) !important;
  border: 1px solid var(--dftx-border-soft) !important;
  border-radius: 4px !important;
  background: var(--dftx-control) !important;
}

.dftx-run-modal-ref .ant-modal-close:hover {
  color: var(--dftx-primary) !important;
  border-color: color-mix(in srgb, var(--dftx-primary) 46%, var(--dftx-border)) !important;
  background: var(--dftx-card-bg-hover) !important;
}

.dftx-close-x {
  font-size: 18px;
  line-height: 1;
}

.dftx-ref-modal-title {
  min-width: 0;
  display: grid;
  grid-template-columns: 20px minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  row-gap: 2px;
}

.dftx-title-symbol {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 1px solid var(--dftx-border-soft);
  border-radius: 4px;
  background: var(--dftx-primary-bg);
  color: var(--dftx-primary);
  font-size: 10px;
}

.dftx-ref-modal-title-main {
  color: var(--dftx-text);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dftx-ref-modal-subtitle {
  min-width: 0;
  color: var(--dftx-text-subtle);
  font-family: Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dftx-ref-modal-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 10px;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: max-content max-content max-content minmax(0, 1fr);
  gap: 8px;
}

.dftx-ref-block,
.dftx-ref-param {
  border: 1px solid var(--dftx-border);
  background: var(--dftx-card-bg);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.dftx-ref-block {
  min-width: 0;
  padding: 8px 10px;
}

.dftx-ref-param {
  grid-column: 1 / -1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dftx-ref-label {
  display: block;
  margin-bottom: 6px;
  color: var(--dftx-text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dftx-ref-select {
  width: 100%;
}

.dftx-ref-select .ant-select-selector,
.dftx-ref-history-select .ant-select-selector,
.dftx-ref-multi .ant-select-selector,
.dftx-ref-page-size .ant-select-selector {
  background: var(--dftx-control) !important;
  border-color: var(--dftx-border-soft) !important;
  color: var(--dftx-text) !important;
  border-radius: 4px !important;
  box-shadow: none !important;
}

.dftx-ref-select .ant-select-selector,
.dftx-ref-history-select .ant-select-selector,
.dftx-ref-page-size .ant-select-selector {
  min-height: 28px !important;
}

.dftx-ref-select .ant-select-selection-item,
.dftx-ref-history-select .ant-select-selection-item,
.dftx-ref-page-size .ant-select-selection-item {
  line-height: 26px !important;
}

.dftx-ref-select:hover .ant-select-selector,
.dftx-ref-history-select:hover .ant-select-selector,
.dftx-ref-multi:hover .ant-select-selector,
.dftx-ref-page-size .ant-select:hover .ant-select-selector,
.dftx-ref-strategy-input:hover {
  border-color: color-mix(in srgb, var(--dftx-primary) 38%, var(--dftx-border)) !important;
}

.dftx-ref-presets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.dftx-ref-presets button {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dftx-border-soft);
  border-radius: 4px;
  background: var(--dftx-control);
  color: var(--dftx-text-muted);
  font-family: Consolas, monospace;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease,
    box-shadow 140ms ease;
}

.dftx-ref-presets button:hover {
  border-color: color-mix(in srgb, var(--dftx-primary) 42%, var(--dftx-border));
  color: var(--dftx-primary);
  background: var(--dftx-card-bg-hover);
}

.dftx-ref-presets button.is-active {
  border-color: var(--dftx-selected-border);
  background: var(--dftx-selected-bg);
  color: var(--dftx-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dftx-primary) 20%, transparent);
}


.dftx-ref-slider {
  margin: 6px 6px 2px !important;
}

.dftx-ref-slider .ant-slider-rail {
  height: 3px !important;
  background: var(--dftx-control) !important;
}

.dftx-ref-slider .ant-slider-track {
  height: 3px !important;
  background: var(--dftx-primary) !important;
}

.dftx-ref-slider .ant-slider-handle::after {
  width: 12px !important;
  height: 12px !important;
  background: var(--dftx-bg) !important;
  border: 2px solid var(--dftx-primary) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dftx-primary) 14%, transparent) !important;
}

.dftx-ref-step-foot {
  display: flex;
  justify-content: space-between;
  color: var(--dftx-text-subtle);
  font-family: Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
}

.dftx-ref-param-head {
  flex-shrink: 0;
  padding: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid var(--dftx-border-soft);
  background: color-mix(in srgb, var(--dftx-panel-header) 70%, transparent);
}

.dftx-ref-filter-row {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.dftx-ref-multi .ant-select-selector {
  min-height: 28px !important;
  padding-top: 1px !important;
  padding-bottom: 1px !important;
}

.dftx-ref-switch-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dftx-toggle-row {
  height: 26px;
  padding: 0 7px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--dftx-border-soft);
  border-radius: 4px;
  background: var(--dftx-control);
  color: var(--dftx-text-muted);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.dftx-toggle-row .ant-switch {
  min-width: 28px;
}

.dftx-ref-strategy-row {
  flex-shrink: 0;
  padding: 8px;
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  border-bottom: 1px solid var(--dftx-border-soft);
}

.dftx-ref-history-select,
.dftx-ref-strategy-input {
  height: 28px;
}

.dftx-ref-strategy-input {
  background: var(--dftx-control) !important;
  border-color: var(--dftx-border-soft) !important;
  color: var(--dftx-text) !important;
  border-radius: 4px !important;
}

.dftx-ref-save-btn {
  height: 28px;
  padding: 0 14px;
  border-color: color-mix(in srgb, var(--dftx-primary) 32%, var(--dftx-border)) !important;
  background: var(--dftx-primary-bg) !important;
  color: var(--dftx-primary) !important;
  border-radius: 4px !important;
  font-size: 11px;
  font-weight: 800;
}

.dftx-ref-save-btn:hover {
  border-color: var(--dftx-primary) !important;
  background: color-mix(in srgb, var(--dftx-primary) 18%, transparent) !important;
  color: var(--dftx-primary) !important;
}

.dftx-ref-path-shell {
  flex: 1;
  min-height: 0;
  padding: 8px 8px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dftx-ref-path-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.dftx-ref-path-head,
.dftx-ref-path-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  padding: 4px 7px;
}

.dftx-ref-path-head {
  flex-shrink: 0;
  min-height: 34px;
  border: 1px solid var(--dftx-select-head-border);
  background: var(--dftx-select-head-bg);
  border-radius: 4px;
  box-shadow: none;
}

.dftx-ref-path-head:hover {
  border-color: var(--dftx-select-head-hover-border);
}

.dftx-ref-path-row {
  min-height: 30px;
  margin-bottom: 4px;
  border: 1px solid var(--dftx-border-soft);
  border-left: 3px solid var(--dftx-idle);
  background: var(--dftx-control);
  border-radius: 4px;
  transition:
    border-color 140ms ease,
    background 140ms ease;
}

.dftx-ref-path-row:hover {
  border-color: color-mix(in srgb, var(--dftx-primary) 44%, var(--dftx-border));
  background: var(--dftx-card-bg-hover);
}

.dftx-ref-check-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.dftx-ref-check {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--dftx-border-soft);
  border-radius: 3px;
  background: var(--dftx-bg);
  color: var(--dftx-primary);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.dftx-ref-check:hover {
  border-color: var(--dftx-primary);
}

.dftx-ref-check.is-checked {
  border-color: color-mix(in srgb, var(--dftx-primary) 58%, var(--dftx-border));
  background: var(--dftx-primary-bg);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dftx-primary) 10%, transparent);
}

.dftx-ref-path-head .dftx-ref-check.is-checked {
  border-color: color-mix(in srgb, var(--dftx-primary) 42%, var(--dftx-border));
  background: color-mix(in srgb, var(--dftx-primary) 8%, var(--dftx-control));
  box-shadow: none;
}

.dftx-ref-path-head-main {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dftx-ref-path-head-title {
  color: var(--dftx-text-muted);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.dftx-ref-path-head-subtitle {
  min-width: 0;
  color: var(--dftx-text-subtle);
  font-family: Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dftx-ref-path-content {
  min-width: 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.dftx-ref-path-content span {
  color: var(--dftx-text-subtle);
  font-family: Consolas, monospace;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.dftx-ref-path-content b {
  color: var(--dftx-text);
  font-family: Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dftx-ref-empty-row {
  min-height: 180px;
  display: grid;
  place-items: center;
  border: 1px dashed var(--dftx-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--dftx-panel) 34%, transparent);
}

.dftx-ref-pagination {
  flex-shrink: 0;
  min-height: 40px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  border-top: 1px solid var(--dftx-border-soft);
  background: color-mix(in srgb, var(--dftx-panel-header) 60%, transparent);
}

.dftx-ref-page-controls,
.dftx-ref-page-numbers {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dftx-ref-page-controls button,
.dftx-ref-page-numbers button {
  width: 24px;
  height: 24px;
  border: 1px solid var(--dftx-border-soft);
  border-radius: 4px;
  background: var(--dftx-control);
  color: var(--dftx-text-muted);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.dftx-ref-page-controls button:hover,
.dftx-ref-page-numbers button:hover {
  border-color: var(--dftx-primary);
  color: var(--dftx-primary);
  background: var(--dftx-card-bg-hover);
}

.dftx-ref-page-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.dftx-ref-page-numbers button.is-active {
  border-color: var(--dftx-selected-border);
  background: var(--dftx-selected-bg);
  color: var(--dftx-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dftx-primary) 20%, transparent);
}

.dftx-ref-page-size {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dftx-ref-page-size span {
  color: var(--dftx-text-muted);
  font-size: 10px;
  font-weight: 700;
}

.dftx-ref-page-size .ant-select {
  width: 72px;
}

.dftx-ref-modal-footer {
  flex-shrink: 0;
  min-height: 44px;
  padding: 7px 10px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  background: color-mix(in srgb, var(--dftx-panel-header) 88%, transparent);
  border-top: 1px solid var(--dftx-border);
}

.dftx-ref-cancel-btn,
.dftx-ref-run-btn {
  min-width: 72px;
  height: 28px;
  padding: 0 16px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease,
    box-shadow 140ms ease;
}

.dftx-ref-cancel-btn {
  border: 1px solid var(--dftx-border-soft);
  background: var(--dftx-control);
  color: var(--dftx-text-muted);
}

.dftx-ref-cancel-btn:hover {
  border-color: var(--dftx-text-subtle);
  color: var(--dftx-text);
  background: var(--dftx-card-bg-hover);
}

.dftx-ref-run-btn {
  border: 1px solid var(--dftx-primary);
  background: var(--dftx-primary);
  color: var(--dftx-primary-text);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dftx-primary) 14%, transparent);
}

.dftx-ref-run-btn:hover {
  filter: brightness(1.06);
}

@media (max-width: 1120px) {
  .dftx-ref-param {
    grid-column: auto;
  }

  .dftx-ref-param-head,
  .dftx-ref-filter-row,
  .dftx-ref-strategy-row {
    grid-template-columns: 1fr;
  }

  .dftx-ref-switch-row {
    flex-wrap: wrap;
  }
}

/* Scrollbars */
.dftx-flow-list::-webkit-scrollbar,
.dftx-detail-body::-webkit-scrollbar,
.dftx-task-list::-webkit-scrollbar,
.dftx-ref-modal-body::-webkit-scrollbar,
.dftx-ref-path-list::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.dftx-flow-list::-webkit-scrollbar-track,
.dftx-detail-body::-webkit-scrollbar-track,
.dftx-task-list::-webkit-scrollbar-track,
.dftx-ref-modal-body::-webkit-scrollbar-track,
.dftx-ref-path-list::-webkit-scrollbar-track {
  background: transparent;
}

.dftx-flow-list::-webkit-scrollbar-thumb,
.dftx-detail-body::-webkit-scrollbar-thumb,
.dftx-task-list::-webkit-scrollbar-thumb,
.dftx-ref-modal-body::-webkit-scrollbar-thumb,
.dftx-ref-path-list::-webkit-scrollbar-thumb {
  background: var(--dftx-border);
}

.dftx-flow-list::-webkit-scrollbar-thumb:hover,
.dftx-detail-body::-webkit-scrollbar-thumb:hover,
.dftx-task-list::-webkit-scrollbar-thumb:hover,
.dftx-ref-modal-body::-webkit-scrollbar-thumb:hover,
.dftx-ref-path-list::-webkit-scrollbar-thumb:hover {
  background: var(--dftx-text-subtle);
}

@media (max-width: 1180px) {
  .dftx-ref-param-head {
    align-items: stretch;
    flex-direction: column;
  }

  .dftx-ref-switch-row {
    padding-left: 0;
    padding-top: 10px;
    border-left: 0;
    border-top: 1px solid rgba(66, 71, 84, 0.55);
  }

  .dftx-ref-strategy-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .dftx-toolbar {
    height: auto;
    min-height: 44px;
    align-items: flex-start;
    flex-direction: column;
    padding: 8px 10px;
  }

  .dftx-toolbar-right {
    width: 100%;
  }

  .dftx-search {
    flex: 1;
    width: auto;
  }

  .dftx-main {
    flex-direction: column;
  }

  .dftx-detail-panel {
    width: 100%;
    min-width: 0;
    height: 45%;
    border-left: 0;
    border-top: 1px solid var(--dftx-border);
  }
}
`;
