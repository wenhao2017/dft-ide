import React, { useMemo } from 'react'
import {
  Descriptions,
  Drawer,
  Empty,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ExecutionHistoryRecord } from '../../utils/ipc'

interface Props {
  record: ExecutionHistoryRecord | null
  onClose: () => void
}

interface HistoryNode {
  id?: string
  name?: string
  command?: string
  description?: string
  status?: string
  attempts?: number
  startedAt?: string
  finishedAt?: string
  duration?: string
  log_files?: string[]
}

const statusColors: Record<string, string> = {
  success: 'success',
  failed: 'error',
  running: 'processing',
  stopped: 'warning',
  skipped: 'default',
  pending: 'default',
}

const columns: ColumnsType<HistoryNode> = [
  { title: '顺序', width: 64, render: (_value, _record, index) => index + 1 },
  {
    title: 'Node',
    dataIndex: 'name',
    width: 160,
    render: (value, record) => value || record.id || '-',
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    render: (value = 'pending') => (
      <Tag color={statusColors[value]}>{value.toUpperCase()}</Tag>
    ),
  },
  {
    title: '命令',
    dataIndex: 'command',
    ellipsis: true,
    render: (value) =>
      value ? <Typography.Text code>{value}</Typography.Text> : '-',
  },
  {
    title: '日志文件',
    dataIndex: 'log_files',
    width: 280,
    render: (value: string[] | undefined) => {
      const files = value ?? []
      return files.length ? (
        <div style={{ display: 'grid', gap: 4 }}>
          {files.map((logFile) => (
            <Typography.Text
              key={logFile}
              copyable
              ellipsis={{ tooltip: logFile }}
            >
              {logFile}
            </Typography.Text>
          ))}
        </div>
      ) : (
        '-'
      )
    },
  },
  {
    title: '开始',
    dataIndex: 'startedAt',
    width: 100,
    render: (value) => value || '-',
  },
  {
    title: '结束',
    dataIndex: 'finishedAt',
    width: 100,
    render: (value) => value || '-',
  },
  {
    title: '重试',
    dataIndex: 'attempts',
    width: 72,
    render: (value) => value ?? 0,
  },
]

function getNodes(record: ExecutionHistoryRecord): HistoryNode[] {
  if (Array.isArray(record.nodes)) return record.nodes as HistoryNode[]
  const snapshot = record.runtimeSnapshot as { tasks?: unknown[] } | undefined
  return Array.isArray(snapshot?.tasks) ? (snapshot.tasks as HistoryNode[]) : []
}

const ExecutionHistoryDetail: React.FC<Props> = ({ record, onClose }) => {
  const nodes = useMemo(() => (record ? getNodes(record) : []), [record])
  const counts = useMemo(
    () =>
      nodes.reduce<Record<string, number>>((result, node) => {
        const status = node.status || 'pending'
        result[status] = (result[status] || 0) + 1
        return result
      }, {}),
    [nodes],
  )
  const duration =
    record?.startedAt && record.finishedAt
      ? `${Math.max(0, record.finishedAt - record.startedAt)} ms`
      : '-'

  return (
    <Drawer
      title="执行记录详情"
      open={!!record}
      onClose={onClose}
      width="88%"
      destroyOnClose
    >
      {record ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 280px',
            gap: 20,
          }}
        >
          <div>
            {nodes.length ? (
              <Table
                rowKey={(node, index) => node.id || `${index}`}
                columns={columns}
                dataSource={nodes}
                pagination={false}
                scroll={{ x: 1180 }}
                size="middle"
              />
            ) : (
              <Empty description="没有 Node 执行信息" />
            )}
          </div>
          <div
            style={{
              borderLeft: '1px solid var(--vscode-panel-border)',
              paddingLeft: 20,
            }}
          >
            <Typography.Title level={5}>信息统计</Typography.Title>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                marginBottom: 24,
              }}
            >
              <Statistic title="Node 总数" value={nodes.length} />
              <Statistic
                title="成功"
                value={counts.success || 0}
                valueStyle={{ color: '#52c41a' }}
              />
              <Statistic
                title="失败"
                value={counts.failed || 0}
                valueStyle={{ color: '#ff4d4f' }}
              />
              <Statistic
                title="停止"
                value={counts.stopped || 0}
                valueStyle={{ color: '#faad14' }}
              />
              <Statistic title="跳过" value={counts.skipped || 0} />
              <Statistic
                title="运行中"
                value={counts.running || 0}
                valueStyle={{ color: '#1677ff' }}
              />
            </div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="执行 ID">{record.id}</Descriptions.Item>
              <Descriptions.Item label={record.mode ? 'Mode' : 'Module'}>
                {record.mode || record.module || record.moduleKey || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColors[record.status]}>
                  {record.status.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {new Date(
                  record.startedAt || record.executedAt,
                ).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="耗时">{duration}</Descriptions.Item>
              <Descriptions.Item label="日志目录">
                <Typography.Text copyable style={{ wordBreak: 'break-all' }}>
                  {record.log_path || record.logDirectory || '-'}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      ) : null}
    </Drawer>
  )
}

export default ExecutionHistoryDetail
