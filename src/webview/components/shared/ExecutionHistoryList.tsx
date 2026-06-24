import React from 'react';
import { Button, Drawer, Empty, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FullscreenOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { ExecutionHistoryRecord } from '../../utils/ipc';
import VirtualList from './VirtualList';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  history: ExecutionHistoryRecord[];
  onSelect: (record: ExecutionHistoryRecord) => void;
  onOpenPipeline?: (record: ExecutionHistoryRecord) => void;
}

const statusMeta = {
  success: {
    color: 'success',
    label: 'SUCCESS',
    icon: <CheckCircleOutlined style={{ fontSize: 24, color: '#4ade80' }} />,
  },
  error: {
    color: 'error',
    label: 'ERROR',
    icon: <CloseCircleOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />,
  },
  cancelled: {
    color: 'warning',
    label: 'CANCELLED',
    icon: <CloseCircleOutlined style={{ fontSize: 24, color: '#faad14' }} />,
  },
} as const;

const ExecutionHistoryList: React.FC<Props> = ({ open, onClose, history, onSelect, onOpenPipeline }) => (
  <Drawer
    title="历史执行记录"
    placement="right"
    onClose={onClose}
    open={open}
    width={400}
    styles={{ body: { padding: 0 } }}
  >
    {history.length === 0 ? (
      <Empty description="暂无历史执行记录" style={{ marginTop: 60 }} />
    ) : (
      <VirtualList
        items={history}
        estimateSize={94}
        height="100%"
        getKey={(item) => item.id}
        renderItem={(item) => {
          const meta = statusMeta[item.status] ?? statusMeta.error;
          return (
            <div
              style={{
                borderBottom: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
                cursor: 'pointer',
                padding: '16px 24px',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(event) => (event.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
              onClick={() => {
                onSelect(item);
                onClose();
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: '0 0 auto' }}>{meta.icon}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <Text strong>{new Date(item.executedAt).toLocaleString()}</Text>
                    <Tag color={meta.color}>{meta.label}</Tag>
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', color: '#888', fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} /> 包含 {item.logs?.length || 0} 条日志
                  </div>
                </div>
                {item.runtimeSnapshot && onOpenPipeline ? (
                  <Button
                    size="small"
                    type="text"
                    icon={<FullscreenOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenPipeline(item);
                      onClose();
                    }}
                  >
                    打开流水线
                  </Button>
                ) : null}
                <RightOutlined style={{ color: '#888' }} />
              </div>
            </div>
          );
        }}
      />
    )}
  </Drawer>
);

export default ExecutionHistoryList;
