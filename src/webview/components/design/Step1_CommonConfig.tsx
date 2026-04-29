import React, { useState, useEffect } from 'react'; // 修正：补充 useState 和 useEffect
import { Form, Button, Space, Card, Radio, Typography, Badge } from 'antd';
import {
  SettingOutlined,
  SaveOutlined,
  RightOutlined,
  BranchesOutlined,
  FileAddOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import PathInput from '../shared/PathInput';
import { getGitInfo } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';

const { Text } = Typography;

interface Props {
  onNext?: () => void;
}

const Step1CommonConfig: React.FC<Props> = ({ onNext }) => {
  const project    = useVscodePath();   // 所需项目 (project.cshrc)
  const commonPath = useVscodePath();  // COMMON_PATH
  const workPath   = useVscodePath();   // WORK_PATH
  const sailorCfg  = useVscodePath();   // common sailor cfg
  const defaultCfg = useVscodePath();  // 默认配置设置
  // 暂不开放的出口配置项。
  const atpgCfg = useVscodePath();
  const staCfg  = useVscodePath();
  const fmlCfg  = useVscodePath();

  const [currentBranch, setCurrentBranch] = useState<string>('');
  const updatePayload = useWizardStore((state) => state.updatePayload);

  useEffect(() => {
    getGitInfo()
      .then((res) => {
        if (res && res.branch) {
          const branchName = res.branch as string;
          setCurrentBranch(branchName);
          updatePayload({ gitBranch: branchName }); // 将分支信息存入 store 供后续使用
        } else {
          setCurrentBranch('Not in a git repo');
        }
      })
      .catch(() => {
        setCurrentBranch('Git Error');
      });
  }, [updatePayload]);


  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Radio.Group defaultValue="hibist" buttonStyle="solid">
          <Radio.Button value="hibist">hibist</Radio.Button>
          <Radio.Button value="sailor">sailor</Radio.Button>
        </Radio.Group>
        
        {/* 修正：绑定 currentBranch 状态，动态显示分支名 */}
        <Button shape="round" icon={<BranchesOutlined />} style={{ cursor: 'default' }}>
          {currentBranch || '获取分支中...'}
        </Button>
      </div>

      <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }}>
        {/* 所需项目：支持"打开"（在编辑器中打开 .cshrc 文件）和"选择" */}
        <Form.Item label="所需项目" style={{ marginBottom: 16 }}>
          <PathInput
            state={project}
            placeholder="输入所需项目 / project.cshrc 路径"
            showOpen
            showSelectFile
          />
        </Form.Item>

        {/* 目录路径：只需"选择" */}
        <Form.Item label="COMMON_PATH" style={{ marginBottom: 16 }}>
          <PathInput
            state={commonPath}
            placeholder="请选择 COMMON_PATH 目录"
            showSelectFolder
            showOpen
          />
        </Form.Item>

        <Form.Item label="WORK_PATH" style={{ marginBottom: 16 }}>
          <PathInput
            state={workPath}
            placeholder="请选择 WORK_PATH 目录"
            showSelectFolder
            showOpen
          />
        </Form.Item>

        {/* 配置文件：支持"打开"和"选择" */}
        <Form.Item label="common sailor cfg" style={{ marginBottom: 32 }}>
          <PathInput
            state={sailorCfg}
            placeholder="请输入或选择 common sailor cfg 路径"
            showOpen
            showSelectFile
          />
        </Form.Item>

        {/* 本版本暂不考虑的出口配置 */}
        <Badge.Ribbon text="本版本暂不考虑" color="red">
          <Card
            size="small"
            style={{ marginBottom: 32, borderStyle: 'dashed' }}
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
              <PathInput state={atpgCfg} disabled showOpen showSelectFile />
            </Form.Item>
            <Form.Item label="common sta cfg" style={{ marginBottom: 12 }}>
              <PathInput state={staCfg} disabled showOpen showSelectFile />
            </Form.Item>
            <Form.Item label="common fml cfg" style={{ marginBottom: 0 }}>
              <PathInput state={fmlCfg} disabled showOpen showSelectFile />
            </Form.Item>
          </Card>
        </Badge.Ribbon>

        {/* 模板 & 默认配置 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 32,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Space>
            <Text>选择模板:</Text>
            <Button>领域模板</Button>
          </Space>
          <Space>
            <Text>默认配置设置</Text>
            <PathInput
              state={defaultCfg}
              placeholder="请选择或输入"
              showOpen
              showSelectFile
            />
          </Space>
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
