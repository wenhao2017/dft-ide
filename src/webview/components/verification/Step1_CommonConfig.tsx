import React, { useEffect, useState } from 'react';
import { Button, Form, Space, Spin, Modal, Typography, Divider, message } from 'antd';
import {
  BranchesOutlined,
  CaretRightOutlined,
  HistoryOutlined,
  RightOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { getGitInfo, type RepoKey, appendLanderStage, removeLanderStage, getLanderStages, generateLanderConfigs } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';
import TransformHistory from '../shared/TransformHistory';
import StageSelect from '../shared/TransformStageSelect';

const { Title } = Typography;

interface Props {
  onNext?: () => void;
  moduleKey?: string;
  category?: string;
}

const Step1CommonConfig: React.FC<Props> = ({ onNext, moduleKey }) => {
  const flowKey = 'verification';
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [stage, setStage] = useState<string>('');
  const project = useVscodePath();
  const landerAssistant = useVscodePath();

  const [repoRoot, setRepoRoot] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const updatePayload = useWizardStore((state) => state.updatePayload);

  const { savedData, loading, saving, handleSave } =
    useFlowConfig(moduleKey ? `${flowKey}/${moduleKey}/config` : flowKey);

  useEffect(() => {
    getGitInfo(flowKey as RepoKey)
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
  }, [updatePayload, flowKey]);

  useEffect(() => {
    clearForm();
    if (!savedData) return;
    const source = (savedData.step1 as Record<string, unknown> | undefined) ?? savedData;
    if (source.project) project.setValue(String(source.project));
    if (source.landerAssistant) landerAssistant.setValue(String(source.landerAssistant));
    if (source.stage) setStage(String(source.stage));
  }, [savedData, moduleKey]);

  const collectFormData = () => {
    const source = savedData
      ? ((savedData.step1 as Record<string, unknown> | undefined) ?? savedData)
      : {};
    return {
      ...source,
      project: project.value,
      landerAssistant: landerAssistant.value,
      stage,
    };
  };

  const onSave = () => {
    const data = collectFormData();
    if (!moduleKey) {
      void handleSave(data);
      return;
    }
    void handleSave({ moduleKey, step1: data });
  };

  const clearForm = () => {
    project.setValue("");
    landerAssistant.setValue("");
    setStage("");
  };

  const onGenerateDefaults = async () => {
    if (!stage) {
      message.warning('请先选择 stage。');
      return;
    }
    if (!landerAssistant.value) {
      message.warning('请选择 LANDER_ASSISTANT.json。');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateLanderConfigs(stage, landerAssistant.value);
      if (!result.success) {
        throw new Error(result.error ?? 'Verification 配置转换失败');
      }
      message.success('Verification 配置转换完成。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
    }
  };

  const appendStage = async (
    addValue: string, extendValue: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await appendLanderStage('verification', addValue, extendValue);
    return result;
  };

  const removeStage = async (removeValue: string): Promise<{ success: boolean; error?: string }> => {
    const result = await removeLanderStage('verification', removeValue);
    return result;
  };

  const listStages = async (): Promise<{ success: boolean; stages: string[]; error?: string }> => {
    const result = await getLanderStages('verification');
    return result;
  };

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div
            style={{
              border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.24))',
              borderRadius: 8,
              padding: 18,
              background: 'var(--vscode-editor-background)',
            }}
          >
            <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
              <Space direction="vertical" size={6}>
                <Title level={4} style={{ margin: 0 }}>
                  归一化表格转config
                </Title>
              </Space>
              <Space>
                <Button shape="round" icon={<BranchesOutlined />} style={{ cursor: 'default' }}>
                  {currentBranch || '获取分支中...'}
                </Button>
              </Space>
            </Space>

            <Divider style={{ margin: '16px 0' }} />

            <Space direction="vertical" size={12} style={{ width: '100%' }}>
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
              <Form.Item label="选择stage">
                <StageSelect
                  currentStage={stage}
                  setCurrentStage={setStage}
                  appendStage={appendStage}
                  removeStage={removeStage}
                  listStages={listStages}
                />
              </Form.Item>
              <Form.Item label="lander_assistant">
                <PathInput
                  state={landerAssistant}
                  pathSources={['local']}
                  localRootPath={repoRoot}
                  placeholder="请选择 LANDER_ASSISTANT.json"
                  showOpen
                  showSelectFile
                />
              </Form.Item>
            </Space>

            <Divider style={{ margin: '18px 0 14px' }} />

            <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
              <Space>
                <Button icon={<SaveOutlined />} loading={saving} onClick={onSave}>
                  保存
                </Button>
                <Button
                  type="primary"
                  loading={generating}
                  onClick={onGenerateDefaults}
                  icon={<CaretRightOutlined />}
                  style={{ width: 150 }}
                >
                  表格转cfg
                </Button>
                <Button icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
                  转换历史记录
                </Button>
              </Space>
              <Button type="primary" onClick={onNext}>
                下一页 <RightOutlined />
              </Button>
            </Space>
          </div>
        </div>
      </Form>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '90%' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>转换历史记录</span>
          </div>
        }
        open={historyOpen}
        onCancel={() => { setHistoryOpen(false) }}
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
              <TransformHistory flowKey={flowKey} stage={stage} />
            </Space>
          </div>
        </div>
      </Modal>
    </Spin>
  );
};

export default Step1CommonConfig;
