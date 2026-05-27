import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Tooltip,
  Tree,
  Typography,
  message,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  ApartmentOutlined,
  BranchesOutlined,
  ClusterOutlined,
  CompressOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExpandAltOutlined,
  FileAddOutlined,
  FilterOutlined,
  LeftOutlined,
  NodeIndexOutlined,
  RightOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { readDesignTree, saveConfig, saveDesignTree } from '../../utils/ipc';
import { useFlowConfig } from '../../hooks/useFlowConfig';

const { Text, Title } = Typography;

export interface DesignTreeModule {
  key: string;
  title: string;
  type: 'top' | 'module' | 'scanbus';
  children?: DesignTreeModule[];
}

interface DesignTreePanelProps {
  accent: string;
  flow: 'hibist' | 'sailor' | 'verification';
  flowLabel: string;
  selectedKey: string;
  onSelect: (key: string) => void;
}

const mockDesignTree: DesignTreeModule[] = [
  {
    key: 'top_abc',
    title: 'top_abc',
    type: 'top',
    children: [
      {
        key: 'module_a',
        title: 'module_a',
        type: 'module',
        children: [
          { key: 'module_a_core', title: 'module_a_core', type: 'module' },
          { key: 'scanbus_a0', title: 'scanbus_a0', type: 'scanbus' },
        ],
      },
      {
        key: 'module_b',
        title: 'module_b',
        type: 'module',
        children: [
          { key: 'module_b_ctrl', title: 'module_b_ctrl', type: 'module' },
          { key: 'scanbus_b0', title: 'scanbus_b0', type: 'scanbus' },
        ],
      },
      { key: 'scanbus_top', title: 'scanbus_top', type: 'scanbus' },
    ],
  },
];

function getModuleIcon(type: DesignTreeModule['type']) {
  if (type === 'top') return <ApartmentOutlined />;
  if (type === 'scanbus') return <NodeIndexOutlined />;
  return <ClusterOutlined />;
}

function cloneModules(modules: DesignTreeModule[]): DesignTreeModule[] {
  return modules.map((module) => ({
    ...module,
    children: module.children ? cloneModules(module.children) : undefined,
  }));
}

function getAllKeys(modules: DesignTreeModule[]): string[] {
  return modules.flatMap((module) => [
    module.key,
    ...(module.children ? getAllKeys(module.children) : []),
  ]);
}

function findModule(modules: DesignTreeModule[], key: string): DesignTreeModule | undefined {
  for (const module of modules) {
    if (module.key === key) return module;
    const child = module.children ? findModule(module.children, key) : undefined;
    if (child) return child;
  }
  return undefined;
}

function makeUniqueKey(base: string, modules: DesignTreeModule[]): string {
  const keys = new Set(getAllKeys(modules));
  let candidate = base.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'module';
  const root = candidate;
  let index = 1;
  while (keys.has(candidate)) {
    candidate = `${root}_${index++}`;
  }
  return candidate;
}

function mapModules(
  modules: DesignTreeModule[],
  key: string,
  mapper: (module: DesignTreeModule) => DesignTreeModule
): DesignTreeModule[] {
  return modules.map((module) => {
    if (module.key === key) {
      return mapper(module);
    }
    return {
      ...module,
      children: module.children ? mapModules(module.children, key, mapper) : module.children,
    };
  });
}

function removeModule(
  modules: DesignTreeModule[],
  key: string
): { nodes: DesignTreeModule[]; removed?: DesignTreeModule } {
  let removed: DesignTreeModule | undefined;
  const nodes = modules
    .filter((module) => {
      if (module.key === key) {
        removed = module;
        return false;
      }
      return true;
    })
    .map((module) => {
      if (removed) return module;
      const result = module.children ? removeModule(module.children, key) : { nodes: undefined, removed: undefined };
      if (result.removed) {
        removed = result.removed;
        return { ...module, children: result.nodes };
      }
      return module;
    });

  return { nodes, removed };
}

function insertAsChild(
  modules: DesignTreeModule[],
  parentKey: string,
  child: DesignTreeModule
): DesignTreeModule[] {
  return mapModules(modules, parentKey, (module) => ({
    ...module,
    children: [...(module.children ?? []), child],
  }));
}

function insertNear(
  modules: DesignTreeModule[],
  targetKey: string,
  item: DesignTreeModule,
  after: boolean
): DesignTreeModule[] {
  const next: DesignTreeModule[] = [];
  for (const module of modules) {
    if (module.key === targetKey && !after) next.push(item);
    next.push({
      ...module,
      children: module.children ? insertNear(module.children, targetKey, item, after) : module.children,
    });
    if (module.key === targetKey && after) next.push(item);
  }
  return next;
}

function rekeySubtree(module: DesignTreeModule, modules: DesignTreeModule[], suffix = '_copy'): DesignTreeModule {
  const nextKey = makeUniqueKey(`${module.key}${suffix}`, modules);
  return {
    ...module,
    key: nextKey,
    title: nextKey,
    children: module.children?.map((child) => rekeySubtree(child, modules, suffix)),
  };
}

function filterModules(modules: DesignTreeModule[], keyword: string): DesignTreeModule[] {
  const term = keyword.trim().toLowerCase();
  if (!term) return modules;

  const filtered: DesignTreeModule[] = [];
  for (const module of modules) {
      const children = module.children ? filterModules(module.children, keyword) : [];
      const matched = module.title.toLowerCase().includes(term) || module.key.toLowerCase().includes(term);
      if (matched || children.length > 0) {
        filtered.push({ ...module, children: children.length ? children : undefined });
      }
  }
  return filtered;
}

function filterModulesByFocus(modules: DesignTreeModule[], focusKeys: string[]): DesignTreeModule[] {
  if (focusKeys.length === 0) return modules;
  const focusSet = new Set(focusKeys);

  const visit = (items: DesignTreeModule[]): DesignTreeModule[] => {
    const filtered: DesignTreeModule[] = [];
    for (const module of items) {
      if (focusSet.has(module.key)) {
        filtered.push(module);
        continue;
      }

      const children = module.children ? visit(module.children) : [];
      if (children.length > 0) {
        filtered.push({ ...module, children });
      }
    }
    return filtered;
  };

  return visit(modules);
}

function collectModuleOptions(
  modules: DesignTreeModule[],
  parents: string[] = []
): Array<{ label: string; value: string }> {
  return modules.flatMap((module) => {
    const pathLabel = [...parents, module.title].join(' / ');
    return [
      { label: pathLabel, value: module.key },
      ...(module.children ? collectModuleOptions(module.children, [...parents, module.title]) : []),
    ];
  });
}

function normalizeTreeState(value: unknown): DesignTreeModule[] {
  if (!value || typeof value !== 'object' || !('nodes' in value)) {
    return cloneModules(mockDesignTree);
  }

  const nodes = (value as { nodes?: unknown }).nodes;
  return Array.isArray(nodes) && nodes.length ? nodes as DesignTreeModule[] : cloneModules(mockDesignTree);
}

const DesignTreePanel: React.FC<DesignTreePanelProps> = ({
  accent,
  flow,
  flowLabel,
  selectedKey,
  onSelect,
}) => {
  const { savedData } = useFlowConfig('common');
  const { savedData: flowSavedData } = useFlowConfig(flow);
  const designTreePath = typeof savedData?.designTree === 'string' ? savedData.designTree : '';
  const [modules, setModules] = useState<DesignTreeModule[]>(() => cloneModules(mockDesignTree));
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(() => getAllKeys(mockDesignTree));
  const [search, setSearch] = useState('');
  const [focusKeys, setFocusKeys] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const selectedModule = findModule(modules, selectedKey) ?? modules[0];

  useEffect(() => {
    readDesignTree(flow).then((data) => {
      const loaded = normalizeTreeState(data);
      setModules(loaded);
      setExpandedKeys(getAllKeys(loaded));
      onSelect(findModule(loaded, selectedKey)?.key ?? loaded[0]?.key ?? '');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rawKeys = flowSavedData?.focusModuleKeys;
    if (!Array.isArray(rawKeys)) {
      return;
    }
    setFocusKeys(rawKeys.filter((key): key is string => typeof key === 'string' && Boolean(findModule(modules, key))));
  }, [flowSavedData, modules]);

  const touchModules = useCallback((next: DesignTreeModule[]) => {
    setModules(next);
    setDirty(true);
  }, []);

  const selectModule = (key: string) => {
    onSelect(key);
    saveConfig(flow, { activeModuleKey: key, moduleConfigs: undefined }).catch(() => undefined);
  };

  const addChildFor = (moduleKey: string) => {
    const target = findModule(modules, moduleKey);
    if (!target) return;
    const key = makeUniqueKey(`${target.key}_child`, modules);
    const next = insertAsChild(modules, target.key, {
      key,
      title: key,
      type: 'module',
    });
    touchModules(next);
    setExpandedKeys([...new Set([...expandedKeys, target.key])]);
    selectModule(key);
  };

  const duplicateModule = (moduleKey: string) => {
    const target = findModule(modules, moduleKey);
    if (!target) return;
    const copy = rekeySubtree(target, modules);
    const next = insertNear(modules, target.key, copy, true);
    touchModules(next);
    selectModule(copy.key);
  };

  const deleteModule = (moduleKey: string) => {
    const target = findModule(modules, moduleKey);
    if (!target || target.type === 'top') return;
    const result = removeModule(modules, target.key);
    touchModules(result.nodes);
    selectModule(result.nodes[0]?.key ?? '');
  };

  const openRename = (moduleKey: string) => {
    const target = findModule(modules, moduleKey);
    if (!target) return;
    selectModule(target.key);
    setRenameValue(target.title);
    setRenameOpen(true);
  };

  const confirmRename = () => {
    if (!selectedModule) return;
    const title = renameValue.trim();
    if (!title) return;
    const key = selectedModule.key;
    const next = mapModules(modules, key, (module) => ({
      ...module,
      title,
      key: title === module.title ? module.key : makeUniqueKey(title, modules.filter((item) => item.key !== key)),
    }));
    touchModules(next);
    setRenameOpen(false);
    selectModule(findModule(next, key)?.key ?? title);
  };

  const persistTree = async () => {
    setSaving(true);
    try {
      const result = await saveDesignTree(flow, {
        version: 1,
        nodes: modules,
        updatedAt: new Date().toISOString(),
      });
      if (result.success) {
        setDirty(false);
        message.success(`设计树已保存：${result.filePath ?? result.mode ?? 'local-state'}`);
      } else {
        message.error(result.error ?? '保存设计树失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const addChild = () => {
    if (selectedModule) addChildFor(selectedModule.key);
  };

  const duplicateSelected = () => {
    if (selectedModule) duplicateModule(selectedModule.key);
  };

  const deleteSelected = () => {
    if (selectedModule) deleteModule(selectedModule.key);
  };

  const moduleOptions = useMemo(() => collectModuleOptions(modules), [modules]);
  const scopedModules = useMemo(() => filterModulesByFocus(modules, focusKeys), [modules, focusKeys]);
  const filteredModules = useMemo(() => filterModules(scopedModules, search), [scopedModules, search]);
  const visibleKeys = useMemo(() => new Set(getAllKeys(filteredModules)), [filteredModules]);

  useEffect(() => {
    if (focusKeys.length === 0 || visibleKeys.has(selectedKey)) {
      return;
    }
    const nextSelected = focusKeys.find((key) => visibleKeys.has(key)) ?? getAllKeys(filteredModules)[0] ?? '';
    if (nextSelected) {
      selectModule(nextSelected);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredModules, focusKeys, selectedKey, visibleKeys]);

  const updateFocusKeys = (keys: string[]) => {
    setFocusKeys(keys);
    saveConfig(flow, { focusModuleKeys: keys }).catch(() => undefined);
    if (keys.length === 0) {
      return;
    }

    const scoped = filterModulesByFocus(modules, keys);
    setExpandedKeys(getAllKeys(scoped));
    const preferred = keys.find((key) => findModule(modules, key));
    if (preferred) {
      selectModule(preferred);
    }
  };

  const treeData: DataNode[] = useMemo(() => {
    const build = (items: DesignTreeModule[]): DataNode[] => items.map((module) => ({
      key: module.key,
      title: (
        <Dropdown
          trigger={['contextMenu']}
          menu={{
            items: [
              { key: 'add', icon: <FileAddOutlined />, label: '新增子模块' },
              { key: 'copy', icon: <CopyOutlined />, label: '复制' },
              { key: 'rename', icon: <EditOutlined />, label: '重命名' },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: '删除',
                danger: true,
                disabled: module.type === 'top',
              },
            ],
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation();
              selectModule(module.key);
              if (key === 'add') addChildFor(module.key);
              if (key === 'copy') duplicateModule(module.key);
              if (key === 'rename') openRename(module.key);
              if (key === 'delete') deleteModule(module.key);
            },
          }}
        >
          <span
            onContextMenu={() => selectModule(module.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              maxWidth: '100%',
              minWidth: 0,
              verticalAlign: 'middle',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              title={module.title}
              style={{
                color: 'var(--vscode-foreground)',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {module.title}
            </span>
          </span>
        </Dropdown>
      ),
      icon: getModuleIcon(module.type),
      children: module.children ? build(module.children) : undefined,
    }));
    return build(filteredModules);
  }, [addChildFor, deleteModule, duplicateModule, filteredModules, openRename]);

  const renderTree = (compact = false) => (
    <>
      <Space.Compact style={{ width: '100%', marginBottom: 10 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索模块"
        />
        <Tooltip title={compact ? '缩小' : '放大'}>
          <Button
            icon={compact ? <CompressOutlined /> : <ExpandAltOutlined />}
            onClick={() => setFullscreen(!compact)}
          />
        </Tooltip>
      </Space.Compact>

      <Space direction="vertical" size={6} style={{ width: '100%', marginBottom: 10 }}>
        <Space size={6}>
          <FilterOutlined style={{ color: focusKeys.length ? accent : 'var(--vscode-descriptionForeground)' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Focus modules
          </Text>
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

      <Space size={6} wrap style={{ marginBottom: 10 }}>
        <Tooltip title="新增子模块">
          <Button size="small" icon={<FileAddOutlined />} onClick={addChild} />
        </Tooltip>
        <Tooltip title="复制">
          <Button size="small" icon={<CopyOutlined />} onClick={duplicateSelected} />
        </Tooltip>
        <Tooltip title="重命名">
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setRenameValue(selectedModule?.title ?? '');
              setRenameOpen(true);
            }}
          />
        </Tooltip>
        <Tooltip title="删除">
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={!selectedModule || selectedModule.type === 'top'}
            onClick={deleteSelected}
          />
        </Tooltip>
        <Button size="small" onClick={() => setExpandedKeys(getAllKeys(filteredModules))}>
          展开
        </Button>
        <Button size="small" onClick={() => setExpandedKeys([])}>
          收起
        </Button>
      </Space>

      {treeData.length ? (
        <div
          style={{
            overflowX: 'hidden',
          }}
        >
          <style>
            {`
              .dft-design-tree .ant-tree-treenode {
                width: 100%;
                min-width: 0;
                align-items: center;
              }
              .dft-design-tree .ant-tree-draggable-icon,
              .dft-design-tree .ant-tree-switcher,
              .dft-design-tree .ant-tree-iconEle {
                flex: none;
              }
              .dft-design-tree .ant-tree-node-content-wrapper {
                min-width: 0;
                overflow: hidden;
              }
              .dft-design-tree .ant-tree-node-content-wrapper,
              .dft-design-tree .ant-tree-title {
                white-space: nowrap;
              }
              .dft-design-tree .ant-tree-title {
                display: inline-block;
                max-width: 100%;
                min-width: 0;
                overflow: hidden;
                vertical-align: middle;
              }
            `}
          </style>
          <Tree
            className="dft-design-tree"
            showIcon
            blockNode
            draggable
            expandedKeys={expandedKeys}
            selectedKeys={selectedModule ? [selectedModule.key] : []}
            treeData={treeData}
            onExpand={(keys) => setExpandedKeys(keys)}
            onSelect={(keys) => {
              const key = String(keys[0] ?? selectedModule?.key ?? '');
              if (key) selectModule(key);
            }}
            onDrop={(info) => {
              const dragKey = String(info.dragNode.key);
              const dropKey = String(info.node.key);
              if (dragKey === dropKey) return;
              const removed = removeModule(modules, dragKey);
              if (!removed.removed) return;
              const next = info.dropToGap
                ? insertNear(removed.nodes, dropKey, removed.removed, info.dropPosition > 0)
                : insertAsChild(removed.nodes, dropKey, removed.removed);
              touchModules(next);
              setExpandedKeys([...new Set([...expandedKeys, dropKey])]);
            }}
          />
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配模块" />
      )}
    </>
  );

  /* ── Collapsed: slim full-height strip ── */
  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        title="展开设计树"
        style={{
          /* flex:1 fills the <aside> column → same height as right side */
          flex: 1,
          width: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          /* Matches the expanded panel border, left border is accent */
          borderRadius: 8,
          border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
          borderLeft: `3px solid ${accent}`,
          background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
          overflow: 'hidden',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Expand chevron */}
        <Tooltip title="展开设计树" placement="right">
          <div
            style={{
              marginTop: 10,
              marginBottom: 6,
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

  /* ── Expanded panel ── */
  return (
    <div
      style={{
        /* flex:1 fills the <aside> column → same height as right side */
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
      {/* ── Header ── */}
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
            设计树
          </Text>
          <Title level={5} style={{ margin: 0, fontSize: 15 }}>
            {flowLabel === 'Design' ? '设计模块范围' : '验证模块范围'}
          </Title>
          <Text
            type="secondary"
            ellipsis={{ tooltip: designTreePath || '模拟设计树' }}
            style={{ fontSize: 12 }}
          >
            {designTreePath || '模拟设计树'}
          </Text>
        </Space>

        {/* Collapse toggle – integrated in header */}
        <Tooltip title="收起设计树" placement="right">
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

      {/* Tree list – scrollable, grows to fill */}
      <div style={{ padding: 12, flex: 1, overflow: 'auto', minHeight: 0 }}>
        {renderTree()}
      </div>

      {/* Module info footer */}
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
          <Space>
            <BranchesOutlined style={{ color: accent }} />
            <Text strong>{selectedModule?.title ?? '未选择模块'}</Text>
          </Space>
          <Badge
            color={accent}
            text={flowLabel === 'Design' ? '设计配置范围' : '验证配置范围'}
          />
          <Button
            block
            type={dirty ? 'primary' : 'default'}
            icon={<SaveOutlined />}
            loading={saving}
            onClick={persistTree}
          >
            {dirty ? '保存设计树' : '已保存'}
          </Button>
        </Space>
      </div>

      <Modal
        open={renameOpen}
        title="重命名模块"
        okText="确定"
        cancelText="取消"
        onOk={confirmRename}
        onCancel={() => setRenameOpen(false)}
      >
        <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
      </Modal>

      <Modal
        open={fullscreen}
        title={flowLabel === 'Design' ? '设计树' : '验证设计树'}
        width="min(980px, 92vw)"
        footer={null}
        onCancel={() => setFullscreen(false)}
      >
        {renderTree(true)}
      </Modal>
    </div>
  );
  };

export default DesignTreePanel;
