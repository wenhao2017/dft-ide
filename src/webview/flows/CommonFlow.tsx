import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
  Radio,
} from 'antd';
import '@ant-design/v5-patch-for-react-19';
import type { MenuProps } from 'antd';
import {
  BranchesOutlined,
  CloudSyncOutlined,
  ArrowRightOutlined,
  FileSyncOutlined,
  PullRequestOutlined,
  SaveOutlined,
  SwapOutlined,
  SyncOutlined,
  UploadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../hooks/useVscodePath';
import { useFlowConfig } from '../hooks/useFlowConfig';
import PathInput from '../components/shared/PathInput';
import useWizardStore from '../store/wizardStore';
import ObsViewer from '../components/shared/ObsViewer';
import {
  getProjectRepoGitInfo,
  openSourceControl,
  runRepoGitAction,
  syncCommonArtifacts,
  RepoGitInfo,
  RepoKey,
} from '../utils/ipc';

const { Text, Title, Paragraph } = Typography;

type SyncDirection = 'dataToTarget' | 'targetToData';

const repoLabels: Record<RepoKey, string> = {
  hibist: 'Hibist 仓库',
  sailor: 'Sailor 仓库',
  data: 'Data 公共仓',
  verification: '验证仓库',
};

const repoShortLabels: Record<RepoKey, string> = {
  hibist: 'Hibist',
  sailor: 'Sailor',
  data: 'Data',
  verification: '验证仓',
};

const pageStyle: React.CSSProperties = {
  padding: 4,
  color: 'var(--vscode-foreground)',
};

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
  background: 'var(--vscode-editor-background)',
};

const mutedTextStyle: React.CSSProperties = {
  color: 'var(--vscode-descriptionForeground)',
};

const accentPanelStyle: React.CSSProperties = {
  border: '1px solid var(--vscode-focusBorder, rgba(22,119,255,0.45))',
  background:
    'linear-gradient(135deg, rgba(22,119,255,0.18), rgba(82,196,26,0.08)), var(--vscode-editor-background)',
};

const warmPanelStyle: React.CSSProperties = {
  border: '1px solid rgba(250, 173, 20, 0.38)',
  background:
    'linear-gradient(135deg, rgba(250,173,20,0.16), rgba(22,119,255,0.06)), var(--vscode-editor-background)',
};

const greenPanelStyle: React.CSSProperties = {
  border: '1px solid rgba(82, 196, 26, 0.34)',
  background:
    'linear-gradient(135deg, rgba(82,196,26,0.14), rgba(22,119,255,0.05)), var(--vscode-editor-background)',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  marginBottom: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const stepBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: '50%',
  fontSize: 12,
  fontWeight: 600,
  background: 'var(--vscode-badge-background, rgba(22, 119, 255, 0.16))',
  color: 'var(--vscode-badge-foreground, #ffffff)',
};

const directionNodeStyle: React.CSSProperties = {
  flex: '1 1 220px',
  minWidth: 220,
  borderRadius: 12,
  border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
  background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
  padding: '12px 14px',
};

const directionArrowStyle: React.CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--vscode-focusBorder, rgba(22,119,255,0.45))',
  background: 'linear-gradient(135deg, rgba(22,119,255,0.95), rgba(82,196,26,0.85))',
  color: '#ffffff',
  boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
  fontSize: 20,
};

const swapButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(250, 173, 20, 0.55)',
  background: 'linear-gradient(135deg, rgba(250,173,20,0.95), rgba(250,140,22,0.9))',
  color: '#1f1f1f',
  fontWeight: 600,
};

const sourceTagStyle: React.CSSProperties = {
  border: '1px solid rgba(22,119,255,0.45)',
  background: 'rgba(22,119,255,0.16)',
  color: 'var(--vscode-foreground)',
};

const targetTagStyle: React.CSSProperties = {
  border: '1px solid rgba(82,196,26,0.45)',
  background: 'rgba(82,196,26,0.16)',
  color: 'var(--vscode-foreground)',
};

const CommonFlow: React.FC = () => {
  const dataDesignTree = useVscodePath();
  const dataNormTable = useVscodePath();
  const targetDesignTree = useVscodePath();
  const targetNormTable = useVscodePath();

  const [syncDirection, setSyncDirection] = useState<SyncDirection>('dataToTarget');
  const [selectedDataRepo, setSelectedDataRepo] = useState<RepoKey>('data');
  const [selectedRepo, setSelectedRepo] = useState<RepoKey>('hibist');
  const [repoInfo, setRepoInfo] = useState<Record<RepoKey, RepoGitInfo>>({
    data: { repo: 'data' },
    hibist: { repo: 'hibist' },
    sailor: { repo: 'sailor' },
    verification: { repo: 'verification' },
  });
  const [repoLoading, setRepoLoading] = useState(false);
  const [obsViewerOpen, setObsViewerOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [branchModal, setBranchModal] = useState<{
    open: boolean;
    repo: RepoKey;
    mode: 'checkout' | 'createBranch';
    value: string;
  }>({ open: false, repo: 'hibist', mode: 'checkout', value: '' });

  const activeProject = useWizardStore((s) => s.activeProject);
  const { savedData, loading, saving, uploading, syncing, hasUnsaved, handleSave, debouncedSave, markDirty } =
    useFlowConfig('common');

  const selectedDataInfo = repoInfo[selectedDataRepo];
  const selectedTargetInfo = repoInfo[selectedRepo];
  const targetName = repoShortLabels[selectedRepo];

  const sourceRepo = syncDirection === 'dataToTarget' ? selectedDataRepo : selectedRepo;
  const targetRepo = syncDirection === 'dataToTarget' ? selectedRepo : selectedDataRepo;
  const sourceLabel = syncDirection === 'dataToTarget' ? repoLabels[selectedDataRepo] : repoLabels[selectedRepo];
  const targetLabel = syncDirection === 'dataToTarget' ? repoLabels[selectedRepo] : repoLabels[selectedDataRepo];
  const sourceInfo = repoInfo[sourceRepo];
  const targetInfo = repoInfo[targetRepo];
  const primaryButtonText = syncDirection === 'dataToTarget' ? `同步到${targetName}` : '同步到 Data';
  const confirmTitle = syncDirection === 'dataToTarget' ? `确认同步到${repoLabels[selectedRepo]}` : '确认回写到 Data 公共仓';
  const confirmOkText = syncDirection === 'dataToTarget' ? '确认' : '确认';
  const confirmLoading = syncDirection === 'dataToTarget' ? syncing : uploading;

  const collectFormData = () => {
    let formData: Record<string, unknown> = {};
    if (savedData) {
      formData = { ...savedData };
    }
    formData[selectedDataRepo] = {
      designTree: dataDesignTree.value,
      normTable: dataNormTable.value,
    };
    formData[selectedRepo] = {
      designTree: targetDesignTree.value,
      normTable: targetNormTable.value,
    };
    return formData;
  };

  const savedFormData = useMemo((): Record<string, unknown> | null => {
    let formData: Record<string, unknown> = {
      dataDesignTree: '',
      dataNormTable: '',
      targetDesignTree: '',
      targetNormTable: '',
    };

    if (savedData?.[selectedDataRepo]) {
      const repoForm = savedData[selectedDataRepo] as Record<string, unknown>;
      formData.dataDesignTree = repoForm.designTree;
      formData.dataNormTable = repoForm.normTable;
    } else {
      // 兼容旧字段：如果之前只保存了 designTree / normTable，则默认放到 Data 路径。
      if (savedData?.designTree) formData.dataDesignTree = savedData.designTree;
      if (savedData?.normTable) formData.dataNormTable = savedData.normTable;
    }
    if (savedData?.[selectedRepo]) {
      const repoForm = savedData[selectedRepo] as Record<string, unknown>;
      formData.targetDesignTree = repoForm.designTree;
      formData.targetNormTable = repoForm.normTable;
    }

    return formData;
  }, [savedData, selectedDataRepo, selectedRepo]);

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
    dataDesignTree.setValue(String(savedFormData?.dataDesignTree));
    dataNormTable.setValue(String(savedFormData?.dataNormTable));
    targetDesignTree.setValue(String(savedFormData?.targetDesignTree));
    targetNormTable.setValue(String(savedFormData?.targetNormTable));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedFormData]);

  useEffect(() => {
    const currentData = collectFormData();
    const dataRepoForm = currentData[selectedDataRepo] as Record<string, unknown>;
    const targetRepoForm = currentData[selectedRepo] as Record<string, unknown>;
    const hasChange =
      dataRepoForm.designTree !== (savedFormData?.dataDesignTree ?? '') ||
      dataRepoForm.normTable !== (savedFormData?.dataNormTable ?? '') ||
      targetRepoForm.designTree !== (savedFormData?.targetDesignTree ?? '') ||
      targetRepoForm.normTable !== (savedFormData?.targetNormTable ?? '');

    if (hasChange) {
      markDirty();
      debouncedSave(currentData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataDesignTree.value, dataNormTable.value, targetDesignTree.value, targetNormTable.value]);

  const previewTargets = useMemo(() => {
    if (syncDirection === 'dataToTarget') {
      return [
        {
          name: 'Design Tree',
          from: dataDesignTree.value || `${repoLabels[selectedDataRepo]}\\design_tree.mock.json`,
          to: targetDesignTree.value || `${selectedTargetInfo.repoRoot ?? repoLabels[selectedRepo]}\\design_tree.mock.json`,
        },
        {
          name: '归一化表格',
          from: dataNormTable.value || `${repoLabels[selectedDataRepo]}\\normalized-table.md`,
          to: targetNormTable.value || `${selectedTargetInfo.repoRoot ?? repoLabels[selectedRepo]}\\normalized-table.md`,
        },
      ];
    }

    return [
      {
        name: 'Design Tree',
        from: targetDesignTree.value || `${selectedTargetInfo.repoRoot ?? repoLabels[selectedRepo]}\\design_tree.mock.json`,
        to: dataDesignTree.value || `${repoLabels[selectedDataRepo]}\\design_tree.mock.json`,
      },
      {
        name: '归一化表格',
        from: targetNormTable.value || `${selectedTargetInfo.repoRoot ?? repoLabels[selectedRepo]}\\normalized-table.md`,
        to: dataNormTable.value || `${repoLabels[selectedDataRepo]}\\normalized-table.md`,
      },
    ];
  }, [
    dataDesignTree.value,
    dataNormTable.value,
    selectedDataRepo,
    selectedRepo,
    selectedTargetInfo.repoRoot,
    syncDirection,
    targetDesignTree.value,
    targetNormTable.value,
  ]);

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

  const canManageMembers = activeProject
    ? activeProject.id !== '0' && (activeProject.canManageMembers ?? activeProject.role?.toUpperCase() === 'DFTM')
    : false;

  const repoMenu = (repo: RepoKey, group: Number): MenuProps['items'] => [
    { key: 'pull', icon: <CloudSyncOutlined />, label: '更新到最新', onClick: () => runAction(repo, 'pull') },
    {
      key: 'push',
      icon: <UploadOutlined />,
      label: '上传本地提交',
      onClick: () => runAction(repo, 'push'),
      disabled: !canManageMembers && group == 1,
    },
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

  const openConfirmModal = async () => {
    await handleSave(collectFormData());
    setCommitMsg('');
    setPushAfterCommit(false);
    setConfirmModalOpen(true);
  };

  const confirmSyncByDirection = async () => {
    // 界面已拆成四个路径，但当前 syncCommonArtifacts 仍沿用原始参数。
    // 正向：Data 路径作为输入；反向：目标仓路径作为输入。
    const result = await syncCommonArtifacts({
      targetRepo: selectedRepo,
      designTree: syncDirection === 'dataToTarget' ? dataDesignTree.value : targetDesignTree.value,
      normTable: syncDirection === 'dataToTarget' ? dataNormTable.value : targetNormTable.value,
      message: commitMsg.trim() || undefined,
      push: pushAfterCommit,
    });

    if (result.success) {
      message.success(syncDirection === 'dataToTarget' ? `已同步到${repoLabels[selectedRepo]}` : '已回写到 Data 公共仓');
      setConfirmModalOpen(false);
      // 更新目标仓的配置
      let formData = collectFormData();
      formData[selectedRepo] = {
        designTree: previewTargets[0]["to"],
        normTable: previewTargets[1]["to"],
      };
      await handleSave(formData);
      await refreshRepoInfo();
      return;
    }

    message.error(result.error ?? '同步失败');
  };

  const setSelectedRepoByGroup = (repo: RepoKey, group: Number) => {
    if (group == 1) {
      setSelectedDataRepo(repo);
    } else {
      setSelectedRepo(repo);
    }
  };

  const toggleDirection = () => {
    setSyncDirection((prev) => (prev === 'dataToTarget' ? 'targetToData' : 'dataToTarget'));
  };

  const renderStepTitle = (step: number, title: string, description?: string) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={stepBadgeStyle}>{step}</span>
      <div>
        <Text strong style={{ fontSize: 15 }}>{title}</Text>
        {description && (
          <div style={{ marginTop: 2 }}>
            <Text style={{ ...mutedTextStyle, fontSize: 12 }}>{description}</Text>
          </div>
        )}
      </div>
    </div>
  );

  const renderRepoCard = (repo: RepoKey, group: Number) => {
    const info = repoInfo[repo];
    const active = group == 1 ? selectedDataRepo === repo : selectedRepo === repo;
    const hasError = Boolean(info?.error);

    return (
      <Dropdown trigger={['contextMenu']} menu={{ items: repoMenu(repo, group) }}>
        <button
          type="button"
          onClick={() => setSelectedRepoByGroup(repo, group)}
          style={{
            flex: '1 1 230px',
            minWidth: 220,
            textAlign: 'left',
            border: `1px solid ${active ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border, rgba(127,127,127,0.24))'}`,
            borderLeft: active ? '4px solid var(--vscode-focusBorder)' : '4px solid transparent',
            borderRadius: 10,
            padding: '12px 14px',
            background: active
              ? 'var(--vscode-list-activeSelectionBackground, var(--vscode-list-focusBackground, rgba(127,127,127,0.16)))'
              : 'var(--vscode-editor-background)',
            color: active ? 'var(--vscode-list-activeSelectionForeground, var(--vscode-foreground))' : 'var(--vscode-foreground)',
            cursor: 'pointer',
          }}
        >
          <Space direction="vertical" size={7} style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong>{repoLabels[repo]}</Text>
              {hasError ? (
                <Tag color="red">异常</Tag>
              ) : (
                <Tag color={info?.hasChanges ? 'orange' : 'green'}>{info?.hasChanges ? `${info.changedCount ?? 0} 个变更` : '干净'}</Tag>
              )}
            </Space>

            <Space size={6}>
              <BranchesOutlined />
              <Text ellipsis={{ tooltip: info?.branch || info?.error }}>
                {info?.branch || info?.error || '未检测到分支'}
              </Text>
            </Space>

            <Text ellipsis={{ tooltip: info?.repoRoot }} style={{ ...mutedTextStyle, fontSize: 12 }}>
              {info?.upstream ? `跟踪 ${info.upstream}` : info?.repoRoot ?? '等待仓库信息'}
            </Text>
          </Space>
        </button>
      </Dropdown>
    );
  };

  const renderDirectionNode = (title: string, info?: RepoGitInfo) => (
    <div style={directionNodeStyle}>
      <Space direction="vertical" size={5} style={{ width: '100%' }}>
        <Text strong>{title}</Text>
        <Space size={6}>
          <BranchesOutlined />
          <Text ellipsis={{ tooltip: info?.branch || info?.error }}>{info?.branch || info?.error || '未检测到分支'}</Text>
        </Space>
        <Text ellipsis={{ tooltip: info?.repoRoot }} style={{ ...mutedTextStyle, fontSize: 12 }}>
          {info?.repoRoot ?? '等待仓库信息'}
        </Text>
      </Space>
    </div>
  );

  const renderDataSection = (step: number) => (
    <Card size="small" style={{ ...cardStyle, ...greenPanelStyle, marginBottom: 14 }} bodyStyle={{ padding: 16 }}>
      <div style={sectionHeaderStyle}>
        {renderStepTitle(step, 'Data 公共仓', '公共输入文件的集中维护位置')}
        <Space size="small" wrap>
          <Button size="small" icon={<CloudSyncOutlined />} loading={repoLoading} onClick={() => runAction('data', 'pull')}>
            更新 Data 仓
          </Button>
          <Button size="small" icon={<FileSyncOutlined />} onClick={openSourceControl}>
            打开 Git 面板
          </Button>
        </Space>
      </div>

      <Space size={12} wrap style={{ width: '100%', marginBottom: 16 }}>
        {renderRepoCard('data', 1)}
      </Space>

      <Form layout="vertical" style={{ maxWidth: 920 }}>
        <Form.Item label="Data Design Tree 路径">
          <PathInput
            state={dataDesignTree}
            pathSources={['local']}
            placeholder="请输入或选择 Data 仓中的 Design Tree 文件/目录"
            showSelectFile
            showOpen
          />
        </Form.Item>
        <Form.Item label="Data 归一化表格路径" style={{ marginBottom: 0 }}>
          <PathInput
            state={dataNormTable}
            pathSources={['local']}
            placeholder="请输入或选择 Data 仓中的归一化表格文件"
            showSelectFile
            showOpen
          />
        </Form.Item>
      </Form>
    </Card>
  );

  const renderTargetSection = (step: number) => (
    <Card size="small" style={{ ...cardStyle, ...warmPanelStyle, marginBottom: 14 }} bodyStyle={{ padding: 16 }}>
      <div style={sectionHeaderStyle}>
        {renderStepTitle(step, '目标流程仓', '选择 Hibist / Sailor / 验证仓，并配置接收文件路径')}
        <Space size="small" wrap>
          <Tooltip title={`更新${repoLabels[selectedRepo]}到远端最新版本`}>
            <Button size="small" icon={<CloudSyncOutlined />} onClick={() => runAction(selectedRepo, 'pull')}>
              更新目标仓
            </Button>
          </Tooltip>
          <Button size="small" icon={<FileSyncOutlined />} onClick={openSourceControl}>
            打开 Git 面板
          </Button>
        </Space>
      </div>

      <Space size={12} wrap style={{ width: '100%', marginBottom: 16 }}>
        {renderRepoCard('hibist', 2)}
        {renderRepoCard('sailor', 2)}
        {renderRepoCard('verification', 2)}
      </Space>

      <Form layout="vertical" style={{ maxWidth: 920 }}>
        <Form.Item label={`${targetName} Design Tree 路径`}>
          <PathInput
            state={targetDesignTree}
            pathSources={['local']}
            placeholder={`请输入或选择 ${targetName} 中的 Design Tree 文件/目录`}
            showSelectFile
            showOpen
          />
        </Form.Item>
        <Form.Item label={`${targetName} 归一化表格路径`} style={{ marginBottom: 0 }}>
          <PathInput
            state={targetNormTable}
            pathSources={['local']}
            placeholder={`请输入或选择 ${targetName} 中的归一化表格文件`}
            showSelectFile
            showOpen
          />
        </Form.Item>
      </Form>
    </Card>
  );

  const obsSpaceName = activeProject?.name ?? 'dft-ide-workspace';

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <div style={pageStyle}>

        {hasUnsaved && (
          <Alert
            showIcon
            type="warning"
            message="路径配置有本地改动，同步前会先保存 Common 配置。"
            style={{ marginBottom: 14, borderRadius: 10 }}
          />
        )}

        <Card size="small" style={{ ...cardStyle, ...accentPanelStyle, marginBottom: 14 }} bodyStyle={{ padding: 18 }}>
          <div style={sectionHeaderStyle}>
            <div>
              <Space size={8} wrap>
                <Tag style={sourceTagStyle}>SOURCE</Tag>
                <Text strong>{sourceLabel}</Text>
                <Text style={{ ...mutedTextStyle, fontWeight: 700 }}>→</Text>
                <Tag style={targetTagStyle}>TARGET</Tag>
                <Text strong>{targetLabel}</Text>
              </Space>
              <div style={{ marginTop: 7 }}>
                <Text style={{ ...mutedTextStyle, fontSize: 12 }}>切换方向后，下方源/目标区域和底部同步按钮会同步调转。</Text>
              </div>
            </div>
            <Button size="middle" icon={<SwapOutlined />} onClick={toggleDirection} style={swapButtonStyle}>
              切换方向
            </Button>
          </div>

          <Space align="center" size={12} wrap style={{ width: '100%' }}>
            {renderDirectionNode(sourceLabel, sourceInfo)}
            <div style={directionArrowStyle}>
              <ArrowRightOutlined />
            </div>
            {renderDirectionNode(targetLabel, targetInfo)}
          </Space>
        </Card>

        {syncDirection === 'dataToTarget' ? (
          <>
            {renderDataSection(1)}
            {renderTargetSection(2)}
          </>
        ) : (
          <>
            {renderTargetSection(1)}
            {renderDataSection(2)}
          </>
        )}

        <Card size="small" style={{ ...cardStyle, border: '1px solid rgba(22,119,255,0.35)' }} bodyStyle={{ padding: 16 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Space direction="vertical" size={2}>
              <Space size={6}>
                <BranchesOutlined />
                <Text strong>同步操作</Text>
              </Space>
              <Text style={mutedTextStyle}>
                当前方向：{sourceLabel} → {targetLabel}
              </Text>
            </Space>

            <Space size="small" wrap>
              <Badge dot={hasUnsaved} offset={[-4, 4]}>
                <Button icon={<SaveOutlined />} loading={saving} onClick={() => handleSave(collectFormData())}>
                  保存路径配置
                </Button>
              </Badge>
              <Button
                type="primary"
                icon={<SyncOutlined />}
                loading={confirmLoading}
                onClick={openConfirmModal}
                style={{
                  fontWeight: 700,
                  boxShadow: '0 6px 16px rgba(22,119,255,0.24)',
                }}
                disabled={syncDirection === 'targetToData' && !canManageMembers }
              >
                {primaryButtonText}
              </Button>
            </Space>
          </Space>
        </Card>

        <ObsViewer open={obsViewerOpen} spaceName={obsSpaceName} onCancel={() => setObsViewerOpen(false)} />

        <Modal
          title={
            <Space>
              <ExclamationCircleOutlined style={{ color: '#faad14' }} />
              <span>{confirmTitle}</span>
            </Space>
          }
          open={confirmModalOpen}
          onCancel={() => setConfirmModalOpen(false)}
          confirmLoading={confirmLoading}
          onOk={confirmSyncByDirection}
          okText={confirmOkText}
          cancelText="取消"
          width={700}
        >
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message={`本次操作方向为：${sourceLabel} → ${targetLabel}。如果目标位置已有同名文件，可能会被覆盖。`}
            />

            <div>
              <Text strong>文件映射预览</Text>
              <div style={{ marginTop: 8 }}>
                {previewTargets.map((item) => (
                  <div
                    key={item.name}
                    style={{
                      border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                      background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
                    }}
                  >
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Tag color="processing" style={{ width: 'fit-content' }}>
                        {item.name}
                      </Tag>
                      <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: item.from }}>
                        From: {item.from}
                      </Text>
                      <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: item.to }}>
                        To: {item.to}
                      </Text>
                    </Space>
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
            <Text style={mutedTextStyle}>{repoLabels[branchModal.repo]}</Text>
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
