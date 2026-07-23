import React, { useEffect, useState } from 'react';
import { Form, Space, Spin, Modal, message } from 'antd';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { getGitInfo, type RepoKey, appendLanderStage, removeLanderStage, getLanderStages, generateLanderConfigs } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';
import TransformHistory from '../shared/TransformHistory';
import StageSelect from '../shared/TransformStageSelect';
import TransformConfigPanel from '../shared/TransformConfigPanel';

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
      <Form layout="vertical">
        <TransformConfigPanel
          accent="#059669"
          flowLabel="Verification"
          branch={currentBranch}
          description="结合 Stage 与 LANDER_ASSISTANT.json，将归一化数据转换为验证流程所需的 CFG 配置。"
          scopeLabel="选择验证 Stage"
          saving={saving}
          generating={generating}
          onSave={onSave}
          onGenerate={onGenerateDefaults}
          onHistory={() => setHistoryOpen(true)}
          onNext={onNext}
        >
          <Form.Item label="项目环境文件" extra="用于加载当前项目的工具与环境变量配置。">
            <PathInput
              state={project}
              pathSources={['local']}
              localRootPath={repoRoot}
              placeholder="请选择 project.cshrc"
              showOpen
              showSelectFile
            />
          </Form.Item>
          <Form.Item label="验证 Stage" extra="选择 CFG 的输出 Stage，也可在此新增或维护 Stage。">
            <StageSelect
              currentStage={stage}
              setCurrentStage={setStage}
              appendStage={appendStage}
              removeStage={removeStage}
              listStages={listStages}
            />
          </Form.Item>
          <Form.Item label="Lander 配置源" extra="选择用于生成验证 CFG 的 LANDER_ASSISTANT.json。">
            <PathInput
              state={landerAssistant}
              pathSources={['local']}
              localRootPath={repoRoot}
              placeholder="请选择 LANDER_ASSISTANT.json"
              showOpen
              showSelectFile
            />
          </Form.Item>
        </TransformConfigPanel>
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
