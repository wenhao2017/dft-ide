import React from 'react';
import { Badge, Typography } from 'antd';
import { CodeOutlined } from '@ant-design/icons';

const { Text } = Typography;

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

export interface ExecutionLogPanelProps {
  title: string;
  logs: string[];
  status?: ExecutionStatus;
  minHeight?: number;
}

const statusText: Record<ExecutionStatus, React.ReactNode> = {
  idle: <Text type="secondary">Idle</Text>,
  running: <Text type="secondary">Running</Text>,
  success: <Text type="secondary">Finished</Text>,
  error: <Text type="secondary">Failed</Text>,
  cancelled: <Text type="secondary">Stopped</Text>,
};

const badgeStatus: Record<ExecutionStatus, 'default' | 'processing' | 'success' | 'error' | 'warning'> = {
  idle: 'default',
  running: 'processing',
  success: 'success',
  error: 'error',
  cancelled: 'warning',
};

const getLogColor = (log: string) => {
  if (log.includes('[ERROR]')) return '#f14c4c';
  if (log.includes('[WARN]')) return '#cca700';
  if (log.includes('[INFO]')) return '#3794ff';
  if (log.includes('OK') || log.includes('passed') || log.includes('success')) return '#89d185';
  if (log.startsWith('$')) return '#569cd6';
  return '#d4d4d4';
};

const ExecutionLogPanel: React.FC<ExecutionLogPanelProps> = ({
  title,
  logs,
  status = 'idle',
  minHeight = 220,
}) => (
  <div
    style={{
      background: '#1e1e1e',
      borderRadius: 8,
      padding: 16,
      minHeight,
      maxHeight: 420,
      overflowY: 'auto',
      fontFamily: "'Fira Code', Consolas, monospace",
      fontSize: 13,
      color: '#d4d4d4',
      border: '1px solid #333',
      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
    }}
  >
    <div
      style={{
        borderBottom: '1px solid #333',
        paddingBottom: 8,
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span><CodeOutlined style={{ marginRight: 8 }} /> {title}</span>
      <Badge status={badgeStatus[status]} text={statusText[status]} />
    </div>

    {logs.length === 0 ? (
      <div style={{ color: '#888' }}>[INFO] 尚未捕获执行日志。请在 VS Code 终端中运行任务后，从结果文件或历史记录加载日志。</div>
    ) : (
      logs.map((log, index) => (
        <div key={`${index}-${log}`} style={{ color: getLogColor(log), marginBottom: 4, lineHeight: '1.5' }}>
          {log}
        </div>
      ))
    )}
  </div>
);

export default ExecutionLogPanel;
