import React from 'react';
import { Drawer, List, Typography, Tag, Empty } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, RightOutlined } from '@ant-design/icons';
import { ExecutionHistoryRecord } from '../../utils/ipc';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  history: ExecutionHistoryRecord[];
  onSelect: (record: ExecutionHistoryRecord) => void;
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

const ExecutionHistoryList: React.FC<Props> = ({ open, onClose, history, onSelect }) => (
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
      <List
        itemLayout="horizontal"
        rowKey="id"
        dataSource={history}
        renderItem={(item) => {
          const meta = statusMeta[item.status] ?? statusMeta.error;
          return (
            <List.Item
              style={{ padding: '16px 24px', cursor: 'pointer', transition: 'background 0.2s' }}
              onMouseEnter={(event) => (event.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
              onClick={() => {
                onSelect(item);
                onClose();
              }}
              actions={[<RightOutlined key="open" style={{ color: '#888' }} />]}
            >
              <List.Item.Meta
                avatar={meta.icon}
                title={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <Text strong>{new Date(item.executedAt).toLocaleString()}</Text>
                    <Tag color={meta.color}>{meta.label}</Tag>
                  </div>
                }
                description={
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', color: '#888', fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} /> 包含 {item.logs?.length || 0} 条日志
                  </div>
                }
              />
            </List.Item>
          );
        }}
      />
    )}
  </Drawer>
);

export default ExecutionHistoryList;
