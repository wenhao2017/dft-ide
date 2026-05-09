import React, { useEffect } from 'react';
import { Form, Input, Button, Select, Badge, Spin, Space } from 'antd';
import { FolderOpenOutlined, LeftOutlined, RightOutlined, SaveOutlined } from '@ant-design/icons';
import { useFlowConfig } from '../../hooks/useFlowConfig';

const Step2ToolConfig: React.FC<{ onNext: () => void; onPrev: () => void }> = ({
  onNext,
  onPrev,
}) => {
  const [form] = Form.useForm();

  // ── 配置持久化 Hook ─────────────────────────────────
  const { savedData, loading, saving, hasUnsaved, handleSave } = useFlowConfig('verification');

  // 回填
  useEffect(() => {
    if (!savedData?.step2) return;
    form.setFieldsValue(savedData.step2);
  }, [savedData, form]);

  const onSave = () => {
    handleSave({ step2: form.getFieldsValue(true) });
  };

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ span: 5 }}
        wrapperCol={{ span: 19 }}
        style={{ padding: '16px 0' }}
      >
        <Form.Item label="common tessent cfg" name="tessentCfg">
          <Space.Compact style={{ width: '100%' }}>
            <Input />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="common mbist cfg" name="mbistCfg">
          <Space.Compact style={{ width: '100%' }}>
            <Input />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="IP 选择" name="selectedIp">
          <Select
            placeholder="选择或输入 IP"
            options={[
              { value: 'ip1', label: 'IP_Core_1' },
              { value: 'ip2', label: 'IP_Core_2' },
              { value: 'ip3', label: 'IP_SRAM_A' },
            ]}
          />
        </Form.Item>

        <Form.Item label="模块选择" name="selectedModule">
          <Select
            placeholder="选择验证模块"
            options={[
              { value: 'mod1', label: 'Module_A' },
              { value: 'mod2', label: 'Module_B' },
              { value: 'mod3', label: 'Module_C' },
            ]}
          />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32 }}>
          <Button onClick={onPrev} icon={<LeftOutlined />}>
            上一页
          </Button>
          <Badge dot={hasUnsaved} offset={[-4, 4]}>
            <Button icon={<SaveOutlined />} loading={saving} onClick={onSave}>
              保存
            </Button>
          </Badge>
          <Button type="primary" onClick={onNext}>
            下一页 <RightOutlined />
          </Button>
        </div>
      </Form>
    </Spin>
  );
};

export default Step2ToolConfig;
