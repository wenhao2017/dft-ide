import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, List, Popconfirm, Space, Steps, Tag, Typography, message } from 'antd';
import { FileExcelOutlined, FileTextOutlined, MergeCellsOutlined } from '@ant-design/icons';
import {
  abortGuidedRepoSync,
  completeGuidedRepoSync,
  getGuidedRepoSyncStatus,
  GuidedConflictStatus,
  openNextGuidedConflict,
  RepoKey,
  resolveGuidedSpreadsheetConflict,
} from '../../utils/ipc';

const { Text } = Typography;

interface Props {
  initialStatus: GuidedConflictStatus;
  canManageData: boolean;
  onStatusChange: (status: GuidedConflictStatus) => void;
  onFinished: () => void;
}

const repoLabels: Record<RepoKey, string> = {
  data: 'Data 公共仓库',
  hibist: 'Hibist 仓库',
  sailor: 'Sailor 仓库',
  verification: 'Verification 仓库',
};

const GuidedConflictPanel: React.FC<Props> = ({ initialStatus, canManageData, onStatusChange, onFinished }) => {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  const updateStatus = (next: GuidedConflictStatus) => {
    setStatus(next);
    onStatusChange(next);
  };

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (status.phase !== 'resolving') return;
    const timer = window.setInterval(() => {
      void getGuidedRepoSyncStatus(status.repo).then((result) => {
        if (result.success && result.status) updateStatus(result.status);
      });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [status.repo, status.phase]);

  const currentStep = useMemo(() => {
    if (status.phase === 'completed') return 5;
    if (status.phase === 'readyToUpload') return 4;
    return 3;
  }, [status.phase]);

  const run = async (task: () => Promise<{ success: boolean; status?: GuidedConflictStatus; error?: string }>) => {
    setBusy(true);
    try {
      const result = await task();
      if (!result.success || !result.status) {
        message.error(result.error ?? '操作失败，请稍后重试');
        return;
      }
      updateStatus(result.status);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    await run(async () => {
      const result = await completeGuidedRepoSync(status.repo, canManageData);
      if (result.success) {
        message.success(`${repoLabels[status.repo]}的合并结果已上传`);
        window.setTimeout(onFinished, 800);
      }
      return result;
    });
  };

  const abort = async () => {
    await run(async () => {
      const result = await abortGuidedRepoSync(status.repo);
      if (result.success && result.status?.phase === 'aborted') {
        message.info('已放弃本次合并，本地修改仍然保留');
        window.setTimeout(onFinished, 500);
      }
      return result;
    });
  };

  return (
    <Card
      size="small"
      title={<Space><MergeCellsOutlined /><span>正在处理 {repoLabels[status.repo]} 的本地和云端修改</span></Space>}
      style={{ marginBottom: 14, borderColor: 'var(--vscode-editorWarning-foreground, #d4a72c)' }}
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Steps
          size="small"
          current={currentStep}
          items={[
            { title: '检查本地修改' },
            { title: '保护本地内容' },
            { title: '获取云端内容' },
            { title: '处理重叠修改' },
            { title: '完成合并' },
            { title: '上传结果' },
          ]}
        />

        <Alert
          showIcon
          type={status.phase === 'readyToUpload' || status.phase === 'completed' ? 'success' : 'warning'}
          message={status.message}
          description={status.phase === 'resolving'
            ? '点击“处理下一个文件”后，插件会打开 VS Code 修改面板和对应文件。文本文件在编辑器中处理，Excel 文件可在下方选择保留哪个版本。'
            : undefined}
        />

        {status.conflicts.length > 0 && (
          <List
            size="small"
            bordered
            dataSource={status.conflicts}
            renderItem={(item) => (
              <List.Item
                actions={item.spreadsheet ? [
                  <Popconfirm
                    key="local"
                    title="确认保留本地 Excel？"
                    description="云端对这个文件的修改将不会保留。"
                    onConfirm={() => run(() => resolveGuidedSpreadsheetConflict(status.repo, item.path, 'local'))}
                  >
                    <Button size="small">保留本地版本</Button>
                  </Popconfirm>,
                  <Popconfirm
                    key="cloud"
                    title="确认使用云端 Excel？"
                    description="本地对这个文件的修改将被云端版本替换。"
                    onConfirm={() => run(() => resolveGuidedSpreadsheetConflict(status.repo, item.path, 'cloud'))}
                  >
                    <Button size="small">使用云端版本</Button>
                  </Popconfirm>,
                ] : undefined}
              >
                <List.Item.Meta
                  avatar={item.spreadsheet ? <FileExcelOutlined /> : <FileTextOutlined />}
                  title={<Text>{item.name}</Text>}
                  description={item.spreadsheet ? <Tag color="gold">Excel 文件，需要选择版本</Tag> : '在 VS Code 编辑器中确认本地和云端内容'}
                />
              </List.Item>
            )}
          />
        )}

        <Space wrap>
          {status.phase === 'resolving' && (
            <Button type="primary" loading={busy} onClick={() => run(() => openNextGuidedConflict(status.repo))}>
              处理下一个文件
            </Button>
          )}
          {status.phase === 'readyToUpload' && (
            <Button type="primary" loading={busy} onClick={finish}>完成合并并上传</Button>
          )}
          <Button onClick={() => run(() => openNextGuidedConflict(status.repo))}>查看修改详情</Button>
          {status.phase === 'resolving' && (
            <Button danger disabled={busy} onClick={abort}>放弃本次合并</Button>
          )}
        </Space>
      </Space>
    </Card>
  );
};

export default GuidedConflictPanel;
