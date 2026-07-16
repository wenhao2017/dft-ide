import React, { useEffect, useState } from 'react';
import { Alert, Button, Empty, Space, Table, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { fetchDefaultConfigLogs, DefaultConfigLog, openFileReadonly } from '../../utils/ipc';
import Link from 'antd/es/typography/Link';

interface Props {
  flowKey: string;
}

const DefaultConfgHistory: React.FC<Props> = ({ flowKey }) => {
  const [history, setHistory] = useState<DefaultConfigLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    if (!['hibist', 'sailor', 'verification'].includes(flowKey)) {
      setHistory([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchDefaultConfigLogs(flowKey as 'hibist' | 'sailor' | 'verification');
      if (!result.success) {
        setError('读取历史记录失败');
        setHistory([]);
        return;
      }
      setHistory(Array.isArray(result.history) ? result.history : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [flowKey]);

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={loadHistory}>
          刷新
        </Button>
      </div>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Table
        size="small"
        rowKey={(record, index) => `${record.flow}-${record.timemilles ?? record.timestamp ?? record.time ?? index}`}
        loading={loading}
        dataSource={history}
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
            render: (_value: string | undefined, record) => record.timestamp ?? record.time ?? '-',
          },
          {
            title: '执行脚本',
            dataIndex: 'scriptPath',
            ellipsis: true,
            render: (value: string) => {
              return (
                <Link onClick={() => openFileReadonly(value)}>{value}</Link>
              );
            },
          },
          {
            title: 'Design Tree',
            dataIndex: 'designTree',
            ellipsis: true,
            render: (value: string) => {
              return (
                <Link onClick={() => openFileReadonly(value)}>{value}</Link>
              );
            },
          },
          {
            title: '归一化表格',
            dataIndex: 'normTable',
            ellipsis: true,
            render: (value: string) => {
              return (
                <Link onClick={() => openFileReadonly(value)}>{value}</Link>
              );
            },
          },
          {
            title: '日志',
            dataIndex: 'logFile',
            ellipsis: true,
            render: (value: string) => {
              return (
                <Link onClick={() => openFileReadonly(value)}>{value}</Link>
              );
            },
          },
        ]}
      />
    </Space>
  );
};

export default DefaultConfgHistory;
