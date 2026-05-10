import React, { useState } from 'react';
import { Form, Button, Tabs, Alert, message, Space, Typography } from 'antd';
import { LeftOutlined, RightOutlined, CodeOutlined } from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import PathInput from '../shared/PathInput';
import ExecutionLogPanel from '../shared/ExecutionLogPanel';
import { openExecutionTerminal } from '../../utils/ipc';

const { Text } = Typography;

interface Props {
  onNext: () => void;
  onPrev: () => void;
}

const openTerminal = async (title: string, command: string) => {
  const res = await openExecutionTerminal({ title, command });
  if (res.success) {
    message.success('已在 VS Code 终端中打开任务');
    return;
  }
  message.error(`打开终端失败: ${res.error ?? 'unknown error'}`);
};

const TerminalLaunch: React.FC<{
  title: string;
  command: string;
  description: string;
}> = ({ title, command, description }) => (
  <div style={{ marginTop: 16 }}>
    <Alert
      message={description}
      description={<Text code>{command}</Text>}
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
    />
    <Space style={{ marginBottom: 16 }}>
      <Button type="primary" icon={<CodeOutlined />} onClick={() => openTerminal(title, command)}>
        在 VS Code 终端中运行
      </Button>
    </Space>
    <ExecutionLogPanel
      title="执行日志"
      status="idle"
      logs={[
        '[INFO] 真实命令会在 VS Code 终端中运行。',
        '[INFO] Webview 仅展示已保存的日志、历史记录和结果摘要。',
      ]}
    />
  </div>
);

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

      <TerminalLaunch
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
              <TerminalLaunch
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
