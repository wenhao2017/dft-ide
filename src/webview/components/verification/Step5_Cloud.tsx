import React from 'react';
import { Button, Typography, Empty } from 'antd';
import { LeftOutlined, CloudSyncOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const Step5Cloud: React.FC<{ onPrev: () => void }> = ({ onPrev }) => {
  return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <Empty
        image={<CloudSyncOutlined style={{ fontSize: 64, color: '#1677ff' }} />}
        description={
          <div>
            <Title level={4}>端云协同</Title>
            <Text type="secondary">该功能在当前版本暂未实现，敬请期待。</Text>
          </div>
        }
      />
      <div style={{ marginTop: 40 }}>
        <Button onClick={onPrev} icon={<LeftOutlined />}>
          返回上一页
        </Button>
      </div>
    </div>
  );
};

export default Step5Cloud;
