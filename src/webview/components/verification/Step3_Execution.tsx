import React from 'react';
import { Tabs, Form, Input, Button, Radio, Row, Col } from 'antd';
import { LeftOutlined, RightOutlined, CodeOutlined } from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import PathInput from '../shared/PathInput';

const TerminalUI: React.FC = () => (
  <div
    style={{
      background: '#000',
      borderRadius: 6,
      padding: 16,
      minHeight: 150,
      fontFamily: 'monospace',
      color: '#0f0',
      marginTop: 16,
      border: '1px solid #333',
    }}
  >
    <div style={{ borderBottom: '1px solid #333', paddingBottom: 8, marginBottom: 8, color: '#888' }}>
      <CodeOutlined style={{ marginRight: 8 }} /> 交互终端 (TERM)
    </div>
    <div>$ ready...</div>
    <div style={{ color: '#555', marginTop: 8 }}>_</div>
  </div>
);

const Step3Execution: React.FC<{ onNext: () => void; onPrev: () => void }> = ({
  onNext,
  onPrev,
}) => {
  // 所有路径状态提升至组件顶层（Rule of Hooks）
  const headerCfg  = useVscodePath();
  const envCfg     = useVscodePath();
  const testcase   = useVscodePath();
  const ip         = useVscodePath();

  const renderPlan = () => (
    <Tabs
      type="card"
      items={[
        {
          key: 'script',
          label: '脚本生成',
          children: (
            <Form layout="vertical" style={{ marginTop: 16 }}>
              <Form.Item label="选择工具">
                <Radio.Group defaultValue="sailor">
                  <Radio value="sailor">Sailor</Radio>
                  <Radio value="tessent">Tessent</Radio>
                </Radio.Group>
              </Form.Item>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="群组">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="队列">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="CPU">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="内存 (MB)">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="其他">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          ),
        },
        { key: 'exec', label: '执行', children: <TerminalUI /> },
      ]}
    />
  );

  const renderEnv = () => (
    <Tabs
      type="card"
      items={[
        {
          key: 'gen',
          label: '脚本生成',
          children: (
            <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} style={{ marginTop: 16 }}>
              <Form.Item label="header cfg">
                <PathInput state={headerCfg} placeholder="路径..." showSelectFile showOpen />
              </Form.Item>
              <Form.Item label="env cfg" style={{ marginBottom: 16 }}>
                <PathInput state={envCfg} placeholder="路径..." showSelectFile showOpen />
              </Form.Item>
            </Form>
          ),
        },
        { key: 'exec', label: '执行', children: <TerminalUI /> },
      ]}
    />
  );

  const renderSim = () => (
    <Tabs
      type="card"
      items={[
        {
          key: 'gen',
          label: '脚本生成',
          children: (
            <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} style={{ marginTop: 16 }}>
              <Form.Item label="testcase">
                <PathInput state={testcase} placeholder="路径..." showSelectFile showOpen />
              </Form.Item>
              <Form.Item label="IP" style={{ marginBottom: 0 }}>
                <PathInput state={ip} placeholder="路径..." showSelectFile showOpen />
              </Form.Item>
            </Form>
          ),
        },
        { key: 'compile', label: '编译', children: <TerminalUI /> },
        { key: 'exec', label: '执行', children: <TerminalUI /> },
      ]}
    />
  );

  return (
    <div>
      <Tabs
        type="line"
        items={[
          { key: 'plan', label: 'PLAN', children: renderPlan() },
          { key: 'env', label: 'ENV', children: renderEnv() },
          { key: 'sim', label: 'SIM', children: renderSim() },
          {
            key: 'atpg',
            label: 'ATPG',
            children: (
              <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
                ATPG 配置开发中...
              </div>
            ),
          },
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
