import React, { useMemo, useState } from 'react';
import { Button, Input, message, Popconfirm, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { deleteExecutionHistory, ExecutionHistoryRecord } from '../../utils/ipc';

interface Props {
  history: ExecutionHistoryRecord[];
  flow: string;
  onOpenPipeline: (record: ExecutionHistoryRecord) => void;
  onDeleted: (ids: string[]) => void;
}

const statusMeta = {
  running: {
    color: 'processing',
    label: 'RUNNING',
    icon: <ClockCircleOutlined />,
  },
  success: {
    color: 'success',
    label: 'SUCCESS',
    icon: <CheckCircleOutlined />,
  },
  error: {
    color: 'error',
    label: 'ERROR',
    icon: <CloseCircleOutlined />,
  },
  cancelled: {
    color: 'warning',
    label: 'CANCELLED',
    icon: <CloseCircleOutlined />,
  },
} as const;

const getStartedAt = (record: ExecutionHistoryRecord) => record.startedAt ?? record.executedAt;
const getConfigTarget = (record: ExecutionHistoryRecord) => (
  record.mode || record.module || record.moduleKey || '-'
);
const formatTime = (timestamp?: number) => (
  timestamp ? new Date(timestamp).toLocaleString() : '-'
);

const ExecutionHistoryList: React.FC<Props> = ({ history, flow, onOpenPipeline, onDeleted }) => {
  const [configKeyword, setConfigKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExecutionHistoryRecord['status']>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [deleting, setDeleting] = useState(false);
  const dataSource = useMemo(
    () => {
      const keyword = configKeyword.trim().toLocaleLowerCase();
      return [...history]
        .filter((record) => (
          (!keyword || getConfigTarget(record).toLocaleLowerCase().includes(keyword))
          && (!statusFilter || record.status === statusFilter)
        ))
        .sort((a, b) => getStartedAt(b) - getStartedAt(a));
    },
    [configKeyword, history, statusFilter],
  );

  const handleDelete = async (ids: string[]) => {
    if (ids.length === 0 || deleting) return;
    setDeleting(true);
    try {
      const response = await deleteExecutionHistory(flow, ids);
      if (!response.success) {
        message.error(response.error || '删除执行历史失败');
        return;
      }
      onDeleted(ids);
      setSelectedRowKeys((current) => current.filter((key) => !ids.includes(String(key))));
      message.success(ids.length === 1 ? '执行历史已删除' : `已删除 ${ids.length} 条执行历史`);
    } catch (error) {
      message.error(`删除执行历史失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<ExecutionHistoryRecord> = [
    {
      title: '配置',
      key: 'configTarget',
      width: 220,
      ellipsis: true,
      render: (_, record) => getConfigTarget(record),
    },
    {
      title: '执行 ID',
      dataIndex: 'id',
      width: 220,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 130,
      render: (status: ExecutionHistoryRecord['status']) => {
        const meta = statusMeta[status] ?? statusMeta.error;
        return <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>;
      },
    },
    {
      title: '节点数',
      key: 'nodeCount',
      width: 100,
      render: (_, record) => record.nodes?.length ?? 0,
    },
    {
      title: '开始时间',
      key: 'startedAt',
      width: 240,
      render: (_, record) => formatTime(getStartedAt(record)),
    },
    {
      title: '结束时间',
      key: 'finishedAt',
      width: 240,
      render: (_, record) => formatTime(record.finishedAt),
    },
    {
      title: '查看',
      key: 'action',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => onOpenPipeline(record)}
        >
          详细
        </Button>
      ),
    },
    {
      title: '删除',
      key: 'delete',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Popconfirm
          title='删除这条执行历史？'
          description='对应的历史 JSON 和日志目录也会被删除。'
          okText='删除'
          cancelText='取消'
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete([record.id])}
        >
          <Button type='link' danger size='small' icon={<DeleteOutlined />} loading={deleting}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索配置"
          value={configKeyword}
          onChange={(event) => setConfigKeyword(event.target.value)}
          style={{ width: 240 }}
        />
        <Select<ExecutionHistoryRecord['status']>
          allowClear
          placeholder="全部状态"
          value={statusFilter}
          onChange={setStatusFilter}
          options={Object.entries(statusMeta).map(([value, meta]) => ({
            value: value as ExecutionHistoryRecord['status'],
            label: meta.label,
          }))}
          style={{ width: 160 }}
        />
        <Popconfirm
          title={`删除选中的 ${selectedRowKeys.length} 条执行历史？`}
          description='对应的历史 JSON 和日志目录也会被删除。'
          okText='批量删除'
          cancelText='取消'
          okButtonProps={{ danger: true }}
          disabled={selectedRowKeys.length === 0}
          onConfirm={() => handleDelete(selectedRowKeys.map(String))}
        >
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={selectedRowKeys.length === 0}
            loading={deleting}
          >
            批量删除{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
          </Button>
        </Popconfirm>
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={dataSource}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          showTotal: (total) => `共 ${total} 条`,
        }}
        locale={{ emptyText: '暂无历史执行记录' }}
        scroll={{ x: 1250 }}
        size="middle"
      />
    </Space>
  );
};

export default ExecutionHistoryList;
