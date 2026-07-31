import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { fetchTransformLogs, openFileReadonly, type TransformLog } from '../../utils/ipc';
import { ColumnsType } from 'antd/es/table';

const { Link } = Typography;

interface Props {
  flowKey: string;
  historyOpen: boolean;
}

function getColumns(flowKey: string): ColumnsType<TransformLog> {
  return flowKey == 'verification' ? [
    { title: '#', width: 48, render: (_value, _record, index) => index + 1 },
    {
      title: '状态',
      dataIndex: 'success',
      width: 90,
      render: (_value: boolean | undefined) => (
        <Tag color={_value ? 'success' : 'error'}>{_value ? '成功' : '失败'}</Tag>
      ),
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      width: 180,
      render: (_value: string | undefined) => _value ?? '-',
    },
    {
      title: 'Stage',
      width: 150,
      dataIndex: 'stage',
      render: (_value: unknown, record) => record.stage ?? '-'
    },
    {
      title: '所属领域',
      width: 150,
      dataIndex: 'domain',
      render: (_value: string | undefined) => _value,
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
      title: 'LANDER_ASSISTANT.json',
      dataIndex: 'landerAssistant',
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
  ] : [
      { title: '#', width: 48, render: (_value, _record, index) => index + 1 },
      {
        title: '状态',
        dataIndex: 'success',
        width: 90,
        render: (_value: boolean | undefined) => (
          <Tag color={_value ? 'success' : 'error'}>{_value ? '成功' : '失败'}</Tag>
        ),
      },
      {
        title: '时间',
        dataIndex: 'timestamp',
        width: 180,
        render: (_value: string | undefined) => _value ?? '-',
      },
      {
        title: 'Module',
        dataIndex: 'module',
        width: 150,
        ellipsis: true,
        render: (_value: string | undefined) => _value ?? '-',
      },
      {
        title: '所属领域',
        width: 150,
        dataIndex: 'domain',
        render: (_value: string | undefined) => _value,
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
    ]
}

const TransformHistory: React.FC<Props> = ({ flowKey, historyOpen }) => {
  const [logs, setLogs] = useState<TransformLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => getColumns(flowKey), [flowKey])

  const loadLogs = async () => {
    if (!['hibist', 'sailor', 'verification'].includes(flowKey)) {
      setLogs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTransformLogs(
        flowKey as 'hibist' | 'sailor' | 'verification'
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
    if (historyOpen) {
      loadLogs();
    } else {
      setLogs([]);
    }
  }, [flowKey, historyOpen]);

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
        rowKey={record => `${record.flow}-${record.timemilles ?? record.timestamp}`}
        loading={loading}
        dataSource={logs}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史记录" /> }}
        pagination={{ pageSize: 6, size: 'small' }}
        columns={columns}
      />
    </Space>
  );
};

export default TransformHistory;
