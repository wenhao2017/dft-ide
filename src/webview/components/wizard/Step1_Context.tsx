import React from 'react';
import { Card, Form, Select, Button, Space, Divider } from 'antd';
import useWizardStore from '../../store/wizardStore';
import vscode from '../../utils/vscode';

const stageOptions = [
  { value: '85', label: '85 阶段' },
  { value: '95', label: '95 阶段' },
  { value: '100', label: '100 阶段' },
];

const moduleOptions = [
  { value: 'cpu_subsys', label: 'cpu_subsys' },
  { value: 'gpu_subsys', label: 'gpu_subsys' },
  { value: 'npu_subsys', label: 'npu_subsys' },
  { value: 'io_subsys', label: 'io_subsys' },
];

const Step1Context: React.FC = () => {
  const [form] = Form.useForm();
  const { nextStep, updatePayload } = useWizardStore();

  const handleNext = async () => {
    try {
      const values = await form.validateFields();
      updatePayload({ stage: values.stage, module: values.module });
      nextStep();
    } catch {
      // 校验失败，AntD 会自动提示
    }
  };

  const handleCreateWorkspace = () => {
    vscode.postMessage({ command: 'createWorkspace' });
  };

  return (
    <Card title="步骤 1：选择分支与模块" bordered={false}>
      <Form form={form} layout="vertical" initialValues={{ stage: '85' }}>
        <Form.Item
          name="stage"
          label="选择阶段"
          rules={[{ required: true, message: '请选择阶段' }]}
        >
          <Select options={stageOptions} placeholder="请选择阶段" />
        </Form.Item>

        <Form.Item
          name="module"
          label="目标模块"
          rules={[{ required: true, message: '请选择目标模块' }]}
        >
          <Select options={moduleOptions} placeholder="请选择目标模块" />
        </Form.Item>
      </Form>

      <Divider />

      <Space>
        <Button onClick={handleCreateWorkspace}>创建本地工程</Button>
        <Button type="primary" onClick={handleNext}>
          下一步
        </Button>
      </Space>
    </Card>
  );
};

export default Step1Context;
