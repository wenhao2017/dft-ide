import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  List,
  Modal,
  Select,
  Slider,
  Space,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  BranchesOutlined,
  CaretRightOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  FilterOutlined,
  LeftOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  FlowConfigFileInfo,
  createFlowConfigFile,
  deleteFlowConfigFile,
  duplicateFlowConfigFile,
  listFlowConfigFiles,
  renameFlowConfigFile,
  saveConfig,
} from '../../utils/ipc';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import usePipelineRuntimeStore from '../../store/pipelineRuntimeStore';

const { Text, Title } = Typography;

interface DesignTreePanelProps {
  accent: string;
  flow: 'hibist' | 'sailor' | 'verification';
  flowLabel: string;
  selectedKey: string;
  enableRun?: boolean;
  onSelect: (key: string) => void;
  onExecutionSelectionChange?: (keys: string[]) => void;
  onModuleWorkDirsChange?: (workDirs: Record<string, string>) => void;
  onRun?: (keys: string[], targetTasks?: string[]) => void;
  onStop?: (keys: string[]) => void;
}



const DesignTreePanel: React.FC<DesignTreePanelProps> = ({
  accent,
  flow,
  flowLabel,
  selectedKey,
  enableRun,
  onSelect,
  onExecutionSelectionChange,
  onModuleWorkDirsChange,
  onRun,
  onStop,
}) => {
  const selectedBg = `var(--vscode-list-inactiveSelectionBackground, color-mix(in srgb, ${accent} 14%, var(--vscode-editor-background, #ffffff)))`;
  const selectedFg = 'var(--vscode-list-inactiveSelectionForeground, var(--vscode-editor-foreground, var(--vscode-foreground)))';
  const selectedBorder = `color-mix(in srgb, ${accent} 68%, var(--vscode-panel-border, rgba(127,127,127,0.26)))`;
  const selectedShadow = `0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent), 0 4px 12px rgba(0,0,0,0.08)`;
  const { savedData: flowSavedData } = useFlowConfig(flow);
  const focusHydratedRef = useRef(false);
  const [configs, setConfigs] = useState<FlowConfigFileInfo[]>([]);
  const [configsDir, setConfigsDir] = useState('');
  const [search, setSearch] = useState('');
  const [focusKeys, setFocusKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createValue, setCreateValue] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [runTargetKeys, setRunTargetKeys] = useState<string[]>([]);
  const [batchModuleKeys, setBatchModuleKeys] = useState<string[]>([]);
  const [modalStepRange, setModalStepRange] = useState<[number, number]>([0, 0]);

  const selectedConfig = configs.find((item) => item.key === selectedKey) ?? configs[0];

  const runtimes = usePipelineRuntimeStore((state) => state.runtimes);
  const flowRuntimes = Object.values(runtimes).filter((r) => r.flowKey === flow);
  const flowTasks = flowRuntimes.find((r) => r.tasks && r.tasks.length > 0)?.tasks || [];

  const DEFAULT_FLOW_STEPS: Record<'hibist' | 'sailor' | 'verification', string[]> = useMemo(() => ({
    hibist: [
      'gen_analysis_env', 'run_analysis', 'gen_insert_env', 'run_insert',
      'gen_build_env', 'run_build', 'gen_syn_env', 'run_syn',
      'gen_fml_env', 'run_fml', 'gen_sim_env', 'run_sim', 'release'
    ],
    sailor: [
      'create_branch', 'gen_cfg', 'user_hook_before_gen_dcg_env', 'gen_dcg_env',
      'user_hook_after_gen_cfg', 'run_scan', 'gen_analysis_env', 'run_analysis', 'commit_result'
    ],
    verification: [
      'prepare_workspace', 'load_config', 'check_env', 'submit_mode',
      'collect_result', 'parse_report', 'publish_dashboard'
    ]
  }), []);

  const stepList = useMemo(() => {
    if (flowTasks.length > 0) {
      return flowTasks.map((t) => ({ id: t.id, name: t.name, description: t.description }));
    }
    return (DEFAULT_FLOW_STEPS[flow] || []).map((id) => ({ id, name: id, description: '' }));
  }, [flowTasks, flow, DEFAULT_FLOW_STEPS]);

  useEffect(() => {
    if (taskModalOpen && stepList.length > 0) {
      setModalStepRange([0, stepList.length - 1]);
    }
  }, [taskModalOpen, stepList.length]);

  const selectModule = useCallback((key: string) => {
    onSelect(key);
    saveConfig(flow, { activeModuleKey: key, moduleConfigs: undefined }).catch(() => undefined);
  }, [flow, onSelect]);

  const updateExecutionKeys = useCallback((keys: string[]) => {
    if (!onExecutionSelectionChange) {
      return;
    }
    const nextKeys = Array.from(new Set(keys.filter(Boolean)));
    onExecutionSelectionChange(nextKeys);
    saveConfig(flow, { executionModuleKeys: nextKeys }).catch(() => undefined);
  }, [flow, onExecutionSelectionChange]);

  const syncFocusedModules = useCallback((keys: string[]) => {
    const nextKeys = Array.from(new Set(keys.filter(Boolean)));
    updateExecutionKeys(nextKeys);
    const configByKey = new Map(configs.map((item) => [item.key, item]));
    const nextWorkDirs = nextKeys.reduce<Record<string, string>>((acc, key) => {
      const workDir = configByKey.get(key)?.workDir;
      if (workDir) {
        acc[key] = workDir;
      }
      return acc;
    }, {});
    onModuleWorkDirsChange?.(nextWorkDirs);
  }, [configs, onModuleWorkDirsChange, updateExecutionKeys]);

  const handleFullRun = useCallback((targetKeys: string[]) => {
    const keys = targetKeys.filter(Boolean);
    if (!onRun || !keys.length) {
      return;
    }
    onRun(keys, []);
    message.success(`已启动 ${keys.length} 个模块`);
  }, [onRun]);

  const prepareSelectRun = useCallback((targetKeys: string[]) => {
    const keys = targetKeys.filter(Boolean);
    if (!onRun || !keys.length) {
      return;
    }
    setRunTargetKeys(keys);
    setTaskModalOpen(true);
  }, [onRun]);

  const confirmSelectRun = () => {
    if (stepList.length === 0) {
      message.error('未加载到流水线步骤');
      return;
    }
    const selectedTaskIds = stepList.slice(modalStepRange[0], modalStepRange[1] + 1).map((t) => t.id);
    onRun?.(runTargetKeys, selectedTaskIds);
    message.success('已启动所选步骤');
    setTaskModalOpen(false);
  };

  const refreshConfigs = useCallback(async (preferredKey?: string) => {
    setLoading(true);
    try {
      const result = await listFlowConfigFiles(flow);
      if (!result.success) {
        message.error(result.error ?? '读取模块列表失败');
        return;
      }

      setConfigs(result.configs);
      setConfigsDir(result.configsDir ?? '');
      setConfigsLoaded(true);
      const nextKey =
        preferredKey && result.configs.some((item) => item.key === preferredKey)
          ? preferredKey
          : result.configs.some((item) => item.key === selectedKey)
            ? selectedKey
            : result.configs[0]?.key ?? '';
      if (nextKey) {
        selectModule(nextKey);
      }
    } finally {
      setLoading(false);
    }
  }, [flow, selectModule, selectedKey]);

  useEffect(() => {
    void refreshConfigs();
  }, [refreshConfigs]);

  useEffect(() => {
    focusHydratedRef.current = false;
    setConfigsLoaded(false);
    setFocusKeys([]);
    onExecutionSelectionChange?.([]);
  }, [flow, onExecutionSelectionChange]);

  useEffect(() => {
    if (focusHydratedRef.current) {
      return;
    }
    const rawKeys = flowSavedData?.focusModuleKeys;
    if (!Array.isArray(rawKeys)) {
      return;
    }
    const nextKeys = rawKeys.filter((key): key is string => typeof key === 'string' && Boolean(key));
    setFocusKeys(nextKeys);
    syncFocusedModules(nextKeys);
    focusHydratedRef.current = true;
  }, [flowSavedData, syncFocusedModules]);

  useEffect(() => {
    if (!configs.length || !focusKeys.length) {
      return;
    }
    const validKeys = new Set(configs.map((item) => item.key));
    const nextKeys = focusKeys.filter((key) => validKeys.has(key));
    if (nextKeys.length !== focusKeys.length) {
      setFocusKeys(nextKeys);
      saveConfig(flow, { focusModuleKeys: nextKeys }).catch(() => undefined);
      syncFocusedModules(nextKeys);
    }
  }, [configs, flow, focusKeys, syncFocusedModules]);

  useEffect(() => {
    syncFocusedModules(focusKeys);
  }, [configs, focusKeys, syncFocusedModules]);

  useEffect(() => {
    const validKeys = new Set(configs.map((item) => item.key));
    const focusedKeys = new Set(focusKeys);
    setBatchModuleKeys((prev) => prev.filter((key) => validKeys.has(key) && focusedKeys.has(key)));
  }, [configs, focusKeys]);

  const openCreate = () => {
    setCreateValue('');
    setCreateOpen(true);
  };

  const confirmCreate = async () => {
    const nextName = createValue.trim();
    if (!nextName) return;

    const result = await createFlowConfigFile(flow, nextName);
    if (!result.success || !result.config) {
      message.error(result.error ?? '新增模块失败');
      return;
    }

    setCreateOpen(false);
    const nextFocusKeys = Array.from(new Set([...focusKeys, result.config.key]));
    setFocusKeys(nextFocusKeys);
    saveConfig(flow, { focusModuleKeys: nextFocusKeys }).catch(() => undefined);
    syncFocusedModules(nextFocusKeys);
    message.success(`已创建模块 ${result.config.moduleName}`);
    await refreshConfigs(result.config.key);
  };

  const duplicateSelected = async (moduleName = selectedConfig?.moduleName) => {
    if (!moduleName) return;
    const result = await duplicateFlowConfigFile(flow, moduleName);
    if (!result.success || !result.config) {
      message.error(result.error ?? '复制模块失败');
      return;
    }
    message.success(`已复制模块 ${result.config.moduleName}`);
    await refreshConfigs(result.config.key);
  };

  const openRename = (moduleName = selectedConfig?.moduleName) => {
    if (!moduleName) return;
    selectModule(moduleName);
    setRenameValue(moduleName);
    setRenameOpen(true);
  };

  const confirmRename = async () => {
    if (!selectedConfig) return;
    const nextName = renameValue.trim();
    if (!nextName) return;

    const result = await renameFlowConfigFile(flow, selectedConfig.moduleName, nextName);
    if (!result.success || !result.config) {
      message.error(result.error ?? '重命名模块失败');
      return;
    }

    setRenameOpen(false);
    if (focusKeys.includes(selectedConfig.key)) {
      const nextFocusKeys = focusKeys.map((key) => key === selectedConfig.key ? result.config!.key : key);
      setFocusKeys(nextFocusKeys);
      saveConfig(flow, { focusModuleKeys: nextFocusKeys }).catch(() => undefined);
      syncFocusedModules(nextFocusKeys);
    }
    message.success(`已重命名为 ${result.config.moduleName}`);
    await refreshConfigs(result.config.key);
  };

  const deleteSelected = (moduleName = selectedConfig?.moduleName) => {
    if (!moduleName) return;
    Modal.confirm({
      title: `删除模块 ${moduleName}？`,
      content: '该操作会从当前流程配置目录中删除该模块配置文件。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const result = await deleteFlowConfigFile(flow, moduleName);
        if (!result.success) {
          message.error(result.error ?? '删除模块失败');
          return;
        }
        message.success(`已删除模块 ${moduleName}`);
        const nextFocusKeys = focusKeys.filter((key) => key !== moduleName);
        if (nextFocusKeys.length !== focusKeys.length) {
          setFocusKeys(nextFocusKeys);
          saveConfig(flow, { focusModuleKeys: nextFocusKeys }).catch(() => undefined);
          syncFocusedModules(nextFocusKeys);
        }
        await refreshConfigs();
      },
    });
  };

  const scopedConfigs = useMemo(() => {
    if (!focusKeys.length) {
      return [];
    }
    const focusSet = new Set(focusKeys);
    return configs.filter((item) => focusSet.has(item.key));
  }, [configs, focusKeys]);

  const filteredConfigs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return scopedConfigs;
    return scopedConfigs.filter((item) =>
      item.moduleName.toLowerCase().includes(term) ||
      item.fileName.toLowerCase().includes(term)
    );
  }, [scopedConfigs, search]);

  const moduleOptions = useMemo(() => configs.map((item) => ({
    label: item.moduleName,
    value: item.key,
  })), [configs]);

  useEffect(() => {
    if (focusKeys.length === 0 || filteredConfigs.some((item) => item.key === selectedKey)) {
      return;
    }
    const nextSelected = filteredConfigs[0]?.key ?? '';
    if (nextSelected) {
      selectModule(nextSelected);
    }
  }, [filteredConfigs, focusKeys.length, selectModule, selectedKey]);

  const updateFocusKeys = (keys: string[]) => {
    const nextKeys = Array.from(new Set(keys.filter(Boolean)));
    setFocusKeys(nextKeys);
    setBatchModuleKeys((prev) => prev.filter((key) => nextKeys.includes(key)));
    saveConfig(flow, { focusModuleKeys: nextKeys }).catch(() => undefined);
    syncFocusedModules(nextKeys);
    if (keys.length === 0) {
      return;
    }
    const preferred = nextKeys.find((key) => configs.some((item) => item.key === key));
    if (preferred) {
      selectModule(preferred);
    }
  };

  const updateBatchModuleKeys = (keys: string[]) => {
    setBatchModuleKeys(Array.from(new Set(keys.filter(Boolean))));
  };

  const getRunTargets = () => (
    batchModuleKeys
  );

  const renderList = () => (
    <>
      <Space.Compact style={{ width: '100%', marginBottom: 10 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索模块"
        />
        <Tooltip title="刷新">
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refreshConfigs()} />
        </Tooltip>
      </Space.Compact>

      <Space direction="vertical" size={6} style={{ width: '100%', marginBottom: 10 }}>
        <Space size={6}>
          <FilterOutlined style={{ color: focusKeys.length ? accent : 'var(--vscode-descriptionForeground)' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>关注模块</Text>
          {focusKeys.length > 0 && (
            <Button size="small" type="link" onClick={() => updateFocusKeys([])} style={{ padding: 0 }}>
              清空关注
            </Button>
          )}
        </Space>
        <Select
          mode="multiple"
          allowClear
          size="small"
          maxTagCount="responsive"
          placeholder="选择负责模块"
          value={focusKeys}
          options={moduleOptions}
          onChange={(keys) => updateFocusKeys(keys)}
          style={{ width: '100%' }}
        />
      </Space>

      <Space size={6} wrap style={{ marginBottom: 10 }}>
        <Tooltip title="新增">
          <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate()} />
        </Tooltip>
        <Tooltip title="复制">
          <Button size="small" icon={<CopyOutlined />} disabled={!selectedConfig} onClick={() => duplicateSelected()} />
        </Tooltip>
        <Tooltip title="重命名">
          <Button size="small" icon={<EditOutlined />} disabled={!selectedConfig} onClick={() => openRename()} />
        </Tooltip>
        <Tooltip title="删除">
          <Button size="small" danger icon={<DeleteOutlined />} disabled={!selectedConfig} onClick={() => deleteSelected()} />
        </Tooltip>
        {enableRun && (
          <>
            <Tooltip title="运行已勾选模块">
              <Button size="small" icon={<CaretRightOutlined />} disabled={!getRunTargets().length} onClick={() => handleFullRun(getRunTargets())} />
            </Tooltip>
            <Tooltip title="停止已勾选模块">
              <Button size="small" danger icon={<StopOutlined />} disabled={!getRunTargets().length} onClick={() => onStop?.(getRunTargets())} />
            </Tooltip>
          </>
        )}
      </Space>

      {filteredConfigs.length ? (
        <List
          loading={loading}
          size="small"
          dataSource={filteredConfigs}
          renderItem={(item) => {
            const isSelected = item.key === selectedConfig?.key;
            const isBatchSelected = batchModuleKeys.includes(item.key);
            const dropdownItems = [
              ...(enableRun ? [
                { key: 'run-select-tasks', icon: <PlayCircleOutlined />, label: '选择任务并运行' },
                { type: 'divider' as const },
              ] : []),
              { key: 'copy', icon: <CopyOutlined />, label: '复制' },
              { key: 'rename', icon: <EditOutlined />, label: '重命名' },
              { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
            ];

            return (
              <Dropdown
                trigger={['contextMenu']}
                menu={{
                  items: dropdownItems,
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    selectModule(item.key);
                    if (key === 'copy') void duplicateSelected(item.moduleName);
                    if (key === 'rename') openRename(item.moduleName);
                    if (key === 'delete') deleteSelected(item.moduleName);
                    if (key === 'run-select-tasks') prepareSelectRun([item.key]);
                  },
                }}
              >
                <List.Item
                  onClick={() => selectModule(item.key)}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? selectedBg : undefined,
                    border: isSelected ? `1px solid ${selectedBorder}` : '1px solid transparent',
                    borderLeft: isSelected ? `3px solid ${accent}` : '3px solid transparent',
                    borderRadius: 6,
                    boxShadow: isSelected ? selectedShadow : 'none',
                    padding: '6px 12px 6px 9px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space size={8} style={{ minWidth: 0 }}>
                      <span onClick={(event) => event.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <Checkbox
                          checked={isBatchSelected}
                          onChange={(event) => {
                            const nextKeys = event.target.checked
                              ? [...batchModuleKeys, item.key]
                              : batchModuleKeys.filter((key) => key !== item.key);
                            updateBatchModuleKeys(nextKeys);
                          }}
                        />
                      </span>
                      <FileTextOutlined style={{ color: isSelected ? accent : 'var(--vscode-descriptionForeground)', flexShrink: 0 }} />
                      <Text strong={isSelected} ellipsis={{ tooltip: item.moduleName }} style={{ minWidth: 0, fontSize: 13, color: isSelected ? selectedFg : undefined }}>
                        {item.moduleName}
                      </Text>
                    </Space>
                  </Space>
                </List.Item>
              </Dropdown>
            );
          }}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? '正在读取模块' : '暂无模块'} />
      )}
    </>
  );

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        title="展开模块列表"
        style={{
          flex: 1,
          width: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          borderRadius: 8,
          border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
          borderLeft: `3px solid ${accent}`,
          background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
          overflow: 'hidden',
        }}
      >
        <Tooltip title="展开模块列表" placement="right">
          <div
            style={{
              marginTop: 10,
              width: 22,
              height: 22,
              borderRadius: 5,
              background: `${accent}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: accent,
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            <RightOutlined />
          </div>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        width: 300,
        minWidth: 280,
        borderRadius: 8,
        border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
        background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 12px 10px 14px',
          borderBottom: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
          background: `${accent}14`,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <Space direction="vertical" size={2} style={{ minWidth: 0, flex: 1 }}>
          <Text style={{ color: accent, fontSize: 12, fontWeight: 700 }}>模块</Text>
          <Title level={5} style={{ margin: 0, fontSize: 15 }}>{flowLabel} 模块配置</Title>
          <Text type="secondary" ellipsis={{ tooltip: configsDir || 'configs' }} style={{ fontSize: 12 }}>
            {configsDir || 'configs'}
          </Text>
        </Space>

        <Tooltip title="收起模块列表" placement="right">
          <Button
            type="text"
            size="small"
            icon={<LeftOutlined />}
            onClick={() => setCollapsed(true)}
            style={{
              flexShrink: 0,
              marginTop: 2,
              color: accent,
              border: `1px solid ${accent}44`,
              borderRadius: 6,
              width: 26,
              height: 26,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        </Tooltip>
      </div>

      <div style={{ padding: 12, flex: 1, overflow: 'auto', minHeight: 0 }}>
        {renderList()}
      </div>

      <div
        style={{
          margin: '0 12px 12px',
          padding: 12,
          borderRadius: 8,
          border: `1px solid ${accent}33`,
          background: 'var(--vscode-editor-background)',
          flexShrink: 0,
        }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>当前模块</Text>
          <Space style={{ minWidth: 0 }}>
            <BranchesOutlined style={{ color: accent }} />
            <Text strong ellipsis={{ tooltip: selectedConfig?.moduleName }} style={{ minWidth: 0 }}>
              {selectedConfig?.moduleName ?? '未选择模块'}
            </Text>
          </Space>
          <Badge color={accent} text={`共 ${configs.length} 个模块`} />
        </Space>
      </div>

      <Modal
        open={createOpen}
        title="新增模块"
        okText="创建"
        cancelText="取消"
        onOk={confirmCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Input
          placeholder="请输入模块名称"
          value={createValue}
          onChange={(event) => setCreateValue(event.target.value)}
          onPressEnter={confirmCreate}
        />
      </Modal>

      <Modal
        open={renameOpen}
        title="重命名模块"
        okText="重命名"
        cancelText="取消"
        onOk={confirmRename}
        onCancel={() => setRenameOpen(false)}
      >
        <Input
          placeholder="请输入新的模块名称"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={confirmRename}
        />
      </Modal>

      <Modal
        open={taskModalOpen}
        title={<Space><PlayCircleOutlined style={{ color: accent }} /><span>选择运行步骤范围</span></Space>}
        okText="运行"
        cancelText="取消"
        onOk={confirmSelectRun}
        onCancel={() => setTaskModalOpen(false)}
      >
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div>
            <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 12 }}>目标模块：</span>
            <strong style={{ color: 'var(--vscode-editor-foreground, var(--vscode-foreground))', fontSize: 13, fontFamily: 'monospace' }}>
              {runTargetKeys.join(', ')}
            </strong>
          </div>
          {stepList.length > 1 ? (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--vscode-sideBar-background, rgba(0,0,0,0.02))',
                border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.15))',
                borderRadius: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)' }}>执行范围:</span>
                <span style={{ fontSize: 12, color: accent, fontWeight: 700, fontFamily: 'monospace' }}>
                  {stepList[modalStepRange[0]]?.name} ➔ {stepList[modalStepRange[1]]?.name}
                </span>
              </div>
              <Slider
                range
                min={0}
                max={stepList.length - 1}
                value={modalStepRange}
                onChange={(val) => setModalStepRange(val as [number, number])}
                tooltip={{
                  formatter: (val) => {
                    if (val === undefined) return '';
                    const step = stepList[val];
                    return step ? `${val + 1}. ${step.name}${step.description ? ` (${step.description})` : ''}` : '';
                  }
                }}
                styles={{
                  track: {
                    background: accent,
                  },
                  handle: {
                    borderColor: accent,
                    backgroundColor: 'var(--vscode-editor-background)',
                  }
                }}
                style={{ margin: '8px 6px 4px' }}
              />
            </div>
          ) : (
            <div style={{ padding: 12, textAlign: 'center', color: 'var(--vscode-disabledForeground)' }}>
              加载流水线步骤中...
            </div>
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default DesignTreePanel;
