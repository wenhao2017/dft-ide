import React from 'react';
import { Card, Form, Input, Button, Space, Typography, Radio, Divider, Tooltip } from 'antd';
import {
  FolderOpenOutlined,
  CloudDownloadOutlined,
  SaveOutlined,
  SyncOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  BranchesOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';

const { Title } = Typography;

const CommonFlow: React.FC = () => {
  return (
    <Card
      bordered={false}
      style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.1)', borderRadius: 12, padding: '8px' }}
    >
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <Title level={3} style={{ marginBottom: 24, fontWeight: 600 }}>
          公共配置 (COMMON)
        </Title>
        <Radio.Group defaultValue="design" buttonStyle="solid" size="large">
          <Radio.Button value="design">
            <BranchesOutlined style={{ marginRight: 8 }} />
            设计 Git 分支
          </Radio.Button>
          <Radio.Button value="verification">
            <BranchesOutlined style={{ marginRight: 8 }} />
            验证 Git 分支
          </Radio.Button>
        </Radio.Group>
      </div>

      <Divider style={{ margin: '16px 0 32px 0' }} />

      <Form layout="vertical" style={{ maxWidth: 800, margin: '0 auto' }}>
        <Form.Item label="Design Tree (设计树路径)">
          <Space.Compact style={{ width: '100%' }}>
            <Input size="large" placeholder="请输入或选择 designtree 路径" />
            <Button size="large" type="primary" icon={<FolderOpenOutlined />}>
              打开
            </Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="归一化表格路径">
          <Space.Compact style={{ width: '100%' }}>
            <Input size="large" placeholder="请输入或选择归一化表格路径" />
            <Button size="large" type="primary" icon={<FolderOpenOutlined />}>
              打开
            </Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="OBS 存储与公共数据" style={{ marginTop: 32 }}>
          <Space size="middle">
            <Button size="large" icon={<DatabaseOutlined />}>
              打开 OBS 查看器
            </Button>
            <Button size="large" icon={<CloudDownloadOutlined />}>
              下载公共数据 (IP Model, ECO 脚本)
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Divider style={{ margin: '32px 0 24px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Tooltip title="Git Pull">
            <Button icon={<ArrowDownOutlined />} />
          </Tooltip>
          <Tooltip title="Git Push">
            <Button icon={<ArrowUpOutlined />} />
          </Tooltip>
          <Button icon={<BranchesOutlined />}>Git 详细操作</Button>
        </Space>
        <Space size="middle">
          <Button size="large" icon={<SaveOutlined />}>
            保存配置
          </Button>
          <Button size="large" type="primary" icon={<SyncOutlined />}>
            立即同步
          </Button>
        </Space>
      </div>
    </Card>
  );
};

export default CommonFlow;
