import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
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
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  FilterOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
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
  onSelect: (key: string) => void;
}

const DesignTreePanel: React.FC<DesignTreePanelProps> = ({
  accent,
  flow,
  flowLabel,
  selectedKey,
  onSelect,
}) => {
  const { savedData: flowSavedData } = useFlowConfig(flow);
  const focusHydratedRef = useRef(false);
  const [configs, setConfigs] = useState<FlowConfigFileInfo[]>([]);
  const [configsDir, setConfigsDir] = useState('');
  const [search, setSearch] = useState('');
  const [focusKeys, setFocusKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createValue, setCreateValue] = useState('');

  const selectedConfig = configs.find((item) => item.key === selectedKey) ?? configs[0];

  const selectModule = useCallback((key: string) => {
    onSelect(key);
    saveConfig(flow, { activeModuleKey: key, moduleConfigs: undefined }).catch(() => undefined);
  }, [flow, onSelect]);

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
    setFocusKeys([]);
  }, [flow]);

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
    }
    message.success(`已重命名模块为 ${result.config.moduleName}`);
    await refreshConfigs(result.config.key);
  };

  const deleteSelected = (moduleName = selectedConfig?.moduleName) => {
    if (!moduleName) return;
    Modal.confirm({
      title: `删除模块 ${moduleName}？`,
      content: '该操作会从当前流程的配置目录中删除该模块的所有配置。',
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
          <Text type="secondary" style={{ fontSize: 12 }}>
            关注模块
          </Text>
          {focusKeys.length > 0 && (
            <Button size="small" type="link" onClick={() => updateFocusKeys([])} style={{ padding: 0 }}>
              显示全部
            </Button>
          )}
        </Space>
        <Select
          mode="multiple"
          allowClear
          size="small"
          maxTagCount="responsive"
          placeholder="选择自己负责的模块"
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
      </Space>

      {filteredConfigs.length ? (
        <List
          loading={loading}
          size="small"
          dataSource={filteredConfigs}
          renderItem={(item) => {
            const selected = item.key === selectedConfig?.key;
            return (
              <Dropdown
                trigger={['contextMenu']}
                menu={{
                  items: [
                    { key: 'copy', icon: <CopyOutlined />, label: '复制' },
                    { key: 'rename', icon: <EditOutlined />, label: '重命名' },
                    { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    selectModule(item.key);
                    if (key === 'copy') void duplicateSelected(item.moduleName);
                    if (key === 'rename') openRename(item.moduleName);
                    if (key === 'delete') deleteSelected(item.moduleName);
                  },
                }}
              >
                <List.Item
                  onClick={() => selectModule(item.key)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 6,
                    padding: '7px 8px',
                    background: selected ? `${accent}18` : 'transparent',
                    border: selected ? `1px solid ${accent}55` : '1px solid transparent',
                  }}
                >
                  <Space style={{ minWidth: 0, width: '100%' }}>
                    <FileTextOutlined style={{ color: selected ? accent : 'var(--vscode-descriptionForeground)' }} />
                    <Text strong={selected} ellipsis={{ tooltip: item.moduleName }} style={{ minWidth: 0 }}>
                      {item.moduleName}
                    </Text>
                  </Space>
                </List.Item>
              </Dropdown>
            );
          }}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? '正在读取模块列表' : '暂无模块'} />
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
          <Text style={{ color: accent, fontSize: 12, fontWeight: 700 }}>
            模块
          </Text>
          <Title level={5} style={{ margin: 0, fontSize: 15 }}>
            {flowLabel} 模块配置
          </Title>
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
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前模块
          </Text>
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
        title="新增"
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
        title="重命名"
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
    </div>
  );
};

export default DesignTreePanel;
