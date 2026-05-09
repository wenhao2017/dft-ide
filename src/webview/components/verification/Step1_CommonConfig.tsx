import React, { useState, useEffect } from 'react';
import { Form, Button, Radio, Typography, Divider, Badge, Spin } from 'antd';
import {
  SaveOutlined,
  RightOutlined,
  FileAddOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { getGitInfo } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';

const { Text } = Typography;

const Step1CommonConfig: React.FC<{ onNext: () => void; moduleKey?: string }> = ({ onNext, moduleKey }) => {
  const project    = useVscodePath();
  const commonPath = useVscodePath();
  const workPath   = useVscodePath();
  const sailorCfg  = useVscodePath();
  const atpgCfg    = useVscodePath();
  const staCfg     = useVscodePath();
  const fmlCfg     = useVscodePath();

  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [exitType, setExitType] = useState<string>('sim');
  const updatePayload = useWizardStore((state) => state.updatePayload);

  // ── 配置持久化 Hook ─────────────────────────────────
  const { savedData, loading, saving, hasUnsaved, handleSave } =
    useFlowConfig(moduleKey ? `verification/${moduleKey}/config` : 'verification');

  // 获取 Git 分支
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

  // 回填配置
  useEffect(() => {
    if (!savedData) return;
    const source = (savedData.step1 as Record<string, unknown> | undefined) ?? savedData;
    if (source.project)    project.setValue(String(source.project));
    if (source.commonPath) commonPath.setValue(String(source.commonPath));
    if (source.workPath)   workPath.setValue(String(source.workPath));
    if (source.sailorCfg)  sailorCfg.setValue(String(source.sailorCfg));
    if (source.atpgCfg)    atpgCfg.setValue(String(source.atpgCfg));
    if (source.staCfg)     staCfg.setValue(String(source.staCfg));
    if (source.fmlCfg)     fmlCfg.setValue(String(source.fmlCfg));
    if (source.exitType)   setExitType(String(source.exitType));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData, moduleKey]);

  const collectFormData = () => ({
    project:    project.value,
    commonPath: commonPath.value,
    workPath:   workPath.value,
    sailorCfg:  sailorCfg.value,
    atpgCfg:    atpgCfg.value,
    staCfg:     staCfg.value,
    fmlCfg:     fmlCfg.value,
    exitType,
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <Button shape="round" icon={<BranchesOutlined />} style={{ cursor: 'default' }}>
            {currentBranch || '获取分支中...'}
          </Button>
        </div>

        <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }}>
          <Form.Item label="所需项目">
            <PathInput
              state={project}
              placeholder="project.cshrc 路径"
              showOpen
              showSelectFile
            />
          </Form.Item>

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
            <Radio.Group value={exitType} onChange={(e) => setExitType(e.target.value)}>
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
