import React from 'react';
import { Space, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, CodeOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons';

const { Text } = Typography;

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

export interface ExecutionLogPanelProps {
  title: string;
  logs: string[];
  status?: ExecutionStatus;
  minHeight?: number;
}

const getEventIcon = (log: string): { icon: React.ReactNode; color: string } => {
  if (log.includes('[ERROR]')) return { icon: <CloseCircleOutlined />, color: '#cf1322' };
  if (log.includes('[WARN]')) return { icon: <WarningOutlined />, color: '#d48806' };
  if (log.includes('已发送') || log.includes('success')) return { icon: <CheckCircleOutlined />, color: '#389e0d' };
  return { icon: <InfoCircleOutlined />, color: '#1677ff' };
};

const stripPrefix = (log: string): string => log.replace(/^\[(INFO|WARN|ERROR)\]\s*/, '');

const ExecutionLogPanel: React.FC<ExecutionLogPanelProps> = ({
  title,
  logs,
  minHeight = 128,
}) => {
  const commandLogs = logs.filter((log) => log.startsWith('$'));
  const eventLogs = logs.filter((log) => !log.startsWith('$'));
  const latestCommand = commandLogs[commandLogs.length - 1]?.slice(2);

  return (
    <section
      style={{
        border: '1px solid var(--vscode-panel-border, #e5e7eb)',
        borderRadius: 8,
        padding: 16,
        minHeight,
        background: 'color-mix(in srgb, var(--vscode-editor-background, #fff) 96%, var(--vscode-focusBorder, #1677ff))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <CodeOutlined style={{ color: 'var(--vscode-textLink-foreground, #1677ff)' }} />
        <Text strong>{title}</Text>
      </div>

      {latestCommand && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--vscode-input-border, #d9d9d9)',
            borderRadius: 6,
            padding: '6px 10px',
            marginBottom: 12,
            background: 'var(--vscode-input-background, #fff)',
          }}
        >
          <Text type="secondary">Command</Text>
          <Text code>{latestCommand}</Text>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {eventLogs.length === 0 ? (
          <Text type="secondary">尚未发送执行请求。</Text>
        ) : (
          eventLogs.map((log, index) => {
            const event = getEventIcon(log);
            return (
              <Space key={`${index}-${log}`} size={8} align="start">
                <span style={{ color: event.color, lineHeight: '22px' }}>{event.icon}</span>
                <Text>{stripPrefix(log)}</Text>
              </Space>
            );
          })
        )}
      </div>
    </section>
  );
};

export default ExecutionLogPanel;
