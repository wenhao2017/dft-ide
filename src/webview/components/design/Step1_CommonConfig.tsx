import React, { useEffect, useState } from 'react';
import { Form, Space, Spin, Modal, message } from 'antd';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { generateDefaultFlowConfigs, getGitInfo, type RepoKey, getModules } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';
import TransformHistory from '../shared/TransformHistory';
import ModuleSelect from '../shared/TransformModuleSelect';
import TransformConfigPanel from '../shared/TransformConfigPanel';

interface Props {
  onNext?: () => void;
  moduleKey?: string;
  category: string;
}

interface ModuleOption {
  label: string;
  value: string;
}

const Step1CommonConfig: React.FC<Props> = ({ onNext, moduleKey, category }) => {
  const flowKey = category.toLowerCase() as 'hibist' | 'sailor';
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [moduleOptions, setModuleOptions] = useState<ModuleOption[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const project = useVscodePath();

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

    // 获取归一化表格的模块
    getModules(flowKey)
      .then((res) => {
        if (res.success) {
          setModuleOptions(res.modules.map(item => {
            return { label: item, value: item };
          }));
        } else {
          setModuleOptions([]);
        }
      })
      .catch(() => setModuleOptions([]));

  }, [updatePayload, flowKey]);

  useEffect(() => {
    clearForm();
    if (!savedData) return;
    const source = (savedData.step1 as Record<string, unknown> | undefined) ?? savedData;
    if (source.project) project.setValue(String(source.project));
    if (Array.isArray(source.selectedModules)) {
      setSelectedModules(source.selectedModules.filter((item): item is string => typeof item === 'string'));
    }
  }, [savedData, moduleKey]);

  const collectFormData = () => {
    const source = savedData
      ? ((savedData.step1 as Record<string, unknown> | undefined) ?? savedData)
      : {};
    return {
      ...source,
      project: project.value,
      selectedModules,
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
    setSelectedModules([]);
  };

  const onGenerateDefaults = async () => {
    if (selectedModules.length === 0) {
      message.warning('请至少选择一个 module。');
      return;
    }
    setGenerating(true);
    try {
      for (const module of selectedModules) {
        const result = await generateDefaultFlowConfigs(flowKey, module);
        if (!result.success) {
          throw new Error(result.error ?? `${module} 转换失败`);
        }
      }
      message.success(`已完成 ${selectedModules.length} 个 module 的配置转换。`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <Form layout="vertical">
        <TransformConfigPanel
          accent={flowKey === 'sailor' ? '#0ea5e9' : '#7c3aed'}
          flowLabel={category}
          branch={currentBranch}
          description="读取归一化表格中的模块信息，为选中的设计模块生成默认 CFG 配置。"
          scopeLabel="选择设计模块"
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
          <Form.Item label="转换模块" extra="可同时选择多个 Module 批量生成默认配置。">
            <ModuleSelect
              options={moduleOptions}
              selectedValues={selectedModules}
              onSelectionChange={setSelectedModules}
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
              <TransformHistory flowKey={flowKey} />
            </Space>
          </div>
        </div>
      </Modal>
    </Spin>
  );
};

export default Step1CommonConfig;
