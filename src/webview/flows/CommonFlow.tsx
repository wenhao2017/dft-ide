import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Divider, Form, Input, List, Modal, Radio, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BranchesOutlined,
  CloudDownloadOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  SaveOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../hooks/useVscodePath';
import { useFlowConfig } from '../hooks/useFlowConfig';
import PathInput from '../components/shared/PathInput';
import useWizardStore from '../store/wizardStore';
import ObsViewer from '../components/shared/ObsViewer';
import { getGitChangedFiles, openSourceControl, type GitChangedFileInfo } from '../utils/ipc';

const { Text } = Typography;

const CommonFlow: React.FC = () => {
  const designTree = useVscodePath();
  const normTable  = useVscodePath();
  const [obsViewerOpen, setObsViewerOpen] = useState(false);
  const activeProject = useWizardStore((state) => state.activeProject);

  // 优化4：Git 同步对话框状态
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [changedFiles, setChangedFiles] = useState<GitChangedFileInfo[]>([]);
  const [loadingChanges, setLoadingChanges] = useState(false);

  // ── 配置持久化 Hook ─────────────────────────────────
  const { savedData, loading, saving, syncing, hasUnsaved, handleSave, handleSync, debouncedSave, markDirty } =
    useFlowConfig('common');

  // 回填：从文件读到 savedData 后，填入各路径输入框
  useEffect(() => {
    if (!savedData) return;
    if (savedData.designTree) designTree.setValue(String(savedData.designTree));
    if (savedData.normTable)  normTable.setValue(String(savedData.normTable));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData]);

  // 优化1：路径变更时触发自动保存 + dirty 标记
  useEffect(() => {
    // 不在初始加载时触发
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

  // ── 收集当前表单数据 ────────────────────────────────
  const collectFormData = () => ({
    designTree: designTree.value,
    normTable:  normTable.value,
  });

  const onSave = () => handleSave(collectFormData());

  // 优化4：打开 Git 同步对话框 → 加载变更文件列表
  const openSyncModal = async () => {
    setSyncModalOpen(true);
    setLoadingChanges(true);
    setCommitMsg('');
    setPushAfterCommit(false);
    try {
      const result = await getGitChangedFiles();
      setChangedFiles(result.files ?? []);
    } catch {
      setChangedFiles([]);
    } finally {
      setLoadingChanges(false);
    }
  };

  // 优化4：确认 Git 同步
  const confirmSync = async () => {
    const data = collectFormData();
    const msg = commitMsg.trim() || undefined;
    const ok = await handleSync(data, msg, pushAfterCommit);
    if (ok) {
      setSyncModalOpen(false);
    }
  };

  const obsSpaceName = activeProject?.name ?? 'dft-ide-workspace';

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <div>
        <Alert
          showIcon
          type="info"
          message="COMMON 是公共配置入口，可避免各流程重复维护同一份路径配置。"
          style={{ marginBottom: 20, borderRadius: 8 }}
        />

        {hasUnsaved && (
          <Alert
            showIcon
            type="warning"
            message="有尚未保存的本地配置，请先保存到本地状态目录。"
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        <div
          style={{
            border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
            borderRadius: 8,
            padding: 20,
            background: 'var(--vscode-editor-background)',
          }}
        >
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <Radio.Group defaultValue="design" buttonStyle="solid" size="large">
              <Radio.Button value="design">
                <BranchesOutlined style={{ marginRight: 8 }} />
                设计 Git 分支
              </Radio.Button>
              <Radio.Button value="verification">
                <BranchesOutlined style={{ marginRight: 8 }} />
                验证 Git 分支
              </Radio.Button>
            </Radio.Group>
          </div>

          <Form layout="vertical" style={{ maxWidth: 840, margin: '0 auto' }}>
            <Form.Item label="设计树路径">
              <PathInput
                state={designTree}
                placeholder="请输入或选择设计树路径"
                size="large"
                showOpen
                showSelectFolder
              />
            </Form.Item>

            <Form.Item label="归一化表格路径">
              <PathInput
                state={normTable}
                placeholder="请输入或选择归一化表格路径"
                size="large"
                showOpen
                showSelectFile
              />
            </Form.Item>

            <Divider orientation="left">OBS 存储与公共数据</Divider>
            <Space size="middle" wrap>
              <Button
                size="large"
                icon={<DatabaseOutlined />}
                onClick={() => setObsViewerOpen(true)}
              >
                打开 OBS 查看器
              </Button>
              <Button size="large" icon={<CloudDownloadOutlined />}>
                下载公共数据
              </Button>
            </Space>
          </Form>

          <Divider style={{ margin: '30px 0 22px' }} />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <Space wrap>
              <Tooltip title="Git Pull">
                <Button icon={<ArrowDownOutlined />} />
              </Tooltip>
              <Tooltip title="Git Push">
                <Button icon={<ArrowUpOutlined />} />
              </Tooltip>
              {/* 优化4：打开 VS Code SCM 视图 */}
              <Button
                icon={<BranchesOutlined />}
                onClick={openSourceControl}
              >
                Git 详细操作
              </Button>
            </Space>
            <Space size="middle" wrap>
              <Badge dot={hasUnsaved} offset={[-4, 4]}>
                <Button
                  size="large"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={onSave}
                >
                  保存配置
                </Button>
              </Badge>
              {/* 优化4：点击同步按钮打开确认对话框 */}
              <Button
                size="large"
                type="primary"
                icon={<SyncOutlined />}
                loading={syncing}
                onClick={openSyncModal}
              >
                Git 同步
              </Button>
            </Space>
          </div>
        </div>
        <ObsViewer
          open={obsViewerOpen}
          spaceName={obsSpaceName}
          onCancel={() => setObsViewerOpen(false)}
        />

        {/* 优化4：Git 同步确认对话框 */}
        <Modal
          title={
            <Space>
              <ExclamationCircleOutlined style={{ color: '#faad14' }} />
              <span>Git 同步确认</span>
            </Space>
          }
          open={syncModalOpen}
          onCancel={() => setSyncModalOpen(false)}
          confirmLoading={syncing}
          onOk={confirmSync}
          okText="确认提交"
          cancelText="取消"
          width={560}
        >
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Diff 预览 */}
            <div>
              <Text strong style={{ marginBottom: 8, display: 'block' }}>
                变更文件预览
              </Text>
              {loadingChanges ? (
                <div style={{ padding: 16, textAlign: 'center' }}><Spin size="small" /></div>
              ) : changedFiles.length > 0 ? (
                <List
                  size="small"
                  bordered
                  dataSource={changedFiles}
                  style={{ maxHeight: 200, overflow: 'auto', borderRadius: 6 }}
                  renderItem={(file) => (
                    <List.Item style={{ padding: '6px 12px' }}>
                      <Space>
                        <FileTextOutlined style={{ color: 'var(--vscode-focusBorder, #2563eb)' }} />
                        <Text style={{ fontSize: 13 }}>{file.path}</Text>
                        <Tag
                          color={file.type === 'index' ? 'green' : file.type === 'workingTree' ? 'orange' : 'default'}
                          style={{ fontSize: 11 }}
                        >
                          {file.type}
                        </Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Alert type="info" message="暂无检测到的文件变更" showIcon style={{ borderRadius: 6 }} />
              )}
            </div>

            {/* 自定义 Commit Message */}
            <div>
              <Text strong style={{ marginBottom: 8, display: 'block' }}>
                Commit Message
              </Text>
              <Input.TextArea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="留空则自动生成：feat(dft-ide): update common config [时间戳]"
                rows={3}
                style={{ borderRadius: 6 }}
              />
            </div>

            {/* Push 选项 */}
            <div>
              <Radio.Group
                value={pushAfterCommit}
                onChange={(e) => setPushAfterCommit(e.target.value)}
              >
                <Radio value={false}>仅 Commit（不推送）</Radio>
                <Radio value={true}>Commit + Push</Radio>
              </Radio.Group>
            </div>
          </Space>
        </Modal>
      </div>
    </Spin>
  );
};

export default CommonFlow;
