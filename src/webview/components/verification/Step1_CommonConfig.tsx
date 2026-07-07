import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, Form, message, Select, Space, Spin, } from 'antd';
import {
  BranchesOutlined,
  FileAddOutlined,
  RightOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { generateDefaultFlowConfigs, getGitInfo, RepoKey } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';
import CollapsibleSection from '../shared/CollapsibleSection';
import CustomSelect from '../shared/CustomSelect';

interface Props {
  onNext?: () => void;
}

const templateOptions = [
  {
    value: 1,
    label:'网络'
  },
  {
    value: 2,
    label:'连接'
  },
  {
    value: 3,
    label:'图灵'
  },
];

const modeOptions = [
  {
    value: 1,
    label:'merge_3d流程'
  },
  {
    value: 2,
    label:'MBIST_SUB模式'
  },
  {
    value: 3,
    label: 'MBIST_TOP模式'
  },
  {
    value: 4,
    label: 'MBIST_TOP_REPAIR模式'
  },
  {
    value: 5,
    label: 'ATPG验证'
  },
  {
    value: 6,
    label: 'IP验证'
  },
  {
    value: 7,
    label: 'JTAG验证'
  },
  {
    value: 8,
    label: 'FML验证'
  },
];

const pageStyle: React.CSSProperties = {
  padding: 4,
  color: 'var(--vscode-foreground)',
};

const Step1CommonConfig: React.FC<Props> = ({ onNext }) => {
  const project = useVscodePath();
  const defaultCfg = useVscodePath();

  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [template, setTemplate] = useState<string>('');
  const [mode, setMode] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const updatePayload = useWizardStore((state) => state.updatePayload);

  const { savedData, loading, saving, hasUnsaved, handleSave } = useFlowConfig('verification');

  useEffect(() => {
    getGitInfo('verification' as RepoKey)
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
    if (source.defaultCfg) defaultCfg.setValue(String(source.defaultCfg))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData]);

  const collectFormData = () => ({
    project: project.value,
    landerCfg: defaultCfg.value,
  });

  const onSave = () => {
    const data = collectFormData();
    void handleSave({ data });
  };

  const onGenerateDefaults = async () => {
    setGenerating(true);
    try {
      const result = await generateDefaultFlowConfigs('verification');
      if (!result.success) {
        message.error(result.error ?? '生成默认配置失败');
        return;
      }
      message.success(`生成默认配置完成`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
        <div style={pageStyle}>
          <Card size="small" style={{ marginBottom: 14 }} styles={{ body: { padding: 18 } }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <Button shape="round" icon={<BranchesOutlined />} style={{ cursor: 'default' }}>
                {currentBranch || '获取分支中...'}
              </Button>
            </div>
            <Form.Item label="project.cshrc">
              <PathInput
                state={project}
                pathSources={['local']}
                placeholder="请选择 project.cshrc"
                showOpen
                showSelectFile
              />
            </Form.Item>
          </Card>

          <Card size="small" style={{ marginBottom: 14 }} styles={{ body: { padding: 18 } }}>
            <CollapsibleSection title="stage 配置">
              <Form.Item label="stage">
                <CustomSelect />
              </Form.Item>
              <Form.Item label="选择模板">
                <Select
                  value={template}
                  onChange={(value) => setTemplate(value)}
                  allowClear
                  placeholder="请选择模板"
                  options={templateOptions}
                />
              </Form.Item>
              <Form.Item label="选择模式">
                <Select
                  value={mode}
                  onChange={(value) => setMode(value)}
                  allowClear
                  placeholder="请选择模式"
                  options={modeOptions}
                />
              </Form.Item>
              <Form.Item label="配置文件">
                <PathInput
                  state={defaultCfg}
                  pathSources={['local']}
                  placeholder="请选择配置文件"
                  showOpen
                  showSelectFile
                />
              </Form.Item>
            </CollapsibleSection>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <Button icon={<FileAddOutlined />} loading={generating} onClick={onGenerateDefaults}>
              产生默认配置
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
        </div>
      </Form>
    </Spin>
  );
};

export default Step1CommonConfig;
