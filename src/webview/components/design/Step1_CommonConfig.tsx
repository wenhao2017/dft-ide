import React, { useState, useEffect } from 'react';
import { Form, Button, Space, Card, Radio, Typography, Badge, Spin } from 'antd';
import {
  SettingOutlined,
  SaveOutlined,
  RightOutlined,
  BranchesOutlined,
  FileAddOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { getGitInfo } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';

const { Text } = Typography;

interface Props {
  onNext?: () => void;
  moduleKey?: string;
}

const Step1CommonConfig: React.FC<Props> = ({ onNext, moduleKey }) => {
  const project    = useVscodePath();
  const commonPath = useVscodePath();
  const workPath   = useVscodePath();
  const sailorCfg  = useVscodePath();
  const defaultCfg = useVscodePath();
  const atpgCfg    = useVscodePath();
  const staCfg     = useVscodePath();
  const fmlCfg     = useVscodePath();

  const [currentBranch, setCurrentBranch] = useState<string>('');
  const updatePayload = useWizardStore((state) => state.updatePayload);

  // ── 配置持久化 Hook ─────────────────────────────────
  const { savedData, loading, saving, hasUnsaved, handleSave } =
    useFlowConfig(moduleKey ? `design/${moduleKey}/config` : 'design');

  // 获取当前 Git 分支
  useEffect(() => {
    getGitInfo()
      .then((res) => {
        if (res && res.branch) {
          const branchName = res.branch as string;
          setCurrentBranch(branchName);
          updatePayload({ gitBranch: branchName });
        } else {
          setCurrentBranch('Not in a git repo');
        }
      })
      .catch(() => setCurrentBranch('Git Error'));
  }, [updatePayload]);

  // 回填：从文件读到 savedData 后，填入各路径输入框
  useEffect(() => {
    if (!savedData) return;
    const source = (savedData.step1 as Record<string, unknown> | undefined) ?? savedData;
    if (source.project)    project.setValue(String(source.project));
    if (source.commonPath) commonPath.setValue(String(source.commonPath));
    if (source.workPath)   workPath.setValue(String(source.workPath));
    if (source.sailorCfg)  sailorCfg.setValue(String(source.sailorCfg));
    if (source.defaultCfg) defaultCfg.setValue(String(source.defaultCfg));
    if (source.atpgCfg)    atpgCfg.setValue(String(source.atpgCfg));
    if (source.staCfg)     staCfg.setValue(String(source.staCfg));
    if (source.fmlCfg)     fmlCfg.setValue(String(source.fmlCfg));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData, moduleKey]);

  const collectFormData = () => ({
    project:    project.value,
    commonPath: commonPath.value,
    workPath:   workPath.value,
    sailorCfg:  sailorCfg.value,
    defaultCfg: defaultCfg.value,
    atpgCfg:    atpgCfg.value,
    staCfg:     staCfg.value,
    fmlCfg:     fmlCfg.value,
  });

  const onSave = () => {
    const data = collectFormData();
    if (!moduleKey) {
      handleSave(data);
      return;
    }
    handleSave({ moduleKey, step1: data });
  };

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <div style={{ padding: '8px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <Radio.Group defaultValue="hibist" buttonStyle="solid">
            <Radio.Button value="hibist">hibist</Radio.Button>
            <Radio.Button value="sailor">sailor</Radio.Button>
          </Radio.Group>

          <Button shape="round" icon={<BranchesOutlined />} style={{ cursor: 'default' }}>
            {currentBranch || '获取分支中...'}
          </Button>
        </div>

        <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }}>
          <Form.Item label="所需项目" style={{ marginBottom: 16 }}>
            <PathInput
              state={project}
              placeholder="输入所需项目 / project.cshrc 路径"
              showOpen
              showSelectFile
            />
          </Form.Item>

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
            <Card size="small" style={{ marginBottom: 32, borderStyle: 'dashed' }}>
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
      </div>
    </Spin>
  );
};

export default Step1CommonConfig;
