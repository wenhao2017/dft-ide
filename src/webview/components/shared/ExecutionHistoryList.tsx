import React, { useMemo } from 'react';
import { Button, Input, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { ExecutionHistoryRecord } from '../../utils/ipc';

interface Props {
  history: ExecutionHistoryRecord[];
  onOpenPipeline: (record: ExecutionHistoryRecord) => void;
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

const ExecutionHistoryList: React.FC<Props> = ({ history, onOpenPipeline }) => {
  const dataSource = useMemo(
    () => [...history].sort((a, b) => getStartedAt(b) - getStartedAt(a)),
    [history],
  );

  const columns: ColumnsType<ExecutionHistoryRecord> = [
    {
      title: '配置',
      key: 'configTarget',
      width: 220,
      ellipsis: true,
      render: (_, record) => getConfigTarget(record),
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm }) => (
        <div style={{ padding: 8 }}>
          <Input.Search
            allowClear
            autoFocus
            size='small'
            placeholder='搜索配置'
            value={selectedKeys[0] ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedKeys(value ? [value] : []);
              if (!value) {
                confirm();
              }
            }}
            onPressEnter={() => confirm()}
            onSearch={() => confirm()}
            style={{ width: 200 }}
          />
        </div>
      ),
      filterIcon: (filtered) => (
        <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />
      ),
      onFilter: (value, record) => getConfigTarget(record)
        .toLocaleLowerCase()
        .includes(String(value).trim().toLocaleLowerCase()),
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
      render: (_, record) => new Date(getStartedAt(record)).toLocaleString(),
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
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={dataSource}
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50],
        showTotal: (total) => `共 ${total} 条`,
      }}
      locale={{ emptyText: '暂无历史执行记录' }}
      scroll={{ x: 1010 }}
      size="middle"
    />
  );
};

export default ExecutionHistoryList;
