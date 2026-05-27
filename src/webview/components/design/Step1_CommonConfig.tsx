import React, { useEffect, useState } from 'react';
import { Badge, Button, Form, Select, Space, Spin, Typography } from 'antd';
import {
  BranchesOutlined,
  FileAddOutlined,
  RightOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { getGitInfo } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';
import CollapsibleSection from '../shared/CollapsibleSection';

const { Text } = Typography;

interface Props {
  onNext?: () => void;
  moduleKey?: string;
  category: string;
}

const Step1CommonConfig: React.FC<Props> = ({ onNext, moduleKey, category }) => {
  const flowKey = category.toLowerCase();
  const project = useVscodePath();
  const commonPath = useVscodePath();
  const workPath = useVscodePath();
  const sailorCfg = useVscodePath();
  const defaultCfg = useVscodePath();
  const atpgCfg = useVscodePath();
  const staCfg = useVscodePath();
  const fmlCfg = useVscodePath();

  const [currentBranch, setCurrentBranch] = useState<string>('');
  const updatePayload = useWizardStore((state) => state.updatePayload);

  const { savedData, loading, saving, hasUnsaved, handleSave } =
    useFlowConfig(moduleKey ? `${flowKey}/${moduleKey}/config` : flowKey);

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

  useEffect(() => {
    if (!savedData) return;
    const source = (savedData.step1 as Record<string, unknown> | undefined) ?? savedData;
    if (source.project) project.setValue(String(source.project));
    if (source.commonPath) commonPath.setValue(String(source.commonPath));
    if (source.workPath) workPath.setValue(String(source.workPath));
    if (source.sailorCfg) sailorCfg.setValue(String(source.sailorCfg));
    if (source.defaultCfg) defaultCfg.setValue(String(source.defaultCfg));
    if (source.atpgCfg) atpgCfg.setValue(String(source.atpgCfg));
    if (source.staCfg) staCfg.setValue(String(source.staCfg));
    if (source.fmlCfg) fmlCfg.setValue(String(source.fmlCfg));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData, moduleKey]);

  const collectFormData = () => ({
    project: project.value,
    commonPath: commonPath.value,
    workPath: workPath.value,
    sailorCfg: sailorCfg.value,
    defaultCfg: defaultCfg.value,
    atpgCfg: atpgCfg.value,
    staCfg: staCfg.value,
    fmlCfg: fmlCfg.value,
  });

  const onSave = () => {
    const data = collectFormData();
    if (!moduleKey) {
      void handleSave(data);
      return;
    }
    void handleSave({ moduleKey, step1: data });
  };

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <div style={{ padding: '8px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <Button shape="round" icon={<BranchesOutlined />} style={{ cursor: 'default' }}>
            {currentBranch || '获取分支中...'}
          </Button>
        </div>

        <Form layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} style={{ maxWidth: 920 }}>
          <Form.Item label="project.cshrc">
            <PathInput
              state={project}
              placeholder="请选择 project.cshrc"
              showOpen
              showSelectFile
            />
          </Form.Item>

          <Form.Item label="COMMON_PATH">
            <PathInput
              state={commonPath}
              placeholder="请选择 COMMON_PATH 目录"
              showOpen
              showSelectFolder
            />
          </Form.Item>

          <Form.Item label={`common ${category} cfg`}>
            <PathInput
              state={sailorCfg}
              placeholder={`请选择 common ${category} cfg`}
              showOpen
              showSelectFile
            />
          </Form.Item>

          <Form.Item label="选择领域">
            <Select
              allowClear
              placeholder="请选择领域"
              options={[
                { label: '领域 1', value: 'domain-1' },
                { label: '领域 2', value: 'domain-2' },
                { label: '领域 3', value: 'domain-3' },
              ]}
            />
          </Form.Item>

          <CollapsibleSection title="归一化表格转 cfg">
            <Form.Item label="命令入口">
              <Space size="middle" wrap>
                <Button icon={<FileAddOutlined />}>生成默认配置</Button>
                <Text type="secondary">根据归一化表格生成当前流程的默认 cfg。</Text>
              </Space>
            </Form.Item>

            <Form.Item label="配置 JSON 文件" style={{ marginBottom: 0 }}>
              <PathInput
                state={defaultCfg}
                placeholder="请选择或输入配置 JSON 文件"
                showOpen
                showSelectFile
              />
            </Form.Item>
          </CollapsibleSection>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32, flexWrap: 'wrap' }}>
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
