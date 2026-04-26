import React from 'react';
import { Form, Button, Radio, Typography, Divider } from 'antd';
import {
  SaveOutlined,
  RightOutlined,
  FileAddOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import PathInput from '../shared/PathInput';

const { Text } = Typography;

const Step1CommonConfig: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const project   = useVscodePath();  // 所需项目 (project.cshrc)
  const commonPath = useVscodePath(); // COMMON_PATH
  const workPath  = useVscodePath();  // WORK_PATH
  const sailorCfg = useVscodePath();  // common sailor cfg
  const atpgCfg   = useVscodePath();  // common atpg cfg
  const staCfg    = useVscodePath();  // common sta cfg
  const fmlCfg    = useVscodePath();  // common fml cfg

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <Button shape="round" icon={<BranchesOutlined />}>
          git 分支
        </Button>
      </div>

      <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }}>
        {/* 配置文件：支持"打开"和"选择" */}
        <Form.Item label="所需项目">
          <PathInput
            state={project}
            placeholder="project.cshrc 路径"
            showOpen
            showSelectFile
          />
        </Form.Item>

        {/* 目录路径：只需"选择" */}
        <Form.Item label="COMMON_PATH">
          <PathInput state={commonPath} placeholder="请选择 COMMON_PATH 目录" showSelectFolder showOpen />
        </Form.Item>

        <Form.Item label="WORK_PATH">
          <PathInput state={workPath} placeholder="请选择 WORK_PATH 目录" showSelectFolder showOpen />
        </Form.Item>

        <Form.Item label="common sailor cfg">
          <PathInput state={sailorCfg} placeholder="请输入或选择 common sailor cfg 路径" showSelectFile showOpen />
        </Form.Item>

        <Divider orientation="left" plain>出口配置</Divider>

        <Form.Item label="验证出口">
          <Radio.Group defaultValue="sim">
            <Radio value="ATPG">ATPG</Radio>
            <Radio value="sim">sim</Radio>
            <Radio value="STA">STA</Radio>
            <Radio value="formal">formal</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label="common atpg cfg">
          <PathInput state={atpgCfg} placeholder="请输入或选择 common atpg cfg 路径" showSelectFile showOpen />
        </Form.Item>

        <Form.Item label="common sta cfg">
          <PathInput state={staCfg} placeholder="请输入或选择 common sta cfg 路径" showSelectFile showOpen />
        </Form.Item>

        <Form.Item label="common fml cfg">
          <PathInput state={fmlCfg} placeholder="请输入或选择 common fml cfg 路径" showSelectFile showOpen />
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
