import React from 'react';
import { Form, Input, Button, Space, Radio, Typography, Divider } from 'antd';
import {
  FolderOpenOutlined,
  SelectOutlined,
  SaveOutlined,
  RightOutlined,
  FileAddOutlined,
  BranchesOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const Step1CommonConfig: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <Button shape="round" icon={<BranchesOutlined />}>
          git 分支
        </Button>
      </div>

      <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }}>
        <Form.Item label="所需项目">
          <Space.Compact style={{ width: '100%' }}>
            <Input placeholder="project.cshrc" />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="COMMON_PATH">
          <Space.Compact style={{ width: '100%' }}>
            <Input />
            <Button icon={<SelectOutlined />}>选择</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="WORK_PATH">
          <Space.Compact style={{ width: '100%' }}>
            <Input />
            <Button icon={<SelectOutlined />}>选择</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="common sailor cfg">
          <Space.Compact style={{ width: '100%' }}>
            <Input />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
        </Form.Item>

        <Divider orientation="left" plain>
          出口配置
        </Divider>

        <Form.Item label="验证出口">
          <Radio.Group defaultValue="sim">
            <Radio value="ATPG">ATPG</Radio>
            <Radio value="sim">sim</Radio>
            <Radio value="STA">STA</Radio>
            <Radio value="formal">formal</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label="common atpg cfg">
          <Space.Compact style={{ width: '100%' }}>
            <Input />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="common sta cfg">
          <Space.Compact style={{ width: '100%' }}>
            <Input />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="common fml cfg">
          <Space.Compact style={{ width: '100%' }}>
            <Input />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32 }}>
          <Button icon={<FileAddOutlined />}>产生默认配置</Button>
          <Button icon={<SaveOutlined />}>保存</Button>
          <Button type="primary" onClick={onNext}>
            下一页 <RightOutlined />
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default Step1CommonConfig;
