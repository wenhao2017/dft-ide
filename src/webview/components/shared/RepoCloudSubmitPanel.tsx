import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Input,
  List,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  BranchesOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  FileSyncOutlined,
  LeftOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  getRepoGitInfo,
  openFileInEditor,
  runRepoGitAction,
  submitRepoToCloud,
  type RepoCloudSubmitResult,
  type RepoGitInfo,
  type RepoKey,
} from '../../utils/ipc';

const { Text, Title } = Typography;

const repoLabels: Record<RepoKey, string> = {
  design: 'Design',
  verification: 'Verification',
};

const defaultMessages: Record<RepoKey, string> = {
  design: 'Update design flow configuration',
  verification: 'Update verification flow configuration',
};

interface Props {
  repo: RepoKey;
  accent: string;
  onPrev: () => void;
}

const RepoCloudSubmitPanel: React.FC<Props> = ({ repo, accent, onPrev }) => {
  const [repoInfo, setRepoInfo] = useState<RepoGitInfo>({ repo });
  const [lastResult, setLastResult] = useState<RepoCloudSubmitResult | null>(null);
  const [commitMessage, setCommitMessage] = useState(defaultMessages[repo]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const repoLabel = repoLabels[repo];
  const changedCount = repoInfo.changedCount ?? lastResult?.changedCount ?? 0;
  const conflictFiles = lastResult?.state === 'conflict' ? lastResult.conflictFiles ?? [] : [];

  const status = useMemo(() => {
    if (repoInfo.error) {
      return { color: 'red', text: '未连接仓库' };
    }
    if (conflictFiles.length > 0) {
      return { color: 'red', text: `${conflictFiles.length} 个冲突` };
    }
    if (repoInfo.hasChanges) {
      return { color: 'orange', text: `${changedCount} 个变更` };
    }
    return { color: 'green', text: '本地干净' };
  }, [changedCount, conflictFiles.length, repoInfo.error, repoInfo.hasChanges]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setRepoInfo(await getRepoGitInfo(repo));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  const runSubmit = async (pullBeforePush = false) => {
    setLoading(true);
    try {
      const result = await submitRepoToCloud({
        repo,
        message: commitMessage.trim() || undefined,
        pullBeforePush,
      });
      setLastResult(result);
      await refresh();

      if (result.state === 'pushed') {
        message.success(`${repoLabel} 仓库已提交并推送到云端`);
      } else if (result.state === 'clean') {
        message.info(`${repoLabel} 仓库没有需要提交的变更`);
      } else if (result.state === 'needsPull') {
        message.warning('远端已有新提交，需要先同步远端');
      } else if (result.state === 'conflict') {
        message.error('同步过程中发现冲突，请先解决冲突文件');
      } else if (result.state === 'noRemote') {
        message.error('当前仓库没有配置远端地址');
      } else if (!result.success) {
        message.error(result.error ?? '提交到云端失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const openGitPanel = async () => {
    await runRepoGitAction({ repo, action: 'openScm' });
  };

  const openFirstConflict = () => {
    const first = conflictFiles[0];
    if (first) {
      openFileInEditor(first.path);
    }
  };

  return (
    <Spin spinning={loading} tip="正在处理 Git 提交与推送...">
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div
          style={{
            border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.24))',
            borderRadius: 8,
            padding: 18,
            background: 'var(--vscode-editor-background)',
          }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
            <Space direction="vertical" size={6}>
              <Title level={4} style={{ margin: 0 }}>
                提交 {repoLabel} 到云端
              </Title>
              <Text type="secondary">
                将当前 {repoLabel} 仓库的变更提交为一次 Git commit，并推送到远端仓库。
              </Text>
            </Space>
            <Space>
              <Tag color={status.color}>{status.text}</Tag>
              <Button size="small" icon={<ReloadOutlined />} loading={refreshing} onClick={refresh}>
                刷新
              </Button>
            </Space>
          </Space>

          <Divider style={{ margin: '16px 0' }} />

          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space size={8} wrap>
              <BranchesOutlined style={{ color: accent }} />
              <Text strong>分支</Text>
              <Text>{repoInfo.branch || '未检测到分支'}</Text>
              <Text type="secondary">{repoInfo.upstream ? `跟踪 ${repoInfo.upstream}` : '未配置 upstream'}</Text>
            </Space>

            <Input.TextArea
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              rows={3}
              placeholder="填写本次提交说明"
            />

            {lastResult?.state === 'pushed' && (
              <Alert
                showIcon
                type="success"
                icon={<CheckCircleOutlined />}
                message="提交完成"
                description={lastResult.commitMessage ? `提交说明：${lastResult.commitMessage}` : undefined}
              />
            )}

            {lastResult?.state === 'clean' && (
              <Alert
                showIcon
                type="success"
                icon={<CheckCircleOutlined />}
                message="当前没有需要提交的变更"
                description={`${repoLabel} 仓库已经是最新的本地状态，没有生成新的提交。`}
              />
            )}

            {lastResult?.state === 'needsPull' && (
              <Alert
                showIcon
                type="warning"
                message="远端版本更新了"
                description="远端仓库已有新的提交。请先同步远端；如果产生冲突，DFT IDE 会列出冲突文件并引导你继续处理。"
                action={
                  <Button size="small" type="primary" onClick={() => runSubmit(true)}>
                    同步远端后继续
                  </Button>
                }
              />
            )}

            {lastResult?.state === 'noRemote' && (
              <Alert
                showIcon
                type="error"
                message="没有远端仓库"
                description="请先为当前仓库配置远端地址，或在 VS Code Git 面板中检查仓库设置。"
                action={<Button size="small" onClick={openGitPanel}>打开 Git 面板</Button>}
              />
            )}

            {lastResult?.state === 'gitOperationInProgress' && (
              <Alert
                showIcon
                type="warning"
                message="Git 操作尚未完成"
                description="当前仓库正在进行 merge、rebase 或其他 Git 操作。请在 VS Code Git 面板中完成后再继续提交。"
                action={<Button size="small" onClick={openGitPanel}>打开 Git 面板</Button>}
              />
            )}

            {conflictFiles.length > 0 && (
              <div
                style={{
                  border: '1px solid var(--vscode-inputValidation-errorBorder, #f85149)',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Alert
                    showIcon
                    type="error"
                    icon={<ExclamationCircleOutlined />}
                    message="发现冲突文件"
                    description="请逐个打开冲突文件，在 VS Code 中选择保留本地、保留远端或手动合并。解决完成后回到这里继续提交。"
                  />
                  <List
                    size="small"
                    dataSource={conflictFiles}
                    renderItem={(file) => (
                      <List.Item
                        actions={[
                          <Button
                            key="open"
                            size="small"
                            icon={<FileSearchOutlined />}
                            onClick={() => openFileInEditor(file.path)}
                          >
                            打开
                          </Button>,
                        ]}
                      >
                        <Text ellipsis={{ tooltip: file.path }}>{file.path}</Text>
                      </List.Item>
                    )}
                  />
                  <Space wrap>
                    <Button icon={<FileSearchOutlined />} onClick={openFirstConflict}>
                      打开第一个冲突
                    </Button>
                    <Button icon={<FileSyncOutlined />} onClick={openGitPanel}>
                      打开 VS Code Git
                    </Button>
                    <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => runSubmit(false)}>
                      解决后继续提交
                    </Button>
                  </Space>
                </Space>
              </div>
            )}

            {repoInfo.error && (
              <Alert showIcon type="error" message="仓库状态读取失败" description={repoInfo.error} />
            )}

            {!lastResult && !repoInfo.error && (
              <Alert
                showIcon
                type="info"
                message="提交前会自动检查仓库状态"
                description="普通变更会自动 stage、commit、push；远端更新或冲突会停下来引导处理。"
              />
            )}
          </Space>

          <Divider style={{ margin: '18px 0 14px' }} />

          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Button onClick={onPrev} icon={<LeftOutlined />}>
              返回上一步
            </Button>
            <Space wrap>
              <Button icon={<FileSyncOutlined />} onClick={openGitPanel}>
                打开 VS Code Git
              </Button>
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                disabled={Boolean(repoInfo.error)}
                onClick={() => runSubmit(false)}
              >
                提交并推送
              </Button>
            </Space>
          </Space>
        </div>
      </div>
    </Spin>
  );
};

export default RepoCloudSubmitPanel;
