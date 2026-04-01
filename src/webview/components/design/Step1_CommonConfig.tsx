import React from 'react';
import { Form, Input, Button, Space, Card, Radio, Typography, Badge } from 'antd';
import {
  FolderOpenOutlined,
  SelectOutlined,
  SettingOutlined,
  SaveOutlined,
  RightOutlined,
  BranchesOutlined,
  FileAddOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

interface Props {
  onNext?: () => void;
}

const Step1CommonConfig: React.FC<Props> = ({ onNext }) => {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Radio.Group defaultValue="hibist" buttonStyle="solid">
          <Radio.Button value="hibist">hibist</Radio.Button>
          <Radio.Button value="sailor">sailor</Radio.Button>
        </Radio.Group>
        <Button shape="round" icon={<BranchesOutlined />}>
          git 分支
        </Button>
      </div>

      <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }}>
        <Form.Item label="所需项目" style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input placeholder="输入所需项目" style={{ width: '30%' }} />
            <Input
              prefix={
                <Text type="secondary" style={{ marginRight: 8 }}>
                  project.cshrc
                </Text>
              }
              placeholder="配置路径"
              style={{ width: '70%' }}
            />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="COMMON_PATH" style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input placeholder="请输入 COMMON_PATH 路径" />
            <Button icon={<SelectOutlined />}>选择</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="WORK_PATH" style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input placeholder="请输入 WORK_PATH 路径" />
            <Button icon={<SelectOutlined />}>选择</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="common sailor cfg" style={{ marginBottom: 32 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input placeholder="请输入 common sailor cfg 路径" />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
        </Form.Item>

        <Badge.Ribbon text="本版本暂不考虑" color="red">
          <Card
            size="small"
            style={{
              marginBottom: 32,
              background: 'rgba(255,255,255,0.02)',
              borderStyle: 'dashed',
              borderColor: '#444',
            }}
          >
            <Form.Item label="出口配置" style={{ marginBottom: 16 }}>
              <Radio.Group disabled defaultValue="sim">
                <Radio value="ATPG">ATPG</Radio>
                <Radio value="sim">sim</Radio>
                <Radio value="STA">STA</Radio>
                <Radio value="formal">formal</Radio>
              </Radio.Group>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  注：当出口检查配置以后，对应的环境将会建立，包括执行流对于 mbist 主要是 sim。
                </Text>
              </div>
            </Form.Item>
            <Form.Item label="common atpg cfg" style={{ marginBottom: 12 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input disabled />
                <Button disabled icon={<FolderOpenOutlined />}>
                  打开
                </Button>
              </Space.Compact>
            </Form.Item>
            <Form.Item label="common sta cfg" style={{ marginBottom: 12 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input disabled />
                <Button disabled icon={<FolderOpenOutlined />}>
                  打开
                </Button>
              </Space.Compact>
            </Form.Item>
            <Form.Item label="common fml cfg" style={{ marginBottom: 0 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input disabled />
                <Button disabled icon={<FolderOpenOutlined />}>
                  打开
                </Button>
              </Space.Compact>
            </Form.Item>
          </Card>
        </Badge.Ribbon>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 32,
          }}
        >
          <Space>
            <Text>选择模板:</Text>
            <Button>领域模板</Button>
          </Space>
          <Space.Compact style={{ width: '45%' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 8 }}>
              <Text>默认配置设置</Text>
            </span>
            <Input placeholder="请选择或输入" />
            <Button icon={<FolderOpenOutlined />}>打开</Button>
          </Space.Compact>
          <Button icon={<SettingOutlined />}>权限设置</Button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
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
