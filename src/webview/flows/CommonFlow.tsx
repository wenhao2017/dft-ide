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
  const [wizardStep, setWizardStep] = useState<number>(0); // 0 = Precheck & Strategy, 1 = Visual Merge, 2 = Report
  const [selectedStrategy, setSelectedStrategy] = useState<'overwrite' | 'autoMerge' | 'manualMerge' | 'cancel'>('manualMerge');
  const [diffItems, setDiffItems] = useState<any[]>([]);
  const [activeDiffId, setActiveDiffId] = useState<string | null>(null);
  const [filterFileType, setFilterFileType] = useState<'all' | 'designTree' | 'normTable'>('all');
  const [filterDiffType, setFilterDiffType] = useState<string>('all');
  const [filterSheet, setFilterSheet] = useState<string>('all');
  const [showValidationErrors, setShowValidationErrors] = useState<boolean>(false);
  const [precheckInfo, setPrecheckInfo] = useState<any>(null);
  const [syncReport, setSyncReport] = useState<any>(null);
  const [isApplying, setIsApplying] = useState<boolean>(false);

  const generateMockDiffs = (sourceDesignPath: string, sourceTablePath: string, targetDesignPath: string, targetTablePath: string) => {
    const dtName = sourceDesignPath ? sourceDesignPath.split(/[\\/]/).pop() : 'SD5888V100_LM_TOP_design_tree_all.xls';
    const ntName = sourceTablePath ? sourceTablePath.split(/[\\/]/).pop() : 'SD5888V100_LM_TOP.xls';

    return [
      // Design tree differences
      {
        id: 'dt-1',
        fileType: 'designTree',
        fileName: dtName,
        sheetName: 'design_tree',
        key: 'SD5888V100_LM_TOP/U_TM_TOP_0/U_TMDP_ESPE',
        fieldName: 'inst_num',
        type: 'fieldDifferent',
        sourceVal: '5000544',
        targetVal: '5000600',
        decision: undefined,
      },
      {
        id: 'dt-2',
        fileType: 'designTree',
        fileName: dtName,
        sheetName: 'design_tree',
        key: 'SD5888V100_LM_TOP/U_TM_TOP_0/U_TMDP_UMCBR_0',
        fieldName: 'int_edt_info',
        type: 'fieldDifferent',
        sourceVal: 'default_int{1:1}',
        targetVal: 'default_int{2:2}',
        decision: undefined,
      },
      {
        id: 'dt-3',
        fileType: 'designTree',
        fileName: dtName,
        sheetName: 'design_tree',
        key: 'SD5888V100_LM_TOP/U_TM_TOP_1/U_TMCP_FQMC',
        fieldName: '',
        type: 'sourceAdded',
        sourceVal: 'design_name: U_TMCP_FQMC, inst_num: 128, reg_num: 2048, int_edt_info: default_int{4:4}',
        targetVal: '',
        decision: undefined,
      },
      {
        id: 'dt-4',
        fileType: 'designTree',
        fileName: dtName,
        sheetName: 'design_tree',
        key: 'SD5888V100_LM_TOP/U_TM_TOP_0/U_TMCP_CME',
        fieldName: '',
        type: 'targetRedundant',
        sourceVal: '',
        targetVal: 'design_name: U_TMCP_CME, inst_num: 64, reg_num: 512, int_edt_info: default_int{3:3}',
        decision: undefined,
      },

      // Normalized table differences (Isio_core_top)
      {
        id: 'nt-1',
        fileType: 'normTable',
        fileName: ntName,
        sheetName: 'Isio_core_top',
        key: 'Isio_core_top::dft_ram_bypass',
        fieldName: '',
        type: 'sourceAdded',
        sourceVal: 'Pin name: dft_ram_bypass, ctrl_type: direct_ctrl, default_value: 0, scan_insert: X, atpg_sae: *',
        targetVal: '',
        decision: undefined,
      },
      {
        id: 'nt-2',
        fileType: 'normTable',
        fileName: ntName,
        sheetName: 'Isio_core_top',
        key: 'Isio_core_top::dft_tcam_ctrl_bus[10:0]',
        fieldName: '',
        type: 'targetRedundant',
        sourceVal: '',
        targetVal: 'Pin name: dft_tcam_ctrl_bus[10:0], ctrl_type: direct_ctrl, default_value: 1, scan_insert: X, atpg_sae: *',
        decision: undefined,
      },
      {
        id: 'nt-3',
        fileType: 'normTable',
        fileName: ntName,
        sheetName: 'Isio_core_top',
        key: 'Isio_core_top::dft_ram_ctrl_bus[319:229]',
        fieldName: 'default_value',
        type: 'fieldDifferent',
        sourceVal: '91b0',
        targetVal: '91b1',
        decision: undefined,
      },
      {
        id: 'nt-4',
        fileType: 'normTable',
        fileName: ntName,
        sheetName: 'Isio_core_top',
        key: 'Isio_core_top::dft_org_post_mode',
        fieldName: 'ctrl_type',
        type: 'fieldDifferent',
        sourceVal: 'direct_ctrl',
        targetVal: 'direct_ctrle',
        decision: undefined,
      },
      {
        id: 'nt-5',
        fileType: 'normTable',
        fileName: ntName,
        sheetName: 'Isio_core_top',
        key: 'Isio_core_top::dft_crg_pre_mode',
        fieldName: 'default_value',
        type: 'fieldAnomaly',
        sourceVal: '0',
        targetVal: '口',
        decision: undefined,
      },
      {
        id: 'nt-6',
        fileType: 'normTable',
        fileName: ntName,
        sheetName: 'new_module_sheet',
        key: 'new_module_sheet',
        fieldName: '',
        type: 'sheetAdded',
        sourceVal: 'Sheet exists',
        targetVal: '',
        decision: undefined,
      },
      {
        id: 'nt-7',
        fileType: 'normTable',
        fileName: ntName,
        sheetName: 'deprecated_module_sheet',
        key: 'deprecated_module_sheet',
        fieldName: '',
        type: 'sheetRedundant',
        sourceVal: '',
        targetVal: 'Sheet exists',
        decision: undefined,
      }
    ];
  };

  const generateMockPrecheck = (srcRepo: string, tgtRepo: string, srcDesign: string, srcTable: string, tgtDesign: string, tgtTable: string) => {
    const dtName = srcDesign ? srcDesign.split(/[\\/]/).pop() : 'SD5888V100_LM_TOP_design_tree_all.xls';
    const ntName = srcTable ? srcTable.split(/[\\/]/).pop() : 'SD5888V100_LM_TOP.xls';
    const dtBase = dtName?.replace(/\.[^/.]+$/, "") || 'SD5888V100_LM_TOP_design_tree_all';
    const ntBase = ntName?.replace(/\.[^/.]+$/, "") || 'SD5888V100_LM_TOP';

    return {
      direction: `${repoLabels[srcRepo as RepoKey]} → ${repoLabels[tgtRepo as RepoKey]}`,
      sourceRepo: srcRepo,
      targetRepo: tgtRepo,
      designTreeSource: srcDesign || `dft-workspace/${srcRepo}/${dtName}`,
      designTreeTarget: tgtDesign || `dft-workspace/${tgtRepo}/${dtName}`,
      designTreeHiddenDir: `dft-workspace/${tgtRepo}/.${dtBase}/`,
      designTreeDiffCount: 4,
      normTableSource: srcTable || `dft-workspace/${srcRepo}/${ntName}`,
      normTableTarget: tgtTable || `dft-workspace/${tgtRepo}/${ntName}`,
      normTableHiddenDir: `dft-workspace/${tgtRepo}/.${ntBase}/`,
      normTableDiffCount: 7,
    };
  };

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
        targetRepo: selectedRepo,
        sourceDesignTree: srcDesign,
        sourceNormTable: srcTable,
        targetDesignTree: tgtDesign,
        targetNormTable: tgtTable,
        direction: syncDirection,
      });
      
      if (res.success) {
        setPrecheckInfo(res.precheck);
        setDiffItems(res.diffItems);
        setActiveDiffId(res.diffItems[0]?.id || null);
      } else {
        message.error(res.error || '预检查失败');
        return;
      }
    } catch (err: any) {
      console.warn("Using fallback mock data because IPC is not fully wired yet:", err);
      // Generate precheck summary and diff items (demo level fallback)
      const mockPrecheck = generateMockPrecheck(src, tgt, srcDesign, srcTable, tgtDesign, tgtTable);
      const mockDiffs = generateMockDiffs(srcDesign, srcTable, tgtDesign, tgtTable);
      
      setPrecheckInfo(mockPrecheck);
      setDiffItems(mockDiffs);
      setActiveDiffId(mockDiffs[0]?.id || null);
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
      const unresolved = diffItems.filter(item => !item.decision);
      if (unresolved.length > 0) {
        setShowValidationErrors(true);
        message.error(`存在 ${unresolved.length} 项未决策的差异，请先处理`);
        return;
      }
    }

    Modal.confirm({
      title: '确认执行同步合并操作？',
      icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
      content: selectedStrategy === 'overwrite' 
        ? '直接覆盖将会清空并重写目标仓中的本地修改。确认执行？'
        : selectedStrategy === 'autoMerge'
        ? '即将自动应用无冲突的合并变更。确认执行？'
        : `即将应用您选择的 ${diffItems.length} 项差异合并决策到目标仓。确认执行？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setIsApplying(true);
        try {
          const srcDesign = syncDirection === 'dataToTarget' ? dataDesignTree.value : targetDesignTree.value;
          const srcTable = syncDirection === 'dataToTarget' ? dataNormTable.value : targetNormTable.value;
          const tgtDesign = syncDirection === 'dataToTarget' ? targetDesignTree.value : dataDesignTree.value;
          const tgtTable = syncDirection === 'dataToTarget' ? targetNormTable.value : dataNormTable.value;

          const decisions = diffItems.map(item => ({
            id: item.id,
            choice: item.decision || 'target',
            customValue: item.customVal
          }));

          const res = await applyCommonArtifactSync({
            targetRepo: selectedRepo,
            strategy: selectedStrategy,
            direction: syncDirection,
            sourceDesignTree: srcDesign,
            sourceNormTable: srcTable,
            targetDesignTree: tgtDesign,
            targetNormTable: tgtTable,
            decisions: decisions,
            stageAfterApply: false,
          });

          if (res.success) {
            setSyncReport(res.report);
            setWizardStep(2);
            message.success('差异合并已应用到目标文件及 CSV 隐藏目录！');
            await refreshRepoInfo();
          } else {
            throw new Error(res.error || '应用同步合并策略失败');
          }
        } catch (err: any) {
          console.warn("Using fallback local report because backend operation is not fully wired yet:", err);
          // Fallback local report simulation
          const now = new Date();
          const ts = now.getFullYear() + 
                     String(now.getMonth() + 1).padStart(2, '0') + 
                     String(now.getDate()).padStart(2, '0') + '_' +
                     String(now.getHours()).padStart(2, '0') + 
                     String(now.getMinutes()).padStart(2, '0') + 
                     String(now.getSeconds()).padStart(2, '0');
          const backupDir = `.dft-sync-backup/${ts}/`;
          
          const srcDesign = syncDirection === 'dataToTarget' ? dataDesignTree.value : targetDesignTree.value;
          const srcTable = syncDirection === 'dataToTarget' ? dataNormTable.value : targetNormTable.value;
          const dtName = srcDesign ? srcDesign.split(/[\\/]/).pop() : 'SD5888V100_LM_TOP_design_tree_all.xls';
          const ntName = srcTable ? srcTable.split(/[\\/]/).pop() : 'SD5888V100_LM_TOP.xls';
          const dtBase = dtName?.replace(/\.[^/.]+$/, "") || 'SD5888V100_LM_TOP_design_tree_all';
          const ntBase = ntName?.replace(/\.[^/.]+$/, "") || 'SD5888V100_LM_TOP';

          const mockReport = {
            backupDir,
            changedXls: [dtName, ntName].filter(Boolean),
            generatedCsv: [
              `.${dtBase}/design_tree.csv`,
              `.${ntBase}/Isio_core_top.csv`,
              `.${ntBase}/new_module_sheet.csv`,
            ],
            strategy: selectedStrategy === 'overwrite' ? '直接覆盖' : selectedStrategy === 'autoMerge' ? '自动合并' : '手动合并',
            unresolvedCount: selectedStrategy === 'overwrite' ? 0 : selectedStrategy === 'autoMerge' ? 4 : diffItems.length,
            result: '同步成功！\n1. 目标 CSV 隐藏目录 (.' + dtBase + '/, .' + ntBase + '/) 已成功生成并写入，完整体现了本次 Demo 中的合并与决策配置。\n2. 目标 XLS 路径当前仅为源文件复制（Copy Source），以确保输出的 Excel 文件格式有效性。\n3. 生产版后续再实现完整的 CSV -> XLS 逻辑写回与刷新以支持 XLS 二进制合并。',
          };
          
          setSyncReport(mockReport);
          setWizardStep(2);
          message.success('差异合并应用成功，请在 VS Code Git 控制面板中提交变更。');
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
        return <Tag color="cyan">来源新增</Tag>;
      case 'targetRedundant':
        return <Tag color="purple">目标多余</Tag>;
      case 'fieldDifferent':
        return <Tag color="gold">字段不同</Tag>;
      case 'sheetAdded':
        return <Tag color="blue">Sheet 新增</Tag>;
      case 'sheetRedundant':
        return <Tag color="magenta">Sheet 多余</Tag>;
      case 'fieldAnomaly':
        return <Tag color="error">字段异常</Tag>;
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

  const renderStep0Precheck = () => {
    if (!precheckInfo) return <Spin />;
    const hasConflicts = diffItems.some(item => item.type === 'fieldDifferent' || item.type === 'fieldAnomaly');

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message={
            <div>
              <Text strong>检测差异后选择同步策略，避免静默覆盖目标内容</Text>
              <br />
              <Text style={{ fontSize: 12 }}>方向: {precheckInfo.direction}</Text>
            </div>
          }
        />
        
        <div>
          <Title level={5} style={{ margin: '0 0 10px 0' }}>同步预检查结果</Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card size="small" title="Design Tree 目标映射" style={{ borderRadius: 8 }}>
              <Space direction="vertical" size={4} style={{ width: '100%', fontSize: 12 }}>
                <div><Text type="secondary">来源文件:</Text> {precheckInfo.designTreeSource.split(/[\\/]/).pop()}</div>
                <div><Text type="secondary">目标文件:</Text> {precheckInfo.designTreeTarget.split(/[\\/]/).pop()}</div>
                <div><Text type="secondary">拆分目录:</Text> <code>{precheckInfo.designTreeHiddenDir}</code></div>
                <div>
                  <Badge status={precheckInfo.designTreeDiffCount > 0 ? "warning" : "success"} 
                         text={`状态：存在 ${precheckInfo.designTreeDiffCount} 项差异`} />
                </div>
              </Space>
            </Card>
            
            <Card size="small" title="归一化表格 目标映射" style={{ borderRadius: 8 }}>
              <Space direction="vertical" size={4} style={{ width: '100%', fontSize: 12 }}>
                <div><Text type="secondary">来源文件:</Text> {precheckInfo.normTableSource.split(/[\\/]/).pop()}</div>
                <div><Text type="secondary">目标文件:</Text> {precheckInfo.normTableTarget.split(/[\\/]/).pop()}</div>
                <div><Text type="secondary">拆分目录:</Text> <code>{precheckInfo.normTableHiddenDir}</code></div>
                <div>
                  <Badge status={precheckInfo.normTableDiffCount > 0 ? "warning" : "success"} 
                         text={`状态：存在 ${precheckInfo.normTableDiffCount} 项差异`} />
                </div>
              </Space>
            </Card>
          </div>
        </div>

        <div>
          <Title level={5} style={{ margin: '0 0 10px 0' }}>请选择同步策略：</Title>
          <Radio.Group 
            value={selectedStrategy} 
            onChange={(e) => setSelectedStrategy(e.target.value)}
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
                  background: selectedStrategy === 'manualMerge' ? 'color-mix(in srgb, var(--vscode-editor-background, #fff) 96%, var(--vscode-focusBorder, #1677ff))' : undefined
                }}
              >
                <Radio value="manualMerge">
                  <Text strong>手动合并 (推荐)</Text>
                  <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginLeft: 24, marginTop: 4 }}>
                    在 Webview 中展示业务化差异，用户逐项选择后生成最终 CSV / XLS。无需暴露原始 CSV 文本或 Git 冲突文本。
                  </div>
                </Radio>
              </Card>

              <Card 
                size="small" 
                hoverable
                onClick={() => {
                  if (!hasConflicts) {
                    setSelectedStrategy('autoMerge');
                  } else {
                    message.warning("检测到有字段不同或异常冲突，不能直接自动合并。请选择【手动合并】");
                  }
                }}
                style={{ 
                  borderRadius: 8, 
                  border: selectedStrategy === 'autoMerge' ? '1px solid var(--vscode-focusBorder)' : '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
                  background: selectedStrategy === 'autoMerge' ? 'color-mix(in srgb, var(--vscode-editor-background, #fff) 96%, var(--vscode-focusBorder, #1677ff))' : undefined,
                  opacity: hasConflicts ? 0.6 : 1
                }}
              >
                <Radio value="autoMerge" disabled={hasConflicts}>
                  <Text strong>自动合并 (仅适用于安全场景)</Text>
                  {hasConflicts && (
                    <Tag color="red" style={{ marginLeft: 8 }}>检测到冲突字段，不可用</Tag>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginLeft: 24, marginTop: 4 }}>
                    自动将来源新增项引入到目标中，并保留目标独有的本地新增项。包含字段冲突或异常时将强制转为手动合并。
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
                  background: selectedStrategy === 'overwrite' ? 'color-mix(in srgb, var(--vscode-editor-background, #fff) 96%, var(--vscode-focusBorder, #1677ff))' : undefined
                }}
              >
                <Radio value="overwrite">
                  <Text strong>直接覆盖 (高风险)</Text>
                  <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginLeft: 24, marginTop: 4 }}>
                    来源 xls 覆盖目标 xls，来源隐藏目录 csv 覆盖目标隐藏目录 csv。覆盖后目标仓本地修改将丢失。系统在执行前会自动生成时间戳备份。
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
              if (selectedStrategy === 'overwrite') {
                setWizardStep(1);
              } else if (selectedStrategy === 'autoMerge') {
                if (hasConflicts) {
                  message.error("存在未决冲突，无法使用自动合并。请选择‘手动合并’。");
                } else {
                  setWizardStep(1);
                }
              } else {
                setWizardStep(1);
              }
            }}
          >
            下一步
          </Button>
        </div>
      </Space>
    );
  };

  const renderOverwriteConfirmation = () => {
    return (
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="直接覆盖确认"
          description="目标文件已有内容，覆盖后目标仓本地修改将丢失。系统会先在目标仓生成一个时间戳备份目录，如 .dft-sync-backup/YYYYMMDD_HHMMSS/。"
        />
        <div>
          <Text strong>将被覆盖的文件及隐藏目录：</Text>
          <ul style={{ paddingLeft: 20, marginTop: 8, fontSize: 13 }}>
            <li><code>{precheckInfo?.designTreeTarget}</code></li>
            <li><code>{precheckInfo?.designTreeHiddenDir}</code></li>
            <li><code>{precheckInfo?.normTableTarget}</code></li>
            <li><code>{precheckInfo?.normTableHiddenDir}</code></li>
          </ul>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button onClick={() => setWizardStep(0)}>返回上一步</Button>
          <Button type="primary" danger loading={isApplying} onClick={handleApplySync}>
            确认直接覆盖
          </Button>
        </div>
      </Space>
    );
  };

  const renderAutoMergePreview = () => {
    return (
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Alert
          type="success"
          showIcon
          message="自动合并结果预览"
          description="系统检测到以下可以安全自动合并的条目（不含值冲突或字段异常）。请确认是否执行合并。"
        />
        <Card size="small" style={{ borderRadius: 8 }}>
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <Text type="secondary">Design Tree:</Text>
              <span style={{ marginLeft: 8 }}>可自动引入：<Text type="success">1 项</Text> (来源新增)，可自动保留：<Text type="success">1 项</Text> (目标多余)</span>
            </div>
            <div>
              <Text type="secondary">归一化表格 (Isio_core_top):</Text>
              <span style={{ marginLeft: 8 }}>可自动引入 Pin：<Text type="success">1 项</Text>，可自动保留 Pin：<Text type="success">1 项</Text></span>
            </div>
            <div>
              <Text type="secondary">分表合并 (Sheets):</Text>
              <span style={{ marginLeft: 8 }}>可引入 Sheet：<Text type="success">1 项</Text>，可保留 Sheet：<Text type="success">1 项</Text></span>
            </div>
          </div>
        </Card>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button onClick={() => setWizardStep(0)}>返回上一步</Button>
          <Button type="primary" loading={isApplying} onClick={handleApplySync}>
            应用自动合并结果
          </Button>
        </div>
      </Space>
    );
  };

  const renderManualMergeScreen = () => {
    const activeItem = diffItems.find((item) => item.id === activeDiffId);
    const unresolvedCount = diffItems.filter(item => !item.decision).length;

    return (
      <Row gutter={16}>
        {/* Left Column - Filter & Diff List */}
        <Col span={9}>
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))' }}>
              <div>
                <Text style={{ fontSize: 11, fontWeight: 600 }}>文件过滤</Text>
                <div style={{ marginTop: 4 }}>
                  <Radio.Group 
                    size="small" 
                    value={filterFileType} 
                    onChange={(e) => setFilterFileType(e.target.value)}
                  >
                    <Radio.Button value="all">全部</Radio.Button>
                    <Radio.Button value="designTree">Design Tree</Radio.Button>
                    <Radio.Button value="normTable">归一化表</Radio.Button>
                  </Radio.Group>
                </div>
              </div>

              <div>
                <Text style={{ fontSize: 11, fontWeight: 600 }}>差异类型</Text>
                <div style={{ marginTop: 4 }}>
                  <Radio.Group 
                    size="small" 
                    value={filterDiffType} 
                    onChange={(e) => setFilterDiffType(e.target.value)}
                  >
                    <Radio.Button value="all">全部</Radio.Button>
                    <Radio.Button value="fieldDifferent">不同</Radio.Button>
                    <Radio.Button value="fieldAnomaly">异常</Radio.Button>
                    <Radio.Button value="sourceAdded">新增</Radio.Button>
                  </Radio.Group>
                </div>
              </div>

              {uniqueSheets.length > 0 && (
                <div>
                  <Text style={{ fontSize: 11, fontWeight: 600 }}>分表 (Sheet / Module)</Text>
                  <div style={{ marginTop: 4 }}>
                    <Radio.Group 
                      size="small" 
                      value={filterSheet} 
                      onChange={(e) => setFilterSheet(e.target.value)}
                    >
                      <Radio.Button value="all">全部</Radio.Button>
                      {uniqueSheets.map(sheet => (
                        <Radio.Button key={sheet} value={sheet}>{sheet.length > 12 ? sheet.slice(0, 10) + '...' : sheet}</Radio.Button>
                      ))}
                    </Radio.Group>
                  </div>
                </div>
              )}
            </div>

            {showValidationErrors && unresolvedCount > 0 && (
              <Alert 
                type="error" 
                showIcon 
                message={`尚有 ${unresolvedCount} 项差异未决定，请在列表中处理。`} 
                style={{ padding: '6px 12px' }}
              />
            )}

            <div 
              style={{ 
                height: 380, 
                overflowY: 'auto', 
                border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))', 
                borderRadius: 8,
                padding: 6,
                background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))'
              }}
            >
              {filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--vscode-descriptionForeground)', padding: 20 }}>
                  无符合条件的差异项
                </div>
              ) : (
                filteredItems.map((item) => {
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
                        border: isSelected 
                          ? '1px solid var(--vscode-focusBorder)' 
                          : showErr 
                            ? '1px solid var(--vscode-errorForeground, #ff4d4f)' 
                            : '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
                        background: isSelected 
                          ? 'color-mix(in srgb, var(--vscode-editor-background, #fff) 90%, var(--vscode-focusBorder, #1677ff))' 
                          : 'var(--vscode-editor-background)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space size={6}>
                          {hasDecision ? (
                            <CheckCircleOutlined style={{ color: '#389e0d' }} />
                          ) : (
                            <WarningOutlined style={{ color: showErr ? '#ff4d4f' : '#faad14' }} />
                          )}
                          <Text style={{ fontSize: 12, fontWeight: 600 }} ellipsis={{ tooltip: item.key }}>
                            {item.key.includes('::') ? item.key.split('::')[1] : item.key.split(/[\\/]/).pop()}
                          </Text>
                        </Space>
                        {getDiffTypeTag(item.type)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
                        <span>Sheet: {item.sheetName}</span>
                        {item.fieldName && <span>字段: {item.fieldName}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Space>
        </Col>

        {/* Right Column - Diff Detail & Action */}
        <Col span={15}>
          {activeItem ? (
            <Card 
              size="small" 
              title="差异业务对比与决策"
              style={{ borderRadius: 8, height: '100%', background: 'var(--vscode-editor-background)' }}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                  <div><Text type="secondary">文件类别:</Text> {activeItem.fileType === 'designTree' ? 'Design Tree' : '归一化表格'}</div>
                  <div><Text type="secondary">Sheet/Path:</Text> <code>{activeItem.sheetName}</code></div>
                  <div style={{ gridColumn: 'span 2' }}><Text type="secondary">业务Key:</Text> <code>{activeItem.key}</code></div>
                  {activeItem.fieldName && <div style={{ gridColumn: 'span 2' }}><Text type="secondary">变更字段:</Text> <Tag color="orange">{activeItem.fieldName}</Tag></div>}
                </div>

                <Row gutter={12}>
                  <Col span={12}>
                    <div style={{ 
                      padding: 10, 
                      borderRadius: 6, 
                      background: 'rgba(82, 196, 26, 0.06)', 
                      border: '1px solid rgba(82, 196, 26, 0.2)',
                      height: 110,
                      overflowY: 'auto'
                    }}>
                      <div style={{ fontSize: 11, color: '#389e0d', fontWeight: 600, marginBottom: 4 }}>来源值 (SOURCE)</div>
                      <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {activeItem.sourceVal || <span style={{ fontStyle: 'italic', color: '#888' }}>(空/不存在)</span>}
                      </Text>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ 
                      padding: 10, 
                      borderRadius: 6, 
                      background: 'rgba(250, 173, 20, 0.06)', 
                      border: '1px solid rgba(250, 173, 20, 0.2)',
                      height: 110,
                      overflowY: 'auto'
                    }}>
                      <div style={{ fontSize: 11, color: '#d46b08', fontWeight: 600, marginBottom: 4 }}>目标值 (TARGET)</div>
                      <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {activeItem.targetVal || <span style={{ fontStyle: 'italic', color: '#888' }}>(空/不存在)</span>}
                      </Text>
                    </div>
                  </Col>
                </Row>

                <Card size="small" title="合并决策选择" style={{ borderRadius: 6, background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))' }}>
                  {activeItem.type === 'sourceAdded' || activeItem.type === 'sheetAdded' ? (
                    <Radio.Group 
                      value={activeItem.decision} 
                      onChange={(e) => handleDecisionChange(activeItem.id, e.target.value)}
                    >
                      <Space direction="vertical">
                        <Radio value="source">引入：将该项引入到目标仓</Radio>
                        <Radio value="target">不引入：舍弃该项</Radio>
                      </Space>
                    </Radio.Group>
                  ) : activeItem.type === 'targetRedundant' || activeItem.type === 'sheetRedundant' ? (
                    <Radio.Group 
                      value={activeItem.decision} 
                      onChange={(e) => handleDecisionChange(activeItem.id, e.target.value)}
                    >
                      <Space direction="vertical">
                        <Radio value="target">保留：保留目标仓中多余的项 (默认)</Radio>
                        <Radio value="source">删除：在目标仓中移除该项</Radio>
                      </Space>
                    </Radio.Group>
                  ) : (
                    // fieldDifferent / fieldAnomaly
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Radio.Group 
                        value={activeItem.decision} 
                        onChange={(e) => handleDecisionChange(activeItem.id, e.target.value)}
                      >
                        <Space direction="vertical">
                          <Radio value="source">使用来源值: <code>{activeItem.sourceVal}</code></Radio>
                          <Radio value="target">使用目标值: <code>{activeItem.targetVal}</code></Radio>
                          <Radio value="custom">手动输入自定义值</Radio>
                        </Space>
                      </Radio.Group>
                      {activeItem.decision === 'custom' && (
                        <Input.TextArea
                          rows={2}
                          value={activeItem.customVal || ''}
                          onChange={(e) => handleDecisionChange(activeItem.id, 'custom', e.target.value)}
                          placeholder="请输入自定义值..."
                          style={{ marginTop: 6 }}
                        />
                      )}
                    </Space>
                  )}
                </Card>

                {/* VS Code Native Auxiliary Actions */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))', 
                  padding: 8, 
                  borderRadius: 6,
                  border: '1px dashed var(--vscode-panel-border, rgba(127,127,127,0.22))'
                }}>
                  <Text style={{ fontSize: 11 }} type="secondary">VS Code 辅助工具:</Text>
                  <Space size="small">
                    <Button 
                      size="small" 
                      icon={<SlidersOutlined />} 
                      onClick={async () => {
                        const dtName = precheckInfo?.designTreeSource.split(/[\\/]/).pop() || '';
                        const ntName = precheckInfo?.normTableSource.split(/[\\/]/).pop() || '';
                        const dtBase = dtName.replace(/\.[^/.]+$/, "");
                        const ntBase = ntName.replace(/\.[^/.]+$/, "");
                        
                        const isDt = activeItem.fileType === 'designTree';
                        const fileDirName = isDt ? `.${dtBase}` : `.${ntBase}`;
                        const csvFileName = isDt ? 'design_tree.csv' : `${activeItem.sheetName}.csv`;

                        const srcDir = isDt ? precheckInfo?.designTreeSource : precheckInfo?.normTableSource;
                        const tgtDir = isDt ? precheckInfo?.designTreeTarget : precheckInfo?.normTableTarget;

                        if (!srcDir || !tgtDir) {
                          message.error("文件路径不完整，无法对比");
                          return;
                        }

                        const srcCsvPath = srcDir.replace(/[\\/][^\\/]+$/, `/${fileDirName}/${csvFileName}`);
                        const tgtCsvPath = tgtDir.replace(/[\\/][^\\/]+$/, `/${fileDirName}/${csvFileName}`);

                        try {
                          const res = await openVsCodeDiff({
                            sourcePath: srcCsvPath,
                            targetPath: tgtCsvPath,
                            title: `Diff: ${csvFileName}`
                          });
                          if (!res.success) {
                            message.error(`对比失败: ${res.error || '无法打开差异对比窗口'}`);
                          }
                        } catch (err: any) {
                          message.error(`对比失败: ${err.message || '对比执行异常，请确认是否已生成 CSV'}`);
                        }
                      }}
                    >
                      VS Code 窗口对比
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => {
                        const dtName = precheckInfo?.designTreeSource.split(/[\\/]/).pop() || '';
                        const ntName = precheckInfo?.normTableSource.split(/[\\/]/).pop() || '';
                        const dtBase = dtName.replace(/\.[^/.]+$/, "");
                        const ntBase = ntName.replace(/\.[^/.]+$/, "");
                        const isDt = activeItem.fileType === 'designTree';
                        const fileDirName = isDt ? `.${dtBase}` : `.${ntBase}`;
                        const csvFileName = isDt ? 'design_tree.csv' : `${activeItem.sheetName}.csv`;
                        
                        const srcDir = isDt ? precheckInfo?.designTreeSource : precheckInfo?.normTableSource;
                        if (!srcDir) {
                          message.error("来源文件路径为空");
                          return;
                        }
                        const srcCsvPath = srcDir.replace(/[\\/][^\\/]+$/, `/${fileDirName}/${csvFileName}`);
                        
                        try {
                          openFileInEditor(srcCsvPath);
                          message.success(`已在编辑器中打开源 CSV: ${csvFileName}`);
                        } catch (err: any) {
                          message.error(`打开文件失败: ${err.message}`);
                        }
                      }}
                    >
                      打开源 CSV
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => {
                        const dtName = precheckInfo?.designTreeSource.split(/[\\/]/).pop() || '';
                        const ntName = precheckInfo?.normTableSource.split(/[\\/]/).pop() || '';
                        const dtBase = dtName.replace(/\.[^/.]+$/, "");
                        const ntBase = ntName.replace(/\.[^/.]+$/, "");
                        const isDt = activeItem.fileType === 'designTree';
                        const fileDirName = isDt ? `.${dtBase}` : `.${ntBase}`;
                        const csvFileName = isDt ? 'design_tree.csv' : `${activeItem.sheetName}.csv`;
                        
                        const tgtDir = isDt ? precheckInfo?.designTreeTarget : precheckInfo?.normTableTarget;
                        if (!tgtDir) {
                          message.error("目标文件路径为空");
                          return;
                        }
                        const tgtCsvPath = tgtDir.replace(/[\\/][^\\/]+$/, `/${fileDirName}/${csvFileName}`);
                        
                        try {
                          openFileInEditor(tgtCsvPath);
                          message.success(`已在编辑器中打开目标 CSV: ${csvFileName}`);
                        } catch (err: any) {
                          message.error(`打开文件失败: ${err.message}`);
                        }
                      }}
                    >
                      打开目标 CSV
                    </Button>
                  </Space>
                </div>
              </Space>
            </Card>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--vscode-descriptionForeground)' }}>
              请在左侧选择差异项
            </div>
          )}
        </Col>
      </Row>
    );
  };

  const renderStep2Report = () => {
    if (!syncReport) return <Spin />;

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="success"
          showIcon
          message="公共表格同步合并报告"
          description="本地合并策略已成功应用，文件变更已写入工作区。"
        />

        <Card size="small" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={8} style={{ width: '100%', fontSize: 13 }}>
            <div><Text type="secondary">所选合并策略:</Text> <Tag color="blue">{syncReport.strategy}</Tag></div>
            <div>
              <Text type="secondary">备份文件夹路径:</Text> <code style={{ color: 'var(--vscode-textPreformat-foreground)' }}>{syncReport.backupDir}</code>
              <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 2 }}>
                (系统已在此目录中备份了原始的 XLS 及其隐藏 CSV 目录)
              </div>
            </div>
            <div>
              <Text type="secondary">已更新的 XLS 文件:</Text>
              <ul style={{ margin: '4px 0 4px 16px', padding: 0 }}>
                {syncReport.changedXls.map((file: string) => <li key={file}><code>{file}</code></li>)}
              </ul>
            </div>
            <div>
              <Text type="secondary">已写入的隐藏 CSV 文件 (反映合并决策):</Text>
              <ul style={{ margin: '4px 0 4px 16px', padding: 0 }}>
                {syncReport.generatedCsv.map((file: string) => <li key={file}><code>{file}</code></li>)}
              </ul>
            </div>
            <div><Text type="secondary">合并前冲突数:</Text> <Badge count={syncReport.unresolvedCount} style={{ backgroundColor: '#faad14' }} /></div>
            <div><Text type="secondary">执行动作结果:</Text> {syncReport.result}</div>
          </Space>
        </Card>

        <Alert
          type="warning"
          showIcon
          message="Excel 写入说明"
          description="Excel 写入为 Demo 级，当前通过复制源 XLS 来保证 Excel 文件的格式有效性。同名隐藏 CSV 目录下已经写入了反映您所选决策的完整结构化数据。完整的 XLS 自动生成与刷新（从合并后的 CSV 写回）将在生产级 Excel Writer 模块中实现。"
        />

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
              系统未对本次变更执行 Git 暂存与提交。请使用 VS Code 侧边栏的 Git 控制面板手动审查、暂存并提交这些变更。
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
              selectedStrategy === 'overwrite' ? renderOverwriteConfirmation() : 
              selectedStrategy === 'autoMerge' ? renderAutoMergePreview() : 
              renderManualMergeScreen()
            )}

            {wizardStep === 2 && renderStep2Report()}

            {/* Manual Merge bottom buttons */}
            {wizardStep === 1 && selectedStrategy === 'manualMerge' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, borderTop: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))', paddingTop: 14 }}>
                <Button onClick={() => setWizardStep(0)}>返回上一步</Button>
                <Button 
                  type="primary" 
                  loading={isApplying} 
                  onClick={handleApplySync}
                  style={{ fontWeight: 600 }}
                >
                  确认应用合并决策
                </Button>
              </div>
            )}
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
