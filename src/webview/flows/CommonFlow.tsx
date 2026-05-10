import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Dropdown,
  Form,
  Input,
  Modal,
  Radio,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  BranchesOutlined,
  CloudDownloadOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  FileSyncOutlined,
  PullRequestOutlined,
  SaveOutlined,
  SyncOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../hooks/useVscodePath';
import { useFlowConfig } from '../hooks/useFlowConfig';
import PathInput from '../components/shared/PathInput';
import useWizardStore from '../store/wizardStore';
import ObsViewer from '../components/shared/ObsViewer';
import CollapsibleSection from '../components/shared/CollapsibleSection';
import {
  getProjectRepoGitInfo,
  openSourceControl,
  runRepoGitAction,
  syncCommonArtifacts,
  type RepoGitInfo,
  type RepoKey,
} from '../utils/ipc';

const { Text } = Typography;

const repoLabels: Record<RepoKey, string> = {
  design: '设计仓库',
  verification: '验证仓库',
};

const repoShortLabels: Record<RepoKey, string> = {
  design: '设计',
  verification: '验证',
};

const CommonFlow: React.FC = () => {
  const designTree = useVscodePath();
  const normTable = useVscodePath();
  const [selectedRepo, setSelectedRepo] = useState<RepoKey>('design');
  const [repoInfo, setRepoInfo] = useState<Record<RepoKey, RepoGitInfo>>({
    design: { repo: 'design' },
    verification: { repo: 'verification' },
  });
  const [repoLoading, setRepoLoading] = useState(false);
  const [obsViewerOpen, setObsViewerOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [branchModal, setBranchModal] = useState<{
    open: boolean;
    repo: RepoKey;
    mode: 'checkout' | 'createBranch';
    value: string;
  }>({ open: false, repo: 'design', mode: 'checkout', value: '' });
  const activeProject = useWizardStore((state) => state.activeProject);

  const { savedData, loading, saving, syncing, hasUnsaved, handleSave, debouncedSave, markDirty } =
    useFlowConfig('common');

  const collectFormData = () => ({
    designTree: designTree.value,
    normTable: normTable.value,
  });

  const refreshRepoInfo = async () => {
    setRepoLoading(true);
    try {
      const result = await getProjectRepoGitInfo();
      const next = { ...repoInfo };
      for (const item of result.repos ?? []) {
        next[item.repo] = item;
      }
      setRepoInfo(next);
    } finally {
      setRepoLoading(false);
    }
  };

  useEffect(() => {
    refreshRepoInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!savedData) return;
    if (savedData.designTree) designTree.setValue(String(savedData.designTree));
    if (savedData.normTable) normTable.setValue(String(savedData.normTable));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData]);

  useEffect(() => {
    if (savedData === null) return;
    const currentData = collectFormData();
    const hasChange =
      currentData.designTree !== (savedData?.designTree ?? '') ||
      currentData.normTable !== (savedData?.normTable ?? '');
    if (hasChange) {
      markDirty();
      debouncedSave(currentData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designTree.value, normTable.value]);

  const selectedInfo = repoInfo[selectedRepo];
  const syncTargets = useMemo(
    () => [
      { name: '设计树文件', path: `${selectedInfo.repoRoot ?? repoLabels[selectedRepo]}\\design_tree.mock.json` },
      { name: '归一化表格文件', path: `${selectedInfo.repoRoot ?? repoLabels[selectedRepo]}\\normalized-table.*` },
    ],
    [selectedInfo.repoRoot, selectedRepo]
  );

  const runAction = async (repo: RepoKey, action: 'pull' | 'push' | 'openScm') => {
    const hide = message.loading('正在处理 Git 操作...', 0);
    try {
      const result = await runRepoGitAction({ repo, action });
      if (result.success) {
        message.success('操作完成');
        await refreshRepoInfo();
      } else {
        message.error(result.error ?? 'Git 操作失败');
      }
    } finally {
      hide();
    }
  };

  const submitBranchAction = async () => {
    const branchName = branchModal.value.trim();
    if (!branchName) {
      message.warning('请输入分支名');
      return;
    }
    const result = await runRepoGitAction({
      repo: branchModal.repo,
      action: branchModal.mode,
      branchName,
    });
    if (result.success) {
      message.success(branchModal.mode === 'checkout' ? '已切换分支' : '已创建并切换分支');
      setBranchModal((prev) => ({ ...prev, open: false, value: '' }));
      await refreshRepoInfo();
    } else {
      message.error(result.error ?? '分支操作失败');
    }
  };

  const repoMenu = (repo: RepoKey): MenuProps['items'] => [
    { key: 'pull', icon: <CloudSyncOutlined />, label: '更新到最新', onClick: () => runAction(repo, 'pull') },
    { key: 'push', icon: <UploadOutlined />, label: '上传本地提交', onClick: () => runAction(repo, 'push') },
    { type: 'divider' },
    {
      key: 'checkout',
      icon: <PullRequestOutlined />,
      label: '切换到已有分支',
      onClick: () => setBranchModal({ open: true, repo, mode: 'checkout', value: '' }),
    },
    {
      key: 'createBranch',
      icon: <BranchesOutlined />,
      label: '从当前版本新建分支',
      onClick: () => setBranchModal({ open: true, repo, mode: 'createBranch', value: '' }),
    },
    { type: 'divider' },
    { key: 'openScm', icon: <FileSyncOutlined />, label: '打开 VS Code Git 面板', onClick: () => runAction(repo, 'openScm') },
  ];

  const openSyncModal = async () => {
    await handleSave(collectFormData());
    setCommitMsg('');
    setPushAfterCommit(false);
    setSyncModalOpen(true);
  };

  const confirmSync = async () => {
    const result = await syncCommonArtifacts({
      targetRepo: selectedRepo,
      designTree: designTree.value,
      normTable: normTable.value,
      message: commitMsg.trim() || undefined,
      push: pushAfterCommit,
    });
    if (result.success) {
      message.success(`已同步到${repoLabels[selectedRepo]}`);
      setSyncModalOpen(false);
      await refreshRepoInfo();
      return;
    }
    message.error(result.error ?? '同步失败');
  };

  const openBranchModal = (repo: RepoKey, mode: 'checkout' | 'createBranch' = 'checkout') => {
    setBranchModal({ open: true, repo, mode, value: '' });
  };

  const renderRepoCard = (repo: RepoKey) => {
    const info = repoInfo[repo];
    const active = selectedRepo === repo;
    return (
      <Dropdown trigger={['contextMenu']} menu={{ items: repoMenu(repo) }}>
        <button
          type="button"
          onClick={() => setSelectedRepo(repo)}
          style={{
            flex: '1 1 280px',
            minWidth: 260,
            textAlign: 'left',
            border: `1px solid ${active ? 'var(--vscode-focusBorder, #1677ff)' : 'var(--vscode-panel-border, rgba(127,127,127,0.24))'}`,
            borderRadius: 8,
            padding: '12px 14px',
            background: active ? 'rgba(22, 119, 255, 0.10)' : 'var(--vscode-editor-background)',
            color: 'var(--vscode-foreground)',
            cursor: 'pointer',
          }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong>{repoLabels[repo]}</Text>
              <Tag color={info?.hasChanges ? 'orange' : 'green'}>
                {info?.hasChanges ? `${info.changedCount ?? 0} 个变更` : '干净'}
              </Tag>
            </Space>
            <Space size={6}>
              <BranchesOutlined />
              <Text>{info?.branch || info?.error || '未检测到分支'}</Text>
            </Space>
            <Text type="secondary" ellipsis={{ tooltip: info?.repoRoot }}>
              {info?.upstream ? `跟踪 ${info.upstream}` : info?.repoRoot ?? '等待仓库信息'}
            </Text>
          </Space>
        </button>
      </Dropdown>
    );
  };

  const obsSpaceName = activeProject?.name ?? 'dft-ide-workspace';

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <div>
        {hasUnsaved && (
          <Alert
            showIcon
            type="warning"
            message="路径配置有本地改动，同步前会先保存 Common 配置。"
            style={{ marginBottom: 12, borderRadius: 8 }}
          />
        )}

        <div
          style={{
            border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
            borderRadius: 8,
            padding: 14,
            background: 'var(--vscode-editor-background)',
          }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
            <Text strong>同步目标</Text>
            <Space size={4}>
              <Tooltip title="刷新仓库状态">
                <Button size="small" icon={<SyncOutlined />} loading={repoLoading} onClick={refreshRepoInfo} />
              </Tooltip>
              <Tooltip title="打开 VS Code Git 面板">
                <Button size="small" icon={<FileSyncOutlined />} onClick={openSourceControl} />
              </Tooltip>
            </Space>
          </Space>

          <Space size={12} wrap style={{ width: '100%', marginBottom: 16 }}>
            {renderRepoCard('design')}
            {renderRepoCard('verification')}
          </Space>

          <Form layout="vertical" style={{ maxWidth: 840, margin: '0 auto' }}>
            <Form.Item label="设计树路径">
              <PathInput
                state={designTree}
                placeholder="请输入或选择设计树文件/目录"
                showOpen
                showSelectFolder
              />
            </Form.Item>

            <Form.Item label="归一化表格路径">
              <PathInput
                state={normTable}
                placeholder="请输入或选择归一化表格文件"
                showOpen
                showSelectFile
              />
            </Form.Item>

            <CollapsibleSection title="OBS 存储与公共数据">
              <Space size="small" wrap>
                <Button icon={<DatabaseOutlined />} onClick={() => setObsViewerOpen(true)}>
                  打开 OBS 查看器
                </Button>
                <Button icon={<CloudDownloadOutlined />}>下载公共数据</Button>
              </Space>
            </CollapsibleSection>
          </Form>

          <Divider style={{ margin: '18px 0 14px' }} />

          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Space size={6}>
              <BranchesOutlined />
              <Text type="secondary">
                当前同步到 {repoLabels[selectedRepo]} / {selectedInfo.branch || '未检测到分支'}
              </Text>
            </Space>
            <Space size="small" wrap>
              <Tooltip title={`更新${repoLabels[selectedRepo]}到远端最新版本`}>
                <Button icon={<CloudSyncOutlined />} onClick={() => runAction(selectedRepo, 'pull')}>
                  更新
                </Button>
              </Tooltip>
              <Badge dot={hasUnsaved} offset={[-4, 4]}>
                <Button icon={<SaveOutlined />} loading={saving} onClick={() => handleSave(collectFormData())}>
                  保存配置
                </Button>
              </Badge>
              <Button type="primary" icon={<SyncOutlined />} loading={syncing} onClick={openSyncModal}>
                同步到{repoShortLabels[selectedRepo]}
              </Button>
            </Space>
          </Space>
        </div>

        <ObsViewer open={obsViewerOpen} spaceName={obsSpaceName} onCancel={() => setObsViewerOpen(false)} />

        <Modal
          title={
            <Space>
              <ExclamationCircleOutlined style={{ color: '#faad14' }} />
              <span>确认同步到{repoLabels[selectedRepo]}</span>
            </Space>
          }
          open={syncModalOpen}
          onCancel={() => setSyncModalOpen(false)}
          confirmLoading={syncing}
          onOk={confirmSync}
          okText="确认同步并提交"
          cancelText="取消"
          width={620}
        >
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message="同步会把 Common 中的设计树和归一化表格复制到目标仓库根目录；如果已有同名文件，会被覆盖。"
            />
            <div>
              <Text strong>目标文件</Text>
              <div style={{ marginTop: 8 }}>
                {syncTargets.map((item) => (
                  <div key={item.name} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <Tag color="processing">{item.name}</Tag>
                    <Text ellipsis={{ tooltip: item.path }}>{item.path}</Text>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Text strong>提交说明</Text>
              <Input.TextArea
                value={commitMsg}
                onChange={(event) => setCommitMsg(event.target.value)}
                placeholder="留空则自动生成，例如 feat(dft-ide): sync common artifacts"
                rows={3}
                style={{ marginTop: 8 }}
              />
            </div>
            <Radio.Group value={pushAfterCommit} onChange={(event) => setPushAfterCommit(event.target.value)}>
              <Radio value={false}>只保存到本地提交</Radio>
              <Radio value={true}>提交后上传到远端</Radio>
            </Radio.Group>
          </Space>
        </Modal>

        <Modal
          title={branchModal.mode === 'checkout' ? '切换分支' : '新建分支'}
          open={branchModal.open}
          onCancel={() => setBranchModal((prev) => ({ ...prev, open: false }))}
          onOk={submitBranchAction}
          okText={branchModal.mode === 'checkout' ? '切换' : '创建并切换'}
          cancelText="取消"
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text type="secondary">{repoLabels[branchModal.repo]}</Text>
            <Input
              autoFocus
              value={branchModal.value}
              onChange={(event) => setBranchModal((prev) => ({ ...prev, value: event.target.value }))}
              placeholder={branchModal.mode === 'checkout' ? '请输入已有分支名' : '请输入新分支名'}
            />
          </Space>
        </Modal>
      </div>
    </Spin>
  );
};

export default CommonFlow;
