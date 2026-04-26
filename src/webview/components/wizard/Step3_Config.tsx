import React from 'react';
import { Card, Button, Space, Form, Select, InputNumber, message } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import useWizardStore from '../../store/wizardStore';
import vscode from '../../utils/vscode';

const configSchema = z.object({
  tool: z.enum(['hibist', 'sailor'] as const, {
    message: '请选择目标工具',
  }),
  cpuCores: z
    .number({
      message: '请输入 CPU 核数',
    })
    .int('CPU 核数必须为整数')
    .min(1, 'CPU 核数至少为 1')
    .max(256, 'CPU 核数最多为 256'),
});

type ConfigFormData = z.infer<typeof configSchema>;

const toolOptions = [
  { value: 'hibist', label: 'HiBIST' },
  { value: 'sailor', label: 'Sailor' },
];

const Step3Config: React.FC = () => {
  const { prevStep, nextStep, updatePayload, taskPayload } = useWizardStore();
  const [messageApi, contextHolder] = message.useMessage();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfigFormData>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      tool: undefined,
      cpuCores: 4,
    },
  });

  const onSubmit = (data: ConfigFormData) => {
    updatePayload({ tool: data.tool, cpuCores: data.cpuCores });

    const fullPayload = {
      ...taskPayload,
      tool: data.tool,
      cpuCores: data.cpuCores,
    };

    vscode.postMessage({ command: 'submitTask', payload: fullPayload });
    messageApi.success('任务已提交，进入监控面板...');
    nextStep();
  };

  return (
    <Card title="步骤 3：工具配置" bordered={false}>
      {contextHolder}
      <Form layout="vertical" onFinish={handleSubmit(onSubmit) as any}>
        <Form.Item
          label="目标工具"
          validateStatus={errors.tool ? 'error' : ''}
          help={errors.tool?.message}
        >
          <Controller
            name="tool"
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                options={toolOptions}
                placeholder="请选择目标工具"
                onChange={(val) => field.onChange(val)}
              />
            )}
          />
        </Form.Item>

        <Form.Item
          label="CPU 核数"
          validateStatus={errors.cpuCores ? 'error' : ''}
          help={errors.cpuCores?.message}
        >
          <Controller
            name="cpuCores"
            control={control}
            render={({ field }) => (
              <InputNumber
                {...field}
                min={1}
                max={256}
                style={{ width: '100%' }}
                placeholder="请输入 CPU 核数"
                onChange={(val) => field.onChange(val)}
              />
            )}
          />
        </Form.Item>

        <Space>
          <Button onClick={prevStep}>上一步</Button>
          <Button type="primary" htmlType="submit">
            提交任务
          </Button>
        </Space>
      </Form>
    </Card>
  );
};

export default Step3Config;
