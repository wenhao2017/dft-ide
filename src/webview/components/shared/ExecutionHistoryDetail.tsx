import React, { useMemo } from 'react'
import {
  Descriptions,
  Modal,
  Empty,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FileTextOutlined } from '@ant-design/icons'
import { ExecutionHistoryRecord, openFileInEditor } from '../../utils/ipc'

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
  startedAt?: string
  finishedAt?: string
  duration?: string
  log_files?: string[]
}

const statusColors: Record<string, string> = {
  success: 'success',
  error: 'error',
  failed: 'error',
  cancelled: 'warning',
  running: 'processing',
  stopped: 'warning',
  skipped: 'default',
  pending: 'default',
}

function resolveLogFilePath(logDirectory: string, logFile: string): string {
  if (/^(?:[a-zA-Z]:[\\/]|[\\/]{2}|\/)/.test(logFile)) return logFile
  const separator = logDirectory.includes('\\') ? '\\' : '/'
  return `${logDirectory.replace(/[\\/]+$/, '')}${separator}${logFile.replace(/^[\\/]+/, '')}`
}

function formatDuration(startedAt?: number, finishedAt?: number): string {
  if (!startedAt || !finishedAt) return '-'
  const milliseconds = Math.max(0, finishedAt - startedAt)
  if (milliseconds < 1000) return `${milliseconds} ms`
  const seconds = Math.floor(milliseconds / 1000)
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

function getColumns(logDirectory: string): ColumnsType<HistoryNode> {
  return [
  { title: '#', width: 48, render: (_value, _record, index) => index + 1 },
  {
    title: '节点',
    dataIndex: 'name',
    width: 150,
    ellipsis: true,
    render: (value, record) => value || record.id || '-',
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 94,
    render: (value = 'pending') => (
      <Tag color={statusColors[value]} style={{ marginInlineEnd: 0 }}>
        {value.toUpperCase()}
      </Tag>
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
    title: 'Log file',
    dataIndex: 'log_files',
    width: 230,
    render: (value: string[] | undefined) => {
      const files = value ?? []
      return files.length ? (
        <div style={{ display: 'grid', gap: 2 }}>
          {files.map((logFile) => (
            <Typography.Link
              key={logFile}
              ellipsis
              title={`打开 ${logFile}`}
              onClick={() =>
                openFileInEditor(
                  logDirectory ? resolveLogFilePath(logDirectory, logFile) : logFile,
                )
              }
            >
              <FileTextOutlined style={{ marginRight: 5 }} />
              {logFile}
            </Typography.Link>
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
  ]
}

function getNodes(record: ExecutionHistoryRecord): HistoryNode[] {
  if (Array.isArray(record.nodes)) return record.nodes as HistoryNode[]
  const snapshot = record.runtimeSnapshot as { tasks?: unknown[] } | undefined
  return Array.isArray(snapshot?.tasks) ? (snapshot.tasks as HistoryNode[]) : []
}

const ExecutionHistoryDetail: React.FC<Props> = ({ record, onClose }) => {
  const nodes = useMemo(() => (record ? getNodes(record) : []), [record])
  const logDirectory = record?.log_path || record?.logDirectory || ''
  const columns = useMemo(() => getColumns(logDirectory), [logDirectory])
  const counts = useMemo(
    () =>
      nodes.reduce<Record<string, number>>((result, node) => {
        const status = node.status || 'pending'
        result[status] = (result[status] || 0) + 1
        return result
      }, {}),
    [nodes],
  )
  const duration = formatDuration(record?.startedAt, record?.finishedAt)
  const statistics = [
    { title: '节点总数', value: nodes.length },
    { title: '成功', value: counts.success || 0, color: '#52c41a' },
    { title: '失败', value: (counts.failed || 0) + (counts.error || 0), color: '#ff4d4f' },
    { title: '运行中', value: counts.running || 0, color: '#1677ff' },
    { title: '停止', value: (counts.stopped || 0) + (counts.cancelled || 0), color: '#faad14' },
    { title: '跳过', value: counts.skipped || 0 },
  ]

  return (
    <Modal
      title="执行记录详情"
      open={!!record}
      onCancel={onClose}
      footer={null}
      width="90vw"
      centered
      destroyOnClose
      styles={{
        body: {
          maxHeight: 'calc(88vh - 92px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingTop: 12,
        },
      }}
    >
      {record ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: 6,
              padding: '10px 12px',
            }}
          >
            <Descriptions size="small" column={5} colon={false}>
              <Descriptions.Item label="执行 ID">{record.id}</Descriptions.Item>
              <Descriptions.Item label={record.mode ? 'Mode' : 'Module'}>
                {record.mode || record.module || record.moduleKey || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColors[record.status]} style={{ marginInlineEnd: 0 }}>
                  {record.status.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {new Date(record.startedAt || record.executedAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="耗时">{duration}</Descriptions.Item>
              <Descriptions.Item label="日志目录" span={5}>
                <Typography.Text copyable ellipsis={{ tooltip: logDirectory }}>
                  {logDirectory || '-'}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(90px, 1fr))',
                borderTop: '1px solid var(--vscode-panel-border)',
                marginTop: 8,
                paddingTop: 8,
              }}
            >
              {statistics.map((item, index) => (
                <div
                  key={item.title}
                  style={{
                    padding: '0 12px',
                    borderLeft:
                      index > 0 ? '1px solid var(--vscode-panel-border)' : undefined,
                  }}
                >
                  <Statistic
                    title={item.title}
                    value={item.value}
                    valueStyle={{ color: item.color, fontSize: 20, lineHeight: 1.2 }}
                  />
                </div>
              ))}
            </div>
          </div>
          <Typography.Text strong>节点详情（{nodes.length}）</Typography.Text>
          <div>
            {nodes.length ? (
              <Table
                rowKey={(node, index) => node.id || `${index}`}
                columns={columns}
                dataSource={nodes}
                pagination={false}
                scroll={{ x: 1050 }}
                size="small"
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有节点执行信息" />
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

export default ExecutionHistoryDetail
