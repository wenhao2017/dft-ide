import React from 'react';
import { Tabs, Button, Alert, Space, Typography } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  LineChartOutlined,
} from '@ant-design/icons';

const { Link } = Typography;

const Step4Result: React.FC<{ onNext: () => void; onPrev: () => void }> = ({ onNext, onPrev }) => {
  const renderSimResult = () => (
    <div style={{ marginTop: 16 }}>
      <Alert
        message="SIM 执行完成，无 Error 产生"
        type="success"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Space size="large" style={{ marginBottom: 24 }}>
        <Button icon={<LineChartOutlined />}>查看波形</Button>
        <Link>
          <CodeOutlined /> sim/vcs.log
        </Link>
        <Link>
          <CodeOutlined /> sim/verdi.log
        </Link>
      </Space>
      <div
        style={{
          background: '#000',
          borderRadius: 6,
          padding: 16,
          minHeight: 200,
          fontFamily: 'monospace',
          color: '#ccc',
          border: '1px solid #333',
        }}
      >
        <div
          style={{
            borderBottom: '1px solid #333',
            paddingBottom: 8,
            marginBottom: 8,
            color: '#888',
          }}
        >
          <CodeOutlined style={{ marginRight: 8 }} /> 交互终端 (TERM)
        </div>
        <div>[INFO] Simulation finished successfully.</div>
        <div style={{ color: '#4ade80' }}>[INFO] Coverage: 98.5%</div>
        <div style={{ color: '#4ade80' }}>[INFO] All assertions passed.</div>
      </div>
    </div>
  );

  return (
    <div>
      <Tabs
        type="line"
        items={[
          {
            key: 'plan',
            label: 'PLAN',
            children: <Alert message="PLAN 检查通过" type="success" style={{ marginTop: 16 }} />,
          },
          {
            key: 'env',
            label: 'ENV',
            children: <Alert message="ENV 检查通过" type="success" style={{ marginTop: 16 }} />,
          },
          { key: 'sim', label: 'SIM', children: renderSimResult() },
          {
            key: 'atpg',
            label: 'ATPG',
            children: <Alert message="ATPG 未执行" type="info" style={{ marginTop: 16 }} />,
          },
        ]}
      />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32 }}>
        <Button onClick={onPrev} icon={<LeftOutlined />}>
          上一页
        </Button>
        <Button icon={<CheckCircleOutlined />}>提交验证结果</Button>
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </div>
  );
};

export default Step4Result;
