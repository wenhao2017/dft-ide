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

const { Text, Title } = Typography;

interface DesignTreePanelProps {
  accent: string;
  flow: 'hibist' | 'sailor' | 'verification';
  flowLabel: string;
  selectedKey: string;
  enableRun?: boolean;
  onSelect: (key: string) => void;
  executionSelectedKeys?: string[];
  onExecutionSelectionChange?: (keys: string[]) => void;
  onRun?: (keys: string[], targetTasks?: string[]) => void;
  onStop?: (keys: string[]) => void;
}

const defaultTasks = ['Load data', 'Check environment', 'Validate rules', 'Run core flow', 'Generate snapshot'];

const DesignTreePanel: React.FC<DesignTreePanelProps> = ({
  accent,
  flow,
  flowLabel,
  selectedKey,
  enableRun,
  onSelect,
  executionSelectedKeys,
  onExecutionSelectionChange,
  onRun,
  onStop,
}) => {
  const { savedData: flowSavedData } = useFlowConfig(flow);
  const focusHydratedRef = useRef(false);
  const executionHydratedRef = useRef(false);
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
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  const selectedConfig = configs.find((item) => item.key === selectedKey) ?? configs[0];
  const executionKeys = executionSelectedKeys ?? [];

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

  const toggleExecutionKey = useCallback((key: string, checked: boolean) => {
    const nextKeys = checked
      ? [...executionKeys, key]
      : executionKeys.filter((item) => item !== key);
    updateExecutionKeys(nextKeys);
  }, [executionKeys, updateExecutionKeys]);

  const handleFullRun = useCallback((targetKeys: string[]) => {
    const keys = targetKeys.filter(Boolean);
    if (!onRun || !keys.length) {
      return;
    }
    onRun(keys, []);
    message.success(`Started ${keys.length} module(s).`);
  }, [onRun]);

  const prepareSelectRun = useCallback((targetKeys: string[]) => {
    const keys = targetKeys.filter(Boolean);
    if (!onRun || !keys.length) {
      return;
    }
    setRunTargetKeys(keys);
    setSelectedTasks([...defaultTasks]);
    setTaskModalOpen(true);
  }, [onRun]);

  const confirmSelectRun = () => {
    if (!selectedTasks.length) {
      message.warning('Select at least one task.');
      return;
    }
    onRun?.(runTargetKeys, selectedTasks);
    message.success('Started selected tasks.');
    setTaskModalOpen(false);
  };

  const refreshConfigs = useCallback(async (preferredKey?: string) => {
    setLoading(true);
    try {
      const result = await listFlowConfigFiles(flow);
      if (!result.success) {
        message.error(result.error ?? 'Failed to read module list');
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
    executionHydratedRef.current = false;
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
    focusHydratedRef.current = true;
  }, [flowSavedData]);

  useEffect(() => {
    if (!onExecutionSelectionChange || executionHydratedRef.current) {
      return;
    }
    const rawKeys = flowSavedData?.executionModuleKeys;
    if (!Array.isArray(rawKeys)) {
      return;
    }
    const nextKeys = rawKeys.filter((key): key is string => typeof key === 'string' && Boolean(key));
    onExecutionSelectionChange(nextKeys);
    executionHydratedRef.current = true;
  }, [flowSavedData, onExecutionSelectionChange]);

  useEffect(() => {
    if (!configs.length || !focusKeys.length) {
      return;
    }
    const validKeys = new Set(configs.map((item) => item.key));
    const nextKeys = focusKeys.filter((key) => validKeys.has(key));
    if (nextKeys.length !== focusKeys.length) {
      setFocusKeys(nextKeys);
      saveConfig(flow, { focusModuleKeys: nextKeys }).catch(() => undefined);
    }
  }, [configs, flow, focusKeys]);

  useEffect(() => {
    if (!configsLoaded || !onExecutionSelectionChange || !executionKeys.length) {
      return;
    }
    const validKeys = new Set(configs.map((item) => item.key));
    const nextKeys = executionKeys.filter((key) => validKeys.has(key));
    if (nextKeys.length !== executionKeys.length) {
      updateExecutionKeys(nextKeys);
    }
  }, [configs, configsLoaded, executionKeys, onExecutionSelectionChange, updateExecutionKeys]);

  const openCreate = () => {
    setCreateValue('');
    setCreateOpen(true);
  };

  const confirmCreate = async () => {
    const nextName = createValue.trim();
    if (!nextName) return;

    const result = await createFlowConfigFile(flow, nextName);
    if (!result.success || !result.config) {
      message.error(result.error ?? 'Failed to create module');
      return;
    }

    setCreateOpen(false);
    updateExecutionKeys([...executionKeys, result.config.key]);
    message.success(`Created module ${result.config.moduleName}`);
    await refreshConfigs(result.config.key);
  };

  const duplicateSelected = async (moduleName = selectedConfig?.moduleName) => {
    if (!moduleName) return;
    const result = await duplicateFlowConfigFile(flow, moduleName);
    if (!result.success || !result.config) {
      message.error(result.error ?? 'Failed to duplicate module');
      return;
    }
    message.success(`Duplicated module ${result.config.moduleName}`);
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
      message.error(result.error ?? 'Failed to rename module');
      return;
    }

    setRenameOpen(false);
    if (focusKeys.includes(selectedConfig.key)) {
      const nextFocusKeys = focusKeys.map((key) => key === selectedConfig.key ? result.config!.key : key);
      setFocusKeys(nextFocusKeys);
      saveConfig(flow, { focusModuleKeys: nextFocusKeys }).catch(() => undefined);
    }
    if (executionKeys.includes(selectedConfig.key)) {
      updateExecutionKeys(executionKeys.map((key) => key === selectedConfig.key ? result.config!.key : key));
    }
    message.success(`Renamed module to ${result.config.moduleName}`);
    await refreshConfigs(result.config.key);
  };

  const deleteSelected = (moduleName = selectedConfig?.moduleName) => {
    if (!moduleName) return;
    Modal.confirm({
      title: `Delete module ${moduleName}?`,
      content: 'This removes the module config file from the current flow config directory.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        const result = await deleteFlowConfigFile(flow, moduleName);
        if (!result.success) {
          message.error(result.error ?? 'Failed to delete module');
          return;
        }
        message.success(`Deleted module ${moduleName}`);
        const nextFocusKeys = focusKeys.filter((key) => key !== moduleName);
        if (nextFocusKeys.length !== focusKeys.length) {
          setFocusKeys(nextFocusKeys);
          saveConfig(flow, { focusModuleKeys: nextFocusKeys }).catch(() => undefined);
        }
        if (executionKeys.includes(moduleName)) {
          updateExecutionKeys(executionKeys.filter((key) => key !== moduleName));
        }
        await refreshConfigs();
      },
    });
  };

  const scopedConfigs = useMemo(() => {
    if (focusKeys.length === 0) return configs;
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
    setFocusKeys(keys);
    saveConfig(flow, { focusModuleKeys: keys }).catch(() => undefined);
    if (keys.length === 0) {
      return;
    }
    const preferred = keys.find((key) => configs.some((item) => item.key === key));
    if (preferred) {
      selectModule(preferred);
    }
  };

  const getRunTargets = () => (
    executionKeys.length > 0 ? executionKeys : [selectedConfig?.key].filter((key): key is string => Boolean(key))
  );

  const renderList = () => (
    <>
      <Space.Compact style={{ width: '100%', marginBottom: 10 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search modules"
        />
        <Tooltip title="Refresh">
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refreshConfigs()} />
        </Tooltip>
      </Space.Compact>

      <Space direction="vertical" size={6} style={{ width: '100%', marginBottom: 10 }}>
        <Space size={6}>
          <FilterOutlined style={{ color: focusKeys.length ? accent : 'var(--vscode-descriptionForeground)' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>Focused modules</Text>
          {focusKeys.length > 0 && (
            <Button size="small" type="link" onClick={() => updateFocusKeys([])} style={{ padding: 0 }}>
              Show all
            </Button>
          )}
        </Space>
        <Select
          mode="multiple"
          allowClear
          size="small"
          maxTagCount="responsive"
          placeholder="Select owned modules"
          value={focusKeys}
          options={moduleOptions}
          onChange={(keys) => updateFocusKeys(keys)}
          style={{ width: '100%' }}
        />
      </Space>

      {onExecutionSelectionChange && (
        <Space direction="vertical" size={6} style={{ width: '100%', marginBottom: 10 }}>
          <Space size={6}>
            <PlayCircleOutlined style={{ color: executionKeys.length ? accent : 'var(--vscode-descriptionForeground)' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Execution selection</Text>
            {executionKeys.length > 0 && (
              <Button size="small" type="link" onClick={() => updateExecutionKeys([])} style={{ padding: 0 }}>
                Clear
              </Button>
            )}
          </Space>
          <Select
            mode="multiple"
            allowClear
            size="small"
            maxTagCount="responsive"
            placeholder="Select modules to run together"
            value={executionKeys}
            options={moduleOptions}
            onChange={(keys) => updateExecutionKeys(keys)}
            style={{ width: '100%' }}
          />
        </Space>
      )}

      <Space size={6} wrap style={{ marginBottom: 10 }}>
        <Tooltip title="Create">
          <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate()} />
        </Tooltip>
        <Tooltip title="Duplicate">
          <Button size="small" icon={<CopyOutlined />} disabled={!selectedConfig} onClick={() => duplicateSelected()} />
        </Tooltip>
        <Tooltip title="Rename">
          <Button size="small" icon={<EditOutlined />} disabled={!selectedConfig} onClick={() => openRename()} />
        </Tooltip>
        <Tooltip title="Delete">
          <Button size="small" danger icon={<DeleteOutlined />} disabled={!selectedConfig} onClick={() => deleteSelected()} />
        </Tooltip>
        {enableRun && (
          <>
            <Tooltip title="Run selected modules">
              <Button size="small" icon={<CaretRightOutlined />} disabled={!getRunTargets().length} onClick={() => handleFullRun(getRunTargets())} />
            </Tooltip>
            <Tooltip title="Stop selected modules">
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
            const executionChecked = executionKeys.includes(item.key);
            const dropdownItems = [
              ...(enableRun ? [
                { key: 'run-select-tasks', icon: <PlayCircleOutlined />, label: 'Select tasks and run' },
                { type: 'divider' as const },
              ] : []),
              { key: 'copy', icon: <CopyOutlined />, label: 'Duplicate' },
              { key: 'rename', icon: <EditOutlined />, label: 'Rename' },
              { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true },
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
                    background: isSelected ? 'var(--vscode-list-activeSelectionBackground, rgba(127,127,127,0.11))' : undefined,
                    borderLeft: isSelected ? `3px solid ${accent}` : '3px solid transparent',
                    padding: '6px 12px 6px 9px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space size={8} style={{ minWidth: 0 }}>
                      {onExecutionSelectionChange && (
                        <span onClick={(event) => event.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center' }}>
                          <Checkbox
                            checked={executionChecked}
                            onChange={(event) => toggleExecutionKey(item.key, event.target.checked)}
                          />
                        </span>
                      )}
                      <FileTextOutlined style={{ color: isSelected ? accent : 'var(--vscode-descriptionForeground)', flexShrink: 0 }} />
                      <Text strong={isSelected} ellipsis={{ tooltip: item.moduleName }} style={{ minWidth: 0, fontSize: 13 }}>
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
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? 'Loading modules' : 'No modules'} />
      )}
    </>
  );

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        title="Expand module list"
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
        <Tooltip title="Expand module list" placement="right">
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
          <Text style={{ color: accent, fontSize: 12, fontWeight: 700 }}>Modules</Text>
          <Title level={5} style={{ margin: 0, fontSize: 15 }}>{flowLabel} Module Config</Title>
          <Text type="secondary" ellipsis={{ tooltip: configsDir || 'configs' }} style={{ fontSize: 12 }}>
            {configsDir || 'configs'}
          </Text>
        </Space>

        <Tooltip title="Collapse module list" placement="right">
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
          <Text type="secondary" style={{ fontSize: 12 }}>Current module</Text>
          <Space style={{ minWidth: 0 }}>
            <BranchesOutlined style={{ color: accent }} />
            <Text strong ellipsis={{ tooltip: selectedConfig?.moduleName }} style={{ minWidth: 0 }}>
              {selectedConfig?.moduleName ?? 'No module selected'}
            </Text>
          </Space>
          <Badge color={accent} text={`${configs.length} module(s)`} />
        </Space>
      </div>

      <Modal
        open={createOpen}
        title="Create Module"
        okText="Create"
        cancelText="Cancel"
        onOk={confirmCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Input
          placeholder="Enter module name"
          value={createValue}
          onChange={(event) => setCreateValue(event.target.value)}
          onPressEnter={confirmCreate}
        />
      </Modal>

      <Modal
        open={renameOpen}
        title="Rename Module"
        okText="Rename"
        cancelText="Cancel"
        onOk={confirmRename}
        onCancel={() => setRenameOpen(false)}
      >
        <Input
          placeholder="Enter new module name"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={confirmRename}
        />
      </Modal>

      <Modal
        open={taskModalOpen}
        title={<Space><PlayCircleOutlined style={{ color: accent }} /><span>Select Tasks</span></Space>}
        okText="Run"
        cancelText="Cancel"
        onOk={confirmSelectRun}
        onCancel={() => setTaskModalOpen(false)}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text type="secondary" ellipsis={{ tooltip: runTargetKeys.join(', ') }}>
              Targets: <Text strong>{runTargetKeys.join(', ')}</Text>
            </Text>
            <Checkbox
              indeterminate={selectedTasks.length > 0 && selectedTasks.length < defaultTasks.length}
              checked={selectedTasks.length === defaultTasks.length}
              onChange={(event) => setSelectedTasks(event.target.checked ? [...defaultTasks] : [])}
            >
              All
            </Checkbox>
          </Space>
          <div
            style={{
              padding: 12,
              background: 'var(--vscode-sideBar-background, rgba(0,0,0,0.02))',
              border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.15))',
              borderRadius: 6,
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            <Checkbox.Group
              style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}
              value={selectedTasks}
              onChange={(checkedValues) => setSelectedTasks(checkedValues as string[])}
            >
              {defaultTasks.map((taskName) => (
                <Checkbox key={taskName} value={taskName} style={{ fontFamily: 'monospace', fontSize: 13 }}>
                  {taskName}
                </Checkbox>
              ))}
            </Checkbox.Group>
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default DesignTreePanel;
