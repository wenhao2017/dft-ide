import React, { useState } from 'react';
import { Form, Button, Typography, Tabs, Alert } from 'antd';
import { LeftOutlined, RightOutlined, CodeOutlined } from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import PathInput from '../shared/PathInput';

const { Text } = Typography;

interface Props {
  onNext: () => void;
  onPrev: () => void;
}

const TerminalUI: React.FC = () => (
  <div
    style={{
      background: '#000',
      borderRadius: 6,
      padding: 16,
      border: '1px solid #333',
      minHeight: 200,
      fontFamily: 'monospace',
      color: '#0f0',
      marginTop: 24,
    }}
  >
    <div style={{ borderBottom: '1px solid #333', paddingBottom: 8, marginBottom: 8, color: '#888' }}>
      <CodeOutlined style={{ marginRight: 8 }} /> 交互终端 (TERM)
    </div>
    <div>$ waiting for execution...</div>
    <div style={{ color: '#555', marginTop: 8 }}>_</div>
  </div>
);

const Step3Execution: React.FC<Props> = ({ onNext, onPrev }) => {
  const [activeTab, setActiveTab] = useState('gen');
  // 路径状态提升至组件顶层（Rule of Hooks）
  const gvinPath    = useVscodePath();
  const makefilePath = useVscodePath();
  const checkPath   = useVscodePath();

  const renderScriptGen = () => (
    <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }} style={{ padding: '16px 0' }}>
      <div style={{ marginBottom: 24 }}>
        <Alert message="覆盖默认配置：点击打开，可以选择自己编写的文件" type="info" showIcon />
      </div>

      <Form.Item label="gvin / make_env">
        <PathInput state={gvinPath} placeholder="路径..." showSelectFile showOpen />
      </Form.Item>

      <Form.Item label="Makefile" style={{ marginBottom: 16 }}>
        <PathInput state={makefilePath} placeholder="路径..." showSelectFile showOpen />
      </Form.Item>

      <Form.Item label="Check">
        <PathInput state={checkPath} placeholder="路径..." showSelectFile showOpen />
      </Form.Item>

      <TerminalUI />
    </Form>
  );

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="line"
        items={[
          { key: 'gen', label: '脚本生成', children: renderScriptGen() },
          { key: 'exec', label: '执行', children: <TerminalUI /> },
        ]}
      />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
        <Button onClick={onPrev} icon={<LeftOutlined />}>
          上一页
        </Button>
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </div>
  );
};

export default Step3Execution;
