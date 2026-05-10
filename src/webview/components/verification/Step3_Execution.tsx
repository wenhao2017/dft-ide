import React, { useState } from 'react';
import { Tabs, Form, Input, Button, Radio, Row, Col, Alert, Space, Typography } from 'antd';
import { LeftOutlined, RightOutlined, CodeOutlined } from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import PathInput from '../shared/PathInput';
import ExecutionLogPanel from '../shared/ExecutionLogPanel';

const { Text } = Typography;

const ExecutionLaunch: React.FC<{
  title: string;
  command: string;
  description: string;
  tone?: 'info' | 'success';
}> = ({ title, command, description, tone = 'info' }) => {
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
      type={tone}
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

const Step3Execution: React.FC<{ onNext: () => void; onPrev: () => void }> = ({
  onNext,
  onPrev,
}) => {
  const headerCfg = useVscodePath();
  const envCfg = useVscodePath();
  const testcase = useVscodePath();
  const ip = useVscodePath();

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
              <ExecutionLaunch
                title="DFT Verification PLAN Script"
                command="make gen_plan_scripts"
                description="生成 PLAN 相关脚本。"
              />
            </Form>
          ),
        },
        {
          key: 'exec',
          label: '执行',
          children: (
            <ExecutionLaunch
              title="DFT Verification PLAN"
              command="bsub -q normal < run_plan.sh"
              description="准备提交 PLAN 任务到集群。"
            />
          ),
        },
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
              <ExecutionLaunch
                title="DFT Verification ENV Script"
                command="make gen_env_scripts"
                description="生成 ENV 相关脚本。"
              />
            </Form>
          ),
        },
        {
          key: 'exec',
          label: '执行',
          children: (
            <ExecutionLaunch
              title="DFT Verification ENV"
              command="make build_env"
              description="准备执行环境构建。"
            />
          ),
        },
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
              <Form.Item label="IP" style={{ marginBottom: 16 }}>
                <PathInput state={ip} placeholder="路径..." showSelectFile showOpen />
              </Form.Item>
              <ExecutionLaunch
                title="DFT Verification SIM Script"
                command="make gen_sim_scripts"
                description="生成 SIM 相关脚本。"
              />
            </Form>
          ),
        },
        {
          key: 'compile',
          label: '编译',
          children: (
            <ExecutionLaunch
              title="DFT Verification SIM Compile"
              command="make compile_sim"
              description="编译 SIM 设计和 Testbench。"
            />
          ),
        },
        {
          key: 'exec',
          label: '执行',
          children: (
            <ExecutionLaunch
              title="DFT Verification SIM"
              command="./simv +UVM_TESTNAME=test_base"
              description="运行仿真任务。"
              tone="success"
            />
          ),
        },
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
