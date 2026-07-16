import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, Form, message, Modal, Select, Space, Spin, } from 'antd';
import {
  BranchesOutlined,
  FileAddOutlined,
  HistoryOutlined,
  RightOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { appendLanderStage, generateDefaultFlowConfigs, getGitInfo, getLanderStages, removeLanderStage, RepoKey } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';
import CollapsibleSection from '../shared/CollapsibleSection';
import DefaultConfgHistory from '../design/DefaultConfgHistory';
import StageSelect from './StageSelect';

interface Props {
  onNext?: () => void;
}

const templateOptions = [
  {
    value: 1,
    label:'联接'
  },
  {
    value: 2,
    label:'无线终端'
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
  const commandCfg = useVscodePath();

  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [stage, setStage] = useState<string>('');
  const [template, setTemplate] = useState<number>();
  const [generating, setGenerating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [repoRoot, setRepoRoot] = useState<string>('');
  const updatePayload = useWizardStore((state) => state.updatePayload);

  const { savedData, loading, saving, hasUnsaved, handleSave } = useFlowConfig('verification');

  useEffect(() => {
    getGitInfo('verification' as RepoKey)
      .then((res) => {
        if (res && res.branch) {
          const branchName = res.branch as string;
          setCurrentBranch(branchName);
          setRepoRoot(res.repoRoot as string);
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
    if (source.commandCfg) commandCfg.setValue(String(source.commandCfg));
    if (source.stage) setStage(String(source.stage));
    if (source.template) setTemplate(Number(source.template));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData]);

  const collectFormData = () => ({
    project: project.value,
    stage,
    template,
    commandCfg: commandCfg.value,
  });

  const onSave = () => {
    const data = collectFormData();
    void handleSave({ moduleKey: 'verification', step1: data });
  };

  const onGenerateDefaults = async () => {
    setGenerating(true);
    try {
      const result = await generateDefaultFlowConfigs('verification', '');
      if (!result.success) {
        message.error(result.error ?? '生成默认配置失败');
        return;
      }
      message.success(`生成默认配置完成`);
    } finally {
      setGenerating(false);
    }
  };

  const appendStage = async(
    addValue: string, extendValue: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await appendLanderStage('verification', addValue, extendValue);
    return result;
  };

  const removeStage = async(removeValue: string): Promise<{ success: boolean; error?: string }> => {
    const result = await removeLanderStage('verification', removeValue);
    return result;
  };

  const listStages = async(): Promise<{ success: boolean; stages: string[]; error?: string }> => {
    const result = await getLanderStages('verification');
    return result;
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
                localRootPath={repoRoot}
                placeholder="请选择 project.cshrc"
                showOpen
                showSelectFile
              />
            </Form.Item>
          </Card>

          <Card size="small" style={{ marginBottom: 14 }} styles={{ body: { padding: 18 } }}>
            <CollapsibleSection title="stage 配置">
              <div style={{ marginBottom: 12, textAlign: 'right' }}>
                <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
                  历史记录
                </Button>
              </div>
              <Form.Item label="stage">
                <StageSelect
                  currentStage={stage}
                  setCurrentStage={setStage}
                  appendStage={appendStage}
                  removeStage={removeStage}
                  listStages={listStages}
                />
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
              <Form.Item label="执行脚本">
                <PathInput
                  state={commandCfg}
                  pathSources={['local']}
                  localRootPath={repoRoot}
                  placeholder="请选择执行脚本"
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

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '90%' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>配置生成历史记录</span>
          </div>
        }
        open={historyOpen}
        onCancel={() => {setHistoryOpen(false)}}
        footer={null}
        width={1600}
        style={{ top: 40 }}
        destroyOnHidden
      >
        <div style={{ marginTop: 12, marginBottom: 20 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
            paddingBottom: 12,
            marginBottom: 16
          }}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <DefaultConfgHistory flowKey={'verification'} />
            </Space>
          </div>
        </div>
      </Modal>
    </Spin>
  );
};

export default Step1CommonConfig;
