import React, { useState } from 'react';
import { Form, Button, Tabs, Alert, Space, Typography } from 'antd';
import { LeftOutlined, RightOutlined, CodeOutlined } from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import PathInput from '../shared/PathInput';
import ExecutionLogPanel from '../shared/ExecutionLogPanel';

const { Text } = Typography;

interface Props {
  onNext: () => void;
  onPrev: () => void;
}

const ExecutionLaunch: React.FC<{
  title: string;
  command: string;
  description: string;
}> = ({ title, command, description }) => {
  const [logs, setLogs] = useState<string[]>([]);

  const handleOpenTerminal = () => {
    setLogs((prev) => [
      ...prev,
      `[INFO] 已发送打开终端请求: ${title}`,
      `$ ${command}`,
    ]);
  };
  const commandUri = `command:dftIde.openExecutionTerminalFromUri?${encodeURIComponent(JSON.stringify([{ title, command }]))}`;

  return (
  <div style={{ marginTop: 16 }}>
    <Alert
      message={description}
      description={<Text code>{command}</Text>}
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
    />
    <Space style={{ marginBottom: 16 }}>
      <Button
        type="primary"
        icon={<CodeOutlined />}
        href={commandUri}
        onClick={handleOpenTerminal}
      >
        在 VS Code 终端中运行
      </Button>
    </Space>
    <ExecutionLogPanel
      title="执行摘要"
      logs={logs}
    />
  </div>
  );
};

const Step3Execution: React.FC<Props> = ({ onNext, onPrev }) => {
  const [activeTab, setActiveTab] = useState('gen');
  const gvinPath = useVscodePath();
  const makefilePath = useVscodePath();
  const checkPath = useVscodePath();

  const renderScriptGen = () => (
    <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }} style={{ padding: '16px 0' }}>
      <div style={{ marginBottom: 24 }}>
        <Alert message="如需覆盖默认配置，可选择自定义脚本或配置文件。" type="info" showIcon />
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

      <ExecutionLaunch
        title="DFT Design Script Generation"
        command="make gen_design_scripts"
        description="脚本生成应由 VS Code 终端执行，便于团队接入真实工具链。"
      />
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
          {
            key: 'exec',
            label: '执行',
            children: (
              <ExecutionLaunch
                title="DFT Design Execution"
                command="make run_design"
                description="准备开始执行设计流程。"
              />
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
