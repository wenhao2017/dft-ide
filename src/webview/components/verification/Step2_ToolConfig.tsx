import React from 'react';
import { Form, Input, Button, Space, Select } from 'antd';
import { FolderOpenOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';

const Step2ToolConfig: React.FC<{ onNext: () => void; onPrev: () => void }> = ({
  onNext,
  onPrev,
}) => {
  return (
    <Form
      layout="horizontal"
      labelCol={{ span: 5 }}
      wrapperCol={{ span: 19 }}
      style={{ padding: '16px 0' }}
    >
      <Form.Item label="common tessent cfg">
        <Space.Compact style={{ width: '100%' }}>
          <Input />
          <Button icon={<FolderOpenOutlined />}>打开</Button>
        </Space.Compact>
      </Form.Item>

      <Form.Item label="common mbist cfg">
        <Space.Compact style={{ width: '100%' }}>
          <Input />
          <Button icon={<FolderOpenOutlined />}>打开</Button>
        </Space.Compact>
      </Form.Item>

      <Form.Item label="IP 选择">
        <Select
          placeholder="选择或输入 IP"
          options={[
            { value: 'ip1', label: 'IP_Core_1' },
            { value: 'ip2', label: 'IP_Core_2' },
            { value: 'ip3', label: 'IP_SRAM_A' },
          ]}
        />
      </Form.Item>

      <Form.Item label="模块选择">
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
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </Form>
  );
};

export default Step2ToolConfig;
