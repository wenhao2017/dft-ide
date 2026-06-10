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
  Row,
  Col,
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
  GitlabOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  SlidersOutlined,
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
  openGitlabHost,
  openFileInEditor,
  prepareCommonArtifactSync,
  applyCommonArtifactSync,
  openVsCodeDiff,
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

const activeRepoCardStyle: React.CSSProperties = {
  background:
    'color-mix(in srgb, var(--vscode-editor-background, #fff) 88%, var(--vscode-focusBorder, #1677ff))',
  color: 'var(--vscode-foreground)',
};

const inactiveRepoCardStyle: React.CSSProperties = {
  background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
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

  // Wizard state declarations for advanced common file synchronization
  const [wizardStep, setWizardStep] = useState<number>(0);
  const [selectedStrategy, setSelectedStrategy] = useState<'overwrite' | 'autoMerge' | 'manualMerge'>('manualMerge');
  const [diffItems, setDiffItems] = useState<any[]>([]);
  const [activeDiffId, setActiveDiffId] = useState<string | null>(null);
  const [filterFileType, setFilterFileType] = useState<'all' | 'designTree' | 'normTable'>('all');
  const [filterDiffType, setFilterDiffType] = useState<string>('all');
  const [filterSheet, setFilterSheet] = useState<string>('all');
  const [showValidationErrors, setShowValidationErrors] = useState<boolean>(false);
  const [precheckInfo, setPrecheckInfo] = useState<any>(null);
  const [syncReport, setSyncReport] = useState<any>(null);
  const [isApplying, setIsApplying] = useState<boolean>(false);

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

  const openGitlab = async (repo: RepoKey) => {
    const repoRoot = repoInfo[repo]?.repoRoot ?? '';
    const repoGitNames = repoRoot.split(/[\\/]/).filter(Boolean);
    const repoGitName = repoGitNames.length > 0 ? repoGitNames[repoGitNames.length - 1] : '';
    if (!repoGitName) {
      message.error('无法识别仓库名称');
      return;
    }

    const result = await openGitlabHost(repoGitName);
    if (!result.success) {
      message.error(result.error ?? '无法打开浏览器，请检查系统默认设置!');
    }
  };

  const repoMenu = (repo: RepoKey, group: number): MenuProps['items'] => [
    { key: 'pull', icon: <CloudSyncOutlined />, label: '更新到最新', onClick: () => runAction(repo, 'pull') },
    {
      key: 'push',
      icon: <UploadOutlined />,
      label: '上传本地提交',
      onClick: () => runAction(repo, 'push'),
      // disabled: !canManageMembers && group == 1,
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
    { key: 'openGitlab', icon: <GitlabOutlined />, label: '打开 Git 地址', onClick: () => openGitlab(repo) },
  ];

  const openConfirmModal = async () => {
    await handleSave(collectFormData());
    setCommitMsg('');
    setPushAfterCommit(false);
    
    const src = syncDirection === 'dataToTarget' ? selectedDataRepo : selectedRepo;
    const tgt = syncDirection === 'dataToTarget' ? selectedRepo : selectedDataRepo;
    const srcDesign = syncDirection === 'dataToTarget' ? dataDesignTree.value : targetDesignTree.value;
    const srcTable = syncDirection === 'dataToTarget' ? dataNormTable.value : targetNormTable.value;
    const tgtDesign = syncDirection === 'dataToTarget' ? targetDesignTree.value : dataDesignTree.value;
    const tgtTable = syncDirection === 'dataToTarget' ? targetNormTable.value : dataNormTable.value;

    try {
      const res = await prepareCommonArtifactSync({
        targetRepo: tgt,
        sourceDesignTree: srcDesign,
        sourceNormTable: srcTable,
        targetDesignTree: tgtDesign,
        targetNormTable: tgtTable,
        direction: syncDirection,
      });
      
      if (res.success) {
        setPrecheckInfo(res.precheck);
        const nextDiffItems = Array.isArray(res.diffItems) ? res.diffItems : [];
        setDiffItems(nextDiffItems);
        setActiveDiffId(nextDiffItems[0]?.id || null);
      } else {
        message.error(res.error || '预检查失败');
        return;
      }
    } catch (err: any) {
      message.error(err?.message || '预检查失败');
      return;
    }
    
    setWizardStep(0);
    setSelectedStrategy('manualMerge');
    setShowValidationErrors(false);
    setSyncReport(null);
    setConfirmModalOpen(true);
  };

  const handleDecisionChange = (id: string, decision: 'source' | 'target' | 'custom', customVal?: string) => {
    setDiffItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, decision, customVal: customVal !== undefined ? customVal : item.customVal }
          : item
      )
    );
  };

  const handleApplySync = async () => {
    if (selectedStrategy === 'manualMerge') {
      const unresolved = diffItems.filter((item) => !item.decision);
      if (unresolved.length > 0) {
        setShowValidationErrors(true);
        message.error(`存在 ${unresolved.length} 项未决策的差异，请先处理`);
        return;
      }
    }

    Modal.confirm({
      title: '确认执行同步',
      icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
      content: selectedStrategy === 'overwrite'
        ? '将把源 XLS/XLSX 文件复制到目标文件或目标目录。目标文件不会额外创建备份，请使用 Git 审查和回退。'
        : '将保留目标 XLS/XLSX 文件不变，只按合并策略写入隐藏 CSV 产物。请使用 Git 审查和提交变更。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setIsApplying(true);
        try {
          const srcDesign = syncDirection === 'dataToTarget' ? dataDesignTree.value : targetDesignTree.value;
          const srcTable = syncDirection === 'dataToTarget' ? dataNormTable.value : targetNormTable.value;
          const tgtDesign = syncDirection === 'dataToTarget' ? targetDesignTree.value : dataDesignTree.value;
          const tgtTable = syncDirection === 'dataToTarget' ? targetNormTable.value : dataNormTable.value;
          const tgt = syncDirection === 'dataToTarget' ? selectedRepo : selectedDataRepo;
          const decisions = selectedStrategy === 'manualMerge'
            ? diffItems.map((item) => ({
                id: item.id,
                choice: item.decision || 'target',
                customValue: item.customVal,
              }))
            : [];

          const res = await applyCommonArtifactSync({
            targetRepo: tgt,
            strategy: selectedStrategy,
            direction: syncDirection,
            sourceDesignTree: srcDesign,
            sourceNormTable: srcTable,
            targetDesignTree: tgtDesign,
            targetNormTable: tgtTable,
            decisions,
            stageAfterApply: false,
          });

          if (!res.success) {
            throw new Error(res.error || '同步应用失败');
          }

          setSyncReport(res.report);
          setWizardStep(2);
          message.success('同步已应用到目标路径');
          await refreshRepoInfo();
        } catch (err: any) {
          message.error(err?.message || '同步应用失败');
        } finally {
          setIsApplying(false);
        }
      }
    });
  };

  const filteredItems = useMemo(() => {
    return diffItems.filter((item) => {
      const matchFile = filterFileType === 'all' || item.fileType === filterFileType;
      const matchType = filterDiffType === 'all' || item.type === filterDiffType;
      const matchSheet = filterSheet === 'all' || item.sheetName === filterSheet;
      return matchFile && matchType && matchSheet;
    });
  }, [diffItems, filterFileType, filterDiffType, filterSheet]);

  const uniqueSheets = useMemo(() => {
    const sheets = new Set<string>();
    diffItems.forEach((item) => {
      if (item.sheetName) sheets.add(item.sheetName);
    });
    return Array.from(sheets);
  }, [diffItems]);

  const getDiffTypeTag = (type: string) => {
    switch (type) {
      case 'sourceAdded':
      case 'sheetAdded':
        return <Tag color="green">来源新增</Tag>;
      case 'targetRedundant':
      case 'sheetRedundant':
        return <Tag color="orange">目标独有</Tag>;
      case 'fieldDifferent':
        return <Tag color="blue">字段不同</Tag>;
      case 'fieldAnomaly':
        return <Tag color="red">字段异常</Tag>;
      default:
        return <Tag>{type}</Tag>;
    }
  };

  const setSelectedRepoByGroup = (repo: RepoKey, group: number) => {
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

  const renderRepoCard = (repo: RepoKey, group: number) => {
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
            ...(active ? activeRepoCardStyle : inactiveRepoCardStyle),
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
    <Card size="small" style={{ ...cardStyle, ...greenPanelStyle, marginBottom: 14 }} styles={{body: {padding: 16}}}>
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
            showSelectFolder={syncDirection === 'targetToData'}
            showOpen
          />
        </Form.Item>
        <Form.Item label="Data 归一化表格路径" style={{ marginBottom: 0 }}>
          <PathInput
            state={dataNormTable}
            pathSources={['local']}
            placeholder="请输入或选择 Data 仓中的归一化表格文件"
            showSelectFile
            showSelectFolder={syncDirection === 'targetToData'}
            showOpen
          />
        </Form.Item>
      </Form>
    </Card>
  );

  const renderTargetSection = (step: number) => (
    <Card size="small" style={{ ...cardStyle, ...warmPanelStyle, marginBottom: 14 }} styles={{body: {padding: 16}}}>
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
            showSelectFolder={syncDirection === 'dataToTarget'}
            showOpen
          />
        </Form.Item>
        <Form.Item label={`${targetName} 归一化表格路径`} style={{ marginBottom: 0 }}>
          <PathInput
            state={targetNormTable}
            pathSources={['local']}
            placeholder={`请输入或选择 ${targetName} 中的归一化表格文件`}
            showSelectFile
            showSelectFolder={syncDirection === 'dataToTarget'}
            showOpen
          />
        </Form.Item>
      </Form>
    </Card>
  );

  const renderStep0Precheck = () => {
    if (!precheckInfo) return <Spin />;
    const files = Array.isArray(precheckInfo.files) ? precheckInfo.files : [];
    const hasConflicts = diffItems.some((item) => item.type === 'fieldDifferent' || item.type === 'fieldAnomaly');

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="同步预检查完成"
          description="源路径必须是 XLS/XLSX 文件；目标路径可以是 XLS/XLSX 文件、目录或留空。留空时会复制到目标仓库根目录下的同名文件。"
        />

        <Card size="small" title="文件映射" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {files.map((file: any) => (
              <div
                key={file.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px minmax(0, 1fr)',
                  gap: 8,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
                }}
              >
                <Text strong>{file.label}</Text>
                <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
                  <Text ellipsis={{ tooltip: file.source }}><Text type="secondary">源文件：</Text>{file.source}</Text>
                  <Text ellipsis={{ tooltip: file.target }}><Text type="secondary">目标：</Text>{file.target}</Text>
                  {file.overwritten && <Tag color="orange">目标已存在</Tag>}
                </Space>
              </div>
            ))}
          </Space>
        </Card>

        <div>
          <Title level={5} style={{ margin: '0 0 10px 0' }}>请选择同步策略：</Title>
          <Radio.Group
            value={selectedStrategy}
            onChange={(event) => setSelectedStrategy(event.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Card
                size="small"
                hoverable
                onClick={() => setSelectedStrategy('manualMerge')}
                style={{
                  borderRadius: 8,
                  border: selectedStrategy === 'manualMerge' ? '1px solid var(--vscode-focusBorder)' : '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
                }}
              >
                <Radio value="manualMerge">
                  <Text strong>手动合并 (推荐)</Text>
                  <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginLeft: 24, marginTop: 4 }}>
                    逐项确认差异，按决策生成目标隐藏 CSV，不覆盖目标 XLS/XLSX 文件。
                  </div>
                </Radio>
              </Card>

              <Card
                size="small"
                hoverable
                onClick={() => setSelectedStrategy('autoMerge')}
                style={{
                  borderRadius: 8,
                  border: selectedStrategy === 'autoMerge' ? '1px solid var(--vscode-focusBorder)' : '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
                }}
              >
                <Radio value="autoMerge">
                  <Text strong>自动合并</Text>
                  {hasConflicts && <Tag color="orange" style={{ marginLeft: 8 }}>冲突字段保留目标值</Tag>}
                  <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginLeft: 24, marginTop: 4 }}>
                    自动引入来源新增项，保留目标独有项；字段冲突和异常字段按目标值保守处理。
                  </div>
                </Radio>
              </Card>

              <Card
                size="small"
                hoverable
                onClick={() => setSelectedStrategy('overwrite')}
                style={{
                  borderRadius: 8,
                  border: selectedStrategy === 'overwrite' ? '1px solid var(--vscode-focusBorder)' : '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
                }}
              >
                <Radio value="overwrite">
                  <Text strong>直接覆盖</Text>
                  <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginLeft: 24, marginTop: 4 }}>
                    直接用来源 XLS/XLSX 覆盖目标文件；不额外创建备份，请使用 Git 审查和回退。
                  </div>
                </Radio>
              </Card>
            </Space>
          </Radio.Group>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button onClick={() => setConfirmModalOpen(false)}>取消同步</Button>
          <Button
            type="primary"
            onClick={() => {
              setWizardStep(1);
            }}
          >
            下一步
          </Button>
        </div>
      </Space>
    );
  };

  const renderOverwriteConfirmation = () => {
    const files = Array.isArray(precheckInfo?.files) ? precheckInfo.files : [];

    return (
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="直接覆盖确认"
          description="执行后目标 XLS/XLSX 将由来源文件覆盖；不会额外创建备份目录。"
        />
        <Card size="small" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {files.map((file: any) => (
              <div key={file.label}>
                <Text strong>{file.label}</Text>
                <div><Text type="secondary">目标：</Text><code>{file.target}</code></div>
              </div>
            ))}
          </Space>
        </Card>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button onClick={() => setWizardStep(0)}>返回上一步</Button>
          <Button type="primary" danger loading={isApplying} onClick={handleApplySync}>确认直接覆盖</Button>
        </div>
      </Space>
    );
  };

  const renderAutoMergePreview = () => {
    const autoItems = diffItems.filter((item) =>
      item.type === 'sourceAdded' ||
      item.type === 'targetRedundant' ||
      item.type === 'sheetAdded' ||
      item.type === 'sheetRedundant'
    );

    return (
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Alert
          type="success"
          showIcon
          message="自动合并结果预览"
          description="来源新增会引入，目标独有会保留；字段冲突和异常字段会保留目标值。"
        />
        <Card size="small" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {autoItems.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Text ellipsis={{ tooltip: item.key }}>{item.key}</Text>
                {getDiffTypeTag(item.type)}
              </div>
            ))}
          </Space>
        </Card>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button onClick={() => setWizardStep(0)}>返回上一步</Button>
          <Button type="primary" loading={isApplying} onClick={handleApplySync}>应用自动合并结果</Button>
        </div>
      </Space>
    );
  };

  const renderManualMergeScreen = () => {
    const activeItem = diffItems.find((item) => item.id === activeDiffId);
    const unresolvedCount = diffItems.filter((item) => !item.decision).length;

    return (
      <Row gutter={16}>
        <Col span={9}>
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Radio.Group size="small" value={filterFileType} onChange={(event) => setFilterFileType(event.target.value)}>
                  <Radio.Button value="all">全部</Radio.Button>
                  <Radio.Button value="designTree">Design Tree</Radio.Button>
                  <Radio.Button value="normTable">归一化表</Radio.Button>
                </Radio.Group>
                <Radio.Group size="small" value={filterDiffType} onChange={(event) => setFilterDiffType(event.target.value)}>
                  <Radio.Button value="all">全部</Radio.Button>
                  <Radio.Button value="fieldDifferent">不同</Radio.Button>
                  <Radio.Button value="fieldAnomaly">异常</Radio.Button>
                  <Radio.Button value="sourceAdded">新增</Radio.Button>
                  <Radio.Button value="targetRedundant">目标独有</Radio.Button>
                </Radio.Group>
                {uniqueSheets.length > 0 && (
                  <Radio.Group size="small" value={filterSheet} onChange={(event) => setFilterSheet(event.target.value)}>
                    <Radio.Button value="all">全部 Sheet</Radio.Button>
                    {uniqueSheets.map((sheet) => (
                      <Radio.Button key={sheet} value={sheet}>{sheet.length > 12 ? `${sheet.slice(0, 10)}...` : sheet}</Radio.Button>
                    ))}
                  </Radio.Group>
                )}
              </Space>
            </Card>

            {showValidationErrors && unresolvedCount > 0 && (
              <Alert type="error" showIcon message={`尚有 ${unresolvedCount} 项差异未决定，请在列表中处理。`} />
            )}

            <div style={{ height: 380, overflowY: 'auto', border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))', borderRadius: 8, padding: 6 }}>
              {filteredItems.map((item) => {
                const isSelected = item.id === activeDiffId;
                const hasDecision = item.decision !== undefined;
                const showErr = showValidationErrors && !hasDecision;

                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveDiffId(item.id)}
                    style={{
                      padding: '10px 12px',
                      marginBottom: 6,
                      borderRadius: 6,
                      border: isSelected ? '1px solid var(--vscode-focusBorder)' : showErr ? '1px solid var(--vscode-errorForeground, #ff4d4f)' : '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
                      background: isSelected ? 'color-mix(in srgb, var(--vscode-editor-background, #fff) 90%, var(--vscode-focusBorder, #1677ff))' : 'var(--vscode-editor-background)',
                      cursor: 'pointer',
                    }}
                  >
                    <Space size={6} style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space size={6}>
                        {hasDecision ? <CheckCircleOutlined style={{ color: '#389e0d' }} /> : <WarningOutlined style={{ color: showErr ? '#ff4d4f' : '#faad14' }} />}
                        <Text style={{ fontSize: 12, fontWeight: 600 }} ellipsis={{ tooltip: item.key }}>
                          {String(item.key).includes('::') ? String(item.key).split('::')[1] : String(item.key).split(/[\\/]/).pop()}
                        </Text>
                      </Space>
                      {getDiffTypeTag(item.type)}
                    </Space>
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
                      Sheet: {item.sheetName}{item.fieldName ? ` / 字段: ${item.fieldName}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </Space>
        </Col>

        <Col span={15}>
          {activeItem ? (
            <Card size="small" title="差异业务对比与决策" style={{ borderRadius: 8, height: '100%' }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div><Text type="secondary">业务 Key：</Text><code>{activeItem.key}</code></div>
                {activeItem.fieldName && <div><Text type="secondary">变更字段：</Text><Tag color="orange">{activeItem.fieldName}</Tag></div>}
                <Row gutter={12}>
                  <Col span={12}>
                    <Card size="small" title="来源值" style={{ height: 130, overflowY: 'auto' }}>
                      <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{activeItem.sourceVal || '(空/不存在)'}</Text>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" title="目标值" style={{ height: 130, overflowY: 'auto' }}>
                      <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{activeItem.targetVal || '(空/不存在)'}</Text>
                    </Card>
                  </Col>
                </Row>

                <Card size="small" title="合并决策选择" style={{ borderRadius: 6 }}>
                  {activeItem.type === 'sourceAdded' || activeItem.type === 'sheetAdded' ? (
                    <Radio.Group value={activeItem.decision} onChange={(event) => handleDecisionChange(activeItem.id, event.target.value)}>
                      <Space direction="vertical">
                        <Radio value="source">引入：将该项引入到目标仓</Radio>
                        <Radio value="target">不引入：舍弃该项</Radio>
                      </Space>
                    </Radio.Group>
                  ) : activeItem.type === 'targetRedundant' || activeItem.type === 'sheetRedundant' ? (
                    <Radio.Group value={activeItem.decision} onChange={(event) => handleDecisionChange(activeItem.id, event.target.value)}>
                      <Space direction="vertical">
                        <Radio value="target">保留：保留目标仓中多余的项</Radio>
                        <Radio value="source">删除：在目标仓中移除该项</Radio>
                      </Space>
                    </Radio.Group>
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Radio.Group value={activeItem.decision} onChange={(event) => handleDecisionChange(activeItem.id, event.target.value)}>
                        <Space direction="vertical">
                          <Radio value="source">使用来源值</Radio>
                          <Radio value="target">使用目标值</Radio>
                          <Radio value="custom">手动输入自定义值</Radio>
                        </Space>
                      </Radio.Group>
                      {activeItem.decision === 'custom' && (
                        <Input.TextArea
                          rows={2}
                          value={activeItem.customVal || ''}
                          onChange={(event) => handleDecisionChange(activeItem.id, 'custom', event.target.value)}
                          placeholder="请输入自定义值..."
                        />
                      )}
                    </Space>
                  )}
                </Card>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <Button onClick={() => setWizardStep(0)}>返回上一步</Button>
                  <Button type="primary" loading={isApplying} onClick={handleApplySync}>确认应用合并决策</Button>
                </div>
              </Space>
            </Card>
          ) : (
            <Alert type="info" showIcon message="请选择左侧差异项" />
          )}
        </Col>
      </Row>
    );
  };

  const renderStep2Report = () => {
    if (!syncReport) return <Spin />;
    const changedFiles = Array.isArray(syncReport.changedXls) ? syncReport.changedXls : [];
    const generatedCsv = Array.isArray(syncReport.generatedCsv) ? syncReport.generatedCsv : [];

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="success"
          showIcon
          message="公共表格同步完成"
          description="真实 XLS/XLSX 文件已经复制到目标路径；本次操作没有生成 demo 差异、CSV 或占位文件。"
        />

        <Card size="small" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={8} style={{ width: '100%', fontSize: 13 }}>
            <div><Text type="secondary">同步方式：</Text> <Tag color="blue">{syncReport.strategy}</Tag></div>
            <div>
              <Text type="secondary">已更新的 Excel 文件：</Text>
              <ul style={{ margin: '4px 0 4px 16px', padding: 0 }}>
                {changedFiles.map((file: string) => <li key={file}><code>{file}</code></li>)}
              </ul>
            </div>
            {generatedCsv.length > 0 && (
              <div>
                <Text type="secondary">已写入的隐藏 CSV 文件：</Text>
                <ul style={{ margin: '4px 0 4px 16px', padding: 0 }}>
                  {generatedCsv.map((file: string) => <li key={file}><code>{file}</code></li>)}
                </ul>
              </div>
            )}
            <div><Text type="secondary">合并前冲突数：</Text> <Badge count={syncReport.unresolvedCount ?? 0} style={{ backgroundColor: '#faad14' }} /></div>
            <div><Text type="secondary">执行结果：</Text> {syncReport.result}</div>
          </Space>
        </Card>

        <div style={{ 
          background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))', 
          padding: '12px 14px', 
          borderRadius: 8, 
          border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <Text strong>后续步骤</Text>
            <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginTop: 4 }}>
              系统未自动提交本次文件变更。请在 VS Code Git 面板中审查、暂存并提交。
            </div>
          </div>
          <Button icon={<FileSyncOutlined />} type="primary" onClick={() => {
            openSourceControl();
            setConfirmModalOpen(false);
          }}>
            打开 Git 面板
          </Button>
        </div>
      </Space>
    );
  };

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

        <Card size="small" style={{ ...cardStyle, ...accentPanelStyle, marginBottom: 14 }} styles={{body: {padding: 18}}}>
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

        <Card size="small" style={{ ...cardStyle, border: '1px solid rgba(22,119,255,0.35)' }} styles={{body: {padding: 16}}}>
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
                // disabled={syncDirection === 'targetToData' && !canManageMembers }
              >
                {primaryButtonText}
              </Button>
            </Space>
          </Space>
        </Card>

        <ObsViewer open={obsViewerOpen} spaceName={obsSpaceName} onCancel={() => setObsViewerOpen(false)} />

        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '90%' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>
                <SyncOutlined spin={isApplying} style={{ marginRight: 8, color: '#1677ff' }} />
                同步 / 合并公共表格
              </span>
            </div>
          }
          open={confirmModalOpen}
          onCancel={() => {
            if (!isApplying) {
              setConfirmModalOpen(false);
            }
          }}
          footer={null}
          width={wizardStep === 1 && selectedStrategy === 'manualMerge' ? 1150 : 750}
          style={{ top: 40 }}
          destroyOnClose
        >
          <div style={{ marginTop: 12, marginBottom: 20 }}>
            {/* Steps bar */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              borderBottom: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
              paddingBottom: 12,
              marginBottom: 16
            }}>
              <Space size="large">
                <span style={{ 
                  fontWeight: wizardStep === 0 ? 'bold' : 'normal', 
                  color: wizardStep === 0 ? 'var(--vscode-focusBorder)' : 'var(--vscode-descriptionForeground)'
                }}>
                  1. 预检查与策略选择
                </span>
                <Text type="secondary">/</Text>
                <span style={{ 
                  fontWeight: wizardStep === 1 ? 'bold' : 'normal', 
                  color: wizardStep === 1 ? 'var(--vscode-focusBorder)' : 'var(--vscode-descriptionForeground)'
                }}>
                  2. 差异确认
                </span>
                <Text type="secondary">/</Text>
                <span style={{ 
                  fontWeight: wizardStep === 2 ? 'bold' : 'normal', 
                  color: wizardStep === 2 ? 'var(--vscode-focusBorder)' : 'var(--vscode-descriptionForeground)'
                }}>
                  3. 同步合并报告
                </span>
              </Space>
            </div>

            {/* Modal Body content based on step */}
            {wizardStep === 0 && renderStep0Precheck()}

            {wizardStep === 1 && (
              selectedStrategy === 'overwrite'
                ? renderOverwriteConfirmation()
                : selectedStrategy === 'autoMerge'
                  ? renderAutoMergePreview()
                  : renderManualMergeScreen()
            )}

            {wizardStep === 2 && renderStep2Report()}

          </div>
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
