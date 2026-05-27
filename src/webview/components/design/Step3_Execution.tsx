import React, { useState } from 'react';
import { Form, Button, Tabs, Alert, Space, Typography, Divider, Row, Card, Col, Steps } from 'antd';
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
  const [currentStep, setCurrentStep] = useState(0);
  const gvinPath = useVscodePath();
  const makefilePath = useVscodePath();
  const checkPath = useVscodePath();

  const renderExecution = () => (
    <Space direction='vertical' style={{ width: '100%' }}>
      <Row gutter={10}>
        <Col span={6}>
          <Card style={{ color: currentStep != 0 ? 'rgba(255,255,255,0.25)': ''}}>
            <p>参数校验</p>
            <p>创建目录</p>
            <p>任务编排</p>
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ color: currentStep != 1 ? 'rgba(255,255,255,0.25)': ''}}>
            <p>gen_sailor_cfg</p>
            <p>gen_analysis_env</p>
            <p>run_job</p>
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ color: currentStep != 2 ? 'rgba(255,255,255,0.25)': ''}}>
            <p>执行结果1</p>
            <p>执行结果2</p>
            <p>执行结果3</p>
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ color: currentStep != 3 ? 'rgba(255,255,255,0.25)': ''}}>
            <p>公共后处理</p>
            <p>工具后处理</p>
          </Card>
        </Col>
      </Row >
      <section
        style={{
            border: '1px solid var(--vscode-panel-border, #e5e7eb)',
            borderRadius: 8,
            padding: 16,
            minHeight: 100,
            background: 'color-mix(in srgb, var(--vscode-editor-background, #fff) 96%, var(--vscode-focusBorder, #1677ff))',
          }}
        >
      </section>
    </Space>
  );

  return (
    <div>
      <Steps
        style={{ marginBottom: 10 }}
        current={currentStep}
        onChange={setCurrentStep}
        type={'navigation'}
        responsive
        size="small"
        items={[
          { title: '环境初始化' },
          { title: '设计执行' },
          { title: '结果分析' },
          { title: '后处理', },
        ]}
      />
      <div className="dft-flow-card">
        <div style={{ width: '100%', minWidth: 0 }}>{renderExecution()}</div>
      </div>

      <Divider style={{ margin: '18px 0 14px' }} />
      <Space style={{ width: '100%', justifyContent: 'flex-end' }} wrap>
        <Space size="small" wrap>
          <Button onClick={onPrev} icon={<LeftOutlined />}>
            上一页
          </Button>
          <Button type="primary" onClick={onNext}>
            下一页 <RightOutlined />
          </Button>
        </Space>
      </Space>
    </div>
  );
};

export default Step3Execution;
