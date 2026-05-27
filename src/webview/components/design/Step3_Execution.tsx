import React, { useState } from 'react';
import { Button, Card, Divider, Space, Tag, Typography } from 'antd';
import { FullscreenOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import PipelineRuntimeView from '../shared/PipelineRuntimeView';

const { Text } = Typography;

interface Props {
  onNext: () => void;
  onPrev: () => void;
}

const Step3Execution: React.FC<Props> = ({ onNext, onPrev }) => {
  const [runtimeOpen, setRuntimeOpen] = useState(false);

  return (
    <div>
      <Card
        size="small"
        title="流水线执行"
        extra={<Tag color="processing">VS Code 终端运行</Tag>}
        style={{ borderRadius: 8 }}
      >
        <Space direction="vertical" size={12}>
          <Text type="secondary">点击后只打开流水线运行页；进入运行页后再启动终端执行。</Text>
          <Button
            type="primary"
            size="middle"
            icon={<FullscreenOutlined />}
            onClick={() => setRuntimeOpen(true)}
          >
            打开流水线
          </Button>
        </Space>
      </Card>

      {runtimeOpen && (
        <PipelineRuntimeView
          flowLabel="设计"
          onClose={() => setRuntimeOpen(false)}
        />
      )}

      <Divider style={{ margin: '18px 0 14px' }} />
      <Space style={{ width: '100%', justifyContent: 'flex-end' }} wrap>
        <Button onClick={onPrev} icon={<LeftOutlined />}>
          上一页
        </Button>
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </Space>
    </div>
  );
};

export default Step3Execution;
