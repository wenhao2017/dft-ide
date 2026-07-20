import React, { useEffect, useState } from 'react';
import { Alert, Button, Empty, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { fetchTransformLogs, openFileReadonly, type TransformLog } from '../../utils/ipc';

const { Link } = Typography;

interface Props {
  flowKey: string;
  stage?: string;
}

const TransformHistory: React.FC<Props> = ({ flowKey, stage }) => {
  const [logs, setLogs] = useState<TransformLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    if (!['hibist', 'sailor', 'verification'].includes(flowKey)) {
      setLogs([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchTransformLogs(
        flowKey as 'hibist' | 'sailor' | 'verification',
        stage
      );
      if (!result.success) {
        setError('读取历史记录失败');
        setLogs([]);
        return;
      }
      setLogs(Array.isArray(result.history) ? result.history : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, [flowKey, stage]);

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={loadLogs}>
          刷新
        </Button>
      </div>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Table
        size="small"
        rowKey={(record, index) => `${record.flow}-${record.timemilles ?? record.timestamp ?? index}`}
        loading={loading}
        dataSource={logs}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史记录" /> }}
        pagination={{ pageSize: 6, size: 'small' }}
        columns={[
          {
            title: '状态',
            dataIndex: 'success',
            width: 90,
            render: (success: boolean | undefined) => (
              <Tag color={success ? 'success' : 'error'}>{success ? '成功' : '失败'}</Tag>
            ),
          },
          {
            title: '时间',
            dataIndex: 'timestamp',
            width: 180,
            render: (_value: string | undefined, record) => record.timestamp ?? '-',
          },
          {
            title: 'Module / Stage',
            width: 150,
            render: (_value: unknown, record) => record.module ?? record.stage ?? '-',
          },
          {
            title: '执行脚本',
            dataIndex: 'scriptPath',
            ellipsis: true,
            render: (value?: string) => value
              ? <Link onClick={() => openFileReadonly(value)}>{value}</Link>
              : '-',
          },
          {
            title: 'Design Tree',
            dataIndex: 'designTree',
            ellipsis: true,
            render: (value?: string) => value
              ? <Link onClick={() => openFileReadonly(value)}>{value}</Link>
              : '-',
          },
          {
            title: '归一化表格',
            dataIndex: 'normTable',
            ellipsis: true,
            render: (value?: string) => value
              ? <Link onClick={() => openFileReadonly(value)}>{value}</Link>
              : '-',
          },
          {
            title: '日志',
            dataIndex: 'logFile',
            ellipsis: true,
            render: (value?: string) => value
              ? <Link onClick={() => openFileReadonly(value)}>{value}</Link>
              : '-',
          },
        ]}
      />
    </Space>
  );
};

export default TransformHistory;
