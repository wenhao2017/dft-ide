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
  FileOutlined,
} from '@ant-design/icons';
import {
  FlowConfigFileInfo,
  createFlowConfigFile,
  deleteFlowConfigFile,
  duplicateFlowConfigFile,
  listFlowConfigFiles,
  readConfig,
  renameFlowConfigFile,
  saveConfig,
  watchFlowConfigFiles,
  openFileInEditor,
} from '../../utils/ipc';
import { confirmDelete } from '../../utils/confirmDelete';
import usePipelineRuntimeStore from '../../store/pipelineRuntimeStore';
import { useShallow } from 'zustand/react/shallow';
import StepSelector from '../verification/mode/StepSelector';

const { Text, Title } = Typography;

interface DesignTreePanelProps {
  accent: string;
  flow: 'hibist' | 'sailor' | 'verification';
  flowLabel: string;
  selectedKey: string;
  enableRun?: boolean;
  initialCollapsed?: boolean;
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
  initialCollapsed = false,
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
  const [loadedFlowConfig, setLoadedFlowConfig] = useState<{
    flow: DesignTreePanelProps['flow'];
    data: Record<string, unknown>;
  }>();
  const flowSavedData = loadedFlowConfig?.flow === flow
    ? loadedFlowConfig.data
    : undefined;
  const focusHydratedRef = useRef(false);
  const focusKeysRef = useRef<string[]>([]);
  const moduleStateSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const selectedKeyRef = useRef(selectedKey);
  const skipWatchRefreshUntilRef = useRef(0);
  const configsRef = useRef<FlowConfigFileInfo[]>([]);
  const [configs, setConfigs] = useState<FlowConfigFileInfo[]>([]);
  const [configsDir, setConfigsDir] = useState('');
  const [search, setSearch] = useState('');
  const [focusKeys, setFocusKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [createOpen, setCreateOpen] = useState(false);
  const [createValue, setCreateValue] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [runTargetKeys, setRunTargetKeys] = useState<string[]>([]);
  const [batchModuleKeys, setBatchModuleKeys] = useState<string[]>([]);
  const [modalStepRange, setModalStepRange] = useState<[number, number]>([0, 0]);

  const selectedConfig = configs.find((item) => item.key === selectedKey) ?? configs[0];

  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  const flowTasks = usePipelineRuntimeStore(
    useShallow((state) => {
      const selectedRuntime = state.runtimes[`${flow}:${selectedKey}`];
      if (selectedRuntime?.tasks.length) {
        return selectedRuntime.tasks;
      }
      for (const key in state.runtimes) {
        const runtime = state.runtimes[key];
        if (runtime.flowKey === flow && runtime.tasks.length > 0) {
          return runtime.tasks;
        }
      }
      return [];
    })
  );

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
    selectedKeyRef.current = key;
    onSelect(key);
  }, [onSelect]);

  const updateExecutionKeys = useCallback((keys: string[]) => {
    if (!onExecutionSelectionChange) {
      return;
    }
    const nextKeys = Array.from(new Set(keys.filter(Boolean)));
    onExecutionSelectionChange(nextKeys);
  }, [onExecutionSelectionChange]);

  const saveModulePatch = useCallback((patch: Record<string, unknown>) => {
    const saveLatest = () => saveConfig(flow, patch).then(() => undefined);
    moduleStateSaveQueueRef.current = moduleStateSaveQueueRef.current.then(saveLatest, saveLatest);
    return moduleStateSaveQueueRef.current;
  }, [flow]);

  const saveModuleState = useCallback((modules: string[], focusedModules: string[]) => {
    return saveModulePatch({
      modules: Array.from(new Set(modules.filter(Boolean))),
      focusModules: Array.from(new Set(focusedModules.filter(Boolean))),
      forcusModules: undefined,
      focusModuleKeys: undefined,
      executionModuleKeys: undefined,
      activeModuleKey: undefined,
      moduleConfigs: undefined,
    });
  }, [saveModulePatch]);

  const syncFocusedModules = useCallback((keys: string[]) => {
    const nextKeys = Array.from(new Set(keys.filter(Boolean)));
    updateExecutionKeys(nextKeys);
    const configByKey = new Map(configsRef.current.map((item) => [item.key, item]));
    const nextWorkDirs = nextKeys.reduce<Record<string, string>>((acc, key) => {
      const workDir = configByKey.get(key)?.workDir;
      if (workDir) {
        acc[key] = workDir;
      }
      return acc;
    }, {});
    onModuleWorkDirsChange?.(nextWorkDirs);
  }, [onModuleWorkDirsChange, updateExecutionKeys]);

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

      configsRef.current = result.configs;
      setConfigs(result.configs);
      setConfigsDir(result.configsDir ?? '');
      setConfigsLoaded(true);
      const moduleKeys = result.configs.map((item) => item.key);
      const validModuleKeys = new Set(moduleKeys);
      const nextFocusKeys = focusKeysRef.current.filter((key) => validModuleKeys.has(key));
      if (focusHydratedRef.current) {
        focusKeysRef.current = nextFocusKeys;
        setFocusKeys(nextFocusKeys);
        syncFocusedModules(nextFocusKeys);
        void saveModuleState(moduleKeys, nextFocusKeys);
      } else {
        void saveModulePatch({ modules: moduleKeys, activeModuleKey: undefined, moduleConfigs: undefined });
      }
      const nextKey =
        preferredKey && result.configs.some((item) => item.key === preferredKey)
          ? preferredKey
          : result.configs.some((item) => item.key === selectedKeyRef.current)
            ? selectedKeyRef.current
            : result.configs[0]?.key ?? '';
      if (nextKey && nextKey !== selectedKeyRef.current) {
        selectModule(nextKey);
      }
    } finally {
      setLoading(false);
    }
  }, [saveModulePatch, saveModuleState, selectModule, syncFocusedModules]);

  useEffect(() => {
    void refreshConfigs();
  }, [refreshConfigs]);

  useEffect(() => {
    let disposed = false;
    void readConfig(flow).then(
      (data) => {
        if (!disposed) setLoadedFlowConfig({ flow, data: data ?? {} });
      },
      (error) => {
        console.error(`Failed to restore ${flow} module focus`, error);
        if (!disposed) setLoadedFlowConfig({ flow, data: {} });
      },
    );
    return () => {
      disposed = true;
    };
  }, [flow]);

  useEffect(() => {
    if (flow !== 'hibist' && flow !== 'sailor') return;
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!disposed) void refreshConfigs();
      }, 100);
    };
    const listener = (event: MessageEvent) => {
      if (event.data?.command === 'flowConfigFilesChanged' && event.data?.flow === flow) {
        if (Date.now() >= skipWatchRefreshUntilRef.current) scheduleRefresh();
      }
    };
    window.addEventListener('message', listener);
    void watchFlowConfigFiles(flow).catch((error) => {
      if (!disposed) console.error(`Failed to watch ${flow} module directory`, error);
    });
    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('message', listener);
    };
  }, [flow, refreshConfigs]);

  useEffect(() => {
    focusHydratedRef.current = false;
    focusKeysRef.current = [];
    setConfigsLoaded(false);
    setFocusKeys([]);
    onExecutionSelectionChange?.([]);
  }, [flow, onExecutionSelectionChange]);

  useEffect(() => {
    if (focusHydratedRef.current) {
      return;
    }
    if (flowSavedData === undefined) {
      return;
    }
    const rawKeys = flowSavedData?.focusModules
      ?? flowSavedData?.forcusModules
      ?? flowSavedData?.focusModuleKeys
      ?? flowSavedData?.executionModuleKeys;
    const restoredKeys = Array.isArray(rawKeys)
      ? rawKeys.filter((key): key is string => typeof key === 'string' && Boolean(key))
      : [];
    const validKeys = new Set(configs.map((item) => item.key));
    const nextKeys = configsLoaded ? restoredKeys.filter((key) => validKeys.has(key)) : restoredKeys;
    focusKeysRef.current = nextKeys;
    setFocusKeys(nextKeys);
    syncFocusedModules(nextKeys);
    void saveModuleState(configs.map((item) => item.key), nextKeys);
    focusHydratedRef.current = true;
  }, [configs, configsLoaded, flowSavedData, saveModuleState, syncFocusedModules]);

  useEffect(() => {
    if (!configs.length || !focusKeys.length) {
      return;
    }
    const validKeys = new Set(configs.map((item) => item.key));
    const nextKeys = focusKeys.filter((key) => validKeys.has(key));
    if (nextKeys.length !== focusKeys.length) {
      focusKeysRef.current = nextKeys;
      setFocusKeys(nextKeys);
      saveModuleState(configs.map((item) => item.key), nextKeys).catch(() => undefined);
      syncFocusedModules(nextKeys);
    }
  }, [configs, focusKeys, saveModuleState, syncFocusedModules]);

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

    skipWatchRefreshUntilRef.current = Date.now() + 500;
    const result = await createFlowConfigFile(flow, nextName);
    if (!result.success || !result.config) {
      message.error(result.error ?? '新增模块失败');
      return;
    }

    setCreateOpen(false);
    const nextFocusKeys = Array.from(new Set([...focusKeys, result.config.key]));
    focusKeysRef.current = nextFocusKeys;
    setFocusKeys(nextFocusKeys);
    saveModuleState([...configs.map((item) => item.key), result.config.key], nextFocusKeys).catch(() => undefined);
    syncFocusedModules(nextFocusKeys);
    message.success(`已创建模块 ${result.config.moduleName}`);
    await refreshConfigs(result.config.key);
  };

  const duplicateSelected = async (moduleName = selectedConfig?.moduleName) => {
    if (!moduleName) return;
    skipWatchRefreshUntilRef.current = Date.now() + 500;
    const result = await duplicateFlowConfigFile(flow, moduleName);
    if (!result.success || !result.config) {
      message.error(result.error ?? '复制模块失败');
      return;
    }
    const nextFocusKeys = Array.from(new Set([...focusKeys, result.config.key]));
    focusKeysRef.current = nextFocusKeys;
    setFocusKeys(nextFocusKeys);
    saveModuleState([...configs.map((item) => item.key), result.config.key], nextFocusKeys).catch(() => undefined);
    syncFocusedModules(nextFocusKeys);
    message.success(`已复制模块 ${result.config.moduleName}`);
    await refreshConfigs(result.config.key);
  };

  const openSelected = (moduleName = selectedConfig?.moduleName) => {
    if (!moduleName) return;
    const config = configs.find((item) => item.moduleName === moduleName) ?? selectedConfig;
    if (config?.filePath) {
      openFileInEditor(config.filePath);
    } else {
      message.warning('模块 CFG 路径为空');
    }
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

    skipWatchRefreshUntilRef.current = Date.now() + 500;
    const result = await renameFlowConfigFile(flow, selectedConfig.moduleName, nextName);
    if (!result.success || !result.config) {
      message.error(result.error ?? '重命名模块失败');
      return;
    }

    setRenameOpen(false);
    if (focusKeys.includes(selectedConfig.key)) {
      const nextFocusKeys = focusKeys.map((key) => key === selectedConfig.key ? result.config!.key : key);
      focusKeysRef.current = nextFocusKeys;
      setFocusKeys(nextFocusKeys);
      const nextModules = configs.map((item) => item.key === selectedConfig.key ? result.config!.key : item.key);
      saveModuleState(nextModules, nextFocusKeys).catch(() => undefined);
      syncFocusedModules(nextFocusKeys);
    }
    message.success(`已重命名为 ${result.config.moduleName}`);
    await refreshConfigs(result.config.key);
  };

  const deleteSelected = async (moduleName?: string) => {
    const targetKeys = Array.from(new Set(
      moduleName
        ? [moduleName]
        : batchModuleKeys.length > 0
          ? batchModuleKeys
          : selectedConfig?.key
            ? [selectedConfig.key]
            : []
    ));
    if (!targetKeys.length) return;
    const isBatch = targetKeys.length > 1;
    if (!await confirmDelete('Module', targetKeys)) return;
        skipWatchRefreshUntilRef.current = Date.now() + 500;
    const results = await Promise.all(
          targetKeys.map(async (key) => ({
            key,
            result: await deleteFlowConfigFile(flow, key),
          }))
        );
        const deletedKeys = results
          .filter(({ result }) => result.success)
          .map(({ key }) => key);
        const failedResults = results.filter(({ result }) => !result.success);

        if (!deletedKeys.length) {
          message.error(failedResults[0]?.result.error ?? '删除模块失败');
          return;
        }
        const deletedSet = new Set(deletedKeys);
        const nextFocusKeys = focusKeys.filter((key) => !deletedSet.has(key));
        setBatchModuleKeys((current) => current.filter((key) => !deletedSet.has(key)));
        if (nextFocusKeys.length !== focusKeys.length) {
          focusKeysRef.current = nextFocusKeys;
          setFocusKeys(nextFocusKeys);
          saveModuleState(configs.filter((item) => !deletedSet.has(item.key)).map((item) => item.key), nextFocusKeys).catch(() => undefined);
          syncFocusedModules(nextFocusKeys);
        }
        const nextSelectedKey = deletedSet.has(selectedKeyRef.current)
          ? configs.find((item) => !deletedSet.has(item.key) && nextFocusKeys.includes(item.key))?.key
          : selectedKeyRef.current;
        await refreshConfigs(nextSelectedKey);

        if (failedResults.length) {
          message.warning(
            `已删除 ${deletedKeys.length} 个模块，${failedResults.length} 个删除失败：${failedResults.map(({ key }) => key).join('、')}`
          );
        } else {
          message.success(isBatch ? `已删除 ${deletedKeys.length} 个模块` : `已删除模块 ${deletedKeys[0]}`);
        }
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
    focusKeysRef.current = nextKeys;
    setFocusKeys(nextKeys);
    setBatchModuleKeys((prev) => prev.filter((key) => nextKeys.includes(key)));
    saveModuleState(configs.map((item) => item.key), nextKeys).catch(() => undefined);
    if (nextKeys.length === 0) {
      return;
    }
    if (!nextKeys.includes(selectedKey)) {
      const preferred = nextKeys.find((key) => configs.some((item) => item.key === key));
      if (!preferred) {
        return;
      }
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
      {false && (
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
      )}

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
        <Space.Compact style={{ width: '100%' }}>
        <Select
          mode="multiple"
          allowClear
          size="small"
          maxTagCount="responsive"
          placeholder="选择负责模块"
          value={focusKeys}
          options={moduleOptions}
          onChange={(keys) => updateFocusKeys(keys)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Tooltip title={'刷新'}>
          <Button size={'small'} icon={<ReloadOutlined />} loading={loading} onClick={() => refreshConfigs()} />
        </Tooltip>
        </Space.Compact>
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
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={!batchModuleKeys.length && !selectedConfig}
            onClick={() => deleteSelected()}
          />
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
              { key: 'open', icon: <FileOutlined />, label: '打开' },
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
                    if (key === 'open') openSelected(item.moduleName);
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
        width={1000}
        footer={null}
        title={<Space><PlayCircleOutlined style={{ color: accent }} /><span>选择运行步骤范围</span></Space>}
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
              <StepSelector
                steps={stepList}
                range={modalStepRange}
                onChange={setModalStepRange}
              />
            </div>
          ) : (
            <div style={{ padding: 12, textAlign: 'center', color: 'var(--vscode-disabledForeground)' }}>
              加载流水线步骤中...
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <Button onClick={() => setTaskModalOpen(false)}>取消</Button>
            <Button
              type="primary"
              disabled={!stepList.length || !runTargetKeys.length}
              onClick={confirmSelectRun}
            >
              运行
            </Button>
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default DesignTreePanel;
