import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, Form, Space, Spin, Modal, Flex, Typography, Checkbox } from 'antd';
import {
  BranchesOutlined,
  FileAddOutlined,
  HistoryOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  RightOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { generateDefaultFlowConfigs, getGitInfo, type RepoKey } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';
import CollapsibleSection from '../shared/CollapsibleSection';
import ControlledPathInput from '../shared/ControlledPathInput';
import DefaultConfgHistory from './DefaultConfgHistory';

const { Text } = Typography;

interface Props {
  onNext?: () => void;
  moduleKey?: string;
  category: string;
}

export interface NormalizeCfg {
  commandCfg: string;
  jsonCfg: string;
}

const pageStyle: React.CSSProperties = {
  padding: 4,
  color: 'var(--vscode-foreground)',
};

const emptyNormalizeCfg = (): NormalizeCfg => ({ commandCfg: '', jsonCfg: '' });

const Step1CommonConfig: React.FC<Props> = ({ onNext, moduleKey, category }) => {
  const flowKey = category.toLowerCase();
  const [currentBranch, setCurrentBranch] = useState<string>('');

  const project = useVscodePath();
  const [normalizeCfgs, setNormalizeCfgs] = useState<NormalizeCfg[]>([emptyNormalizeCfg()]);
  const [selectedNormalizeIndexes, setSelectedNormalizeIndexes] = useState<number[]>([0]);

  const [repoRoot, setRepoRoot] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const updatePayload = useWizardStore((state) => state.updatePayload);

  const { savedData, loading, saving, hasUnsaved, handleSave } =
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

    if (Array.isArray(source.normalizeCfgs)) {
      const nextCfgs = source.normalizeCfgs
        .map((item) => {
          if (!item || typeof item !== 'object') return undefined;
          const cfg = item as Partial<NormalizeCfg>;
          return {
            commandCfg: String(cfg.commandCfg ?? ''),
            jsonCfg: String(cfg.jsonCfg ?? ''),
          };
        })
        .filter((item): item is NormalizeCfg => Boolean(item));
      const normalizedCfgs = nextCfgs.length > 0 ? nextCfgs : [emptyNormalizeCfg()];
      setNormalizeCfgs(normalizedCfgs);
      if (Array.isArray(source.selectedNormalizeIndexes)) {
        setSelectedNormalizeIndexes(
          source.selectedNormalizeIndexes.filter(
            (index): index is number => typeof index === 'number',
          ),
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData, moduleKey]);

  const collectFormData = () => ({
    project: project.value,
    normalizeCfgs,
    selectedNormalizeIndexes,
  });

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
    setNormalizeCfgs([emptyNormalizeCfg()]);
    setSelectedNormalizeIndexes([0]);
  };

  const addNormalizeCfg = () => {
    setNormalizeCfgs((prev) => [...prev, emptyNormalizeCfg()]);
  };

  const removeNormalizeCfg = (index: number) => {
    setNormalizeCfgs((prev) => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : [emptyNormalizeCfg()];
    });
    setSelectedNormalizeIndexes((prev: number[]) => {
      return prev.filter(i => i !== index);
    });
  };

  const setNormalCfg = (index: number, value: string, type: 1 | 2) => {
    setNormalizeCfgs((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex === index) {
          return type === 1 ? { ...item, commandCfg: value } : { ...item, jsonCfg: value };
        }
        return item;
      })
    );
  };

  const onGenerateDefaults = async () => {
    setGenerating(true);
    try {
      for(const index of selectedNormalizeIndexes){
        if (normalizeCfgs[index].commandCfg) {
          await generateDefaultFlowConfigs(flowKey as 'hibist' | 'sailor', normalizeCfgs[index].commandCfg);
        }
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCheckboxChange = (index: number, checked: boolean) => {
    setSelectedNormalizeIndexes((prev: number[]) => {
      if (checked) {
        return [...prev, index];
      } else {
        return prev.filter(i => i !== index);
      }
    });
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
            <CollapsibleSection title="归一化表格转 cfg">
              <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                <Text strong>执行脚本</Text>
                <Button
                  size="small"
                  icon={<HistoryOutlined />}
                  onClick={() => setHistoryOpen(true)}
                >
                  历史记录
                </Button>
              </Flex>
              <Flex vertical gap={12}>
                {normalizeCfgs.map((normalizeCfg, index) => {
                  const isSelected = selectedNormalizeIndexes.includes(index);
                  return (
                    <Flex key={index} align="center" gap={8}>
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => handleCheckboxChange(index, e.target.checked)}
                        style={{ flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <ControlledPathInput
                          value={normalizeCfg.commandCfg}
                          onChange={(value) => setNormalCfg(index, value, 1)}
                          placeholder="请选择执行脚本"
                          pathSources={['local']}
                          localRootPath={repoRoot}
                          showSelectFile
                          showOpen
                        />
                      </div>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<MinusCircleOutlined />}
                        onClick={() => removeNormalizeCfg(index)}
                        style={{ flexShrink: 0 }}
                        disabled={normalizeCfgs.length <= 1} // 至少保留一项
                      />
                    </Flex>
                  )
                })}
              </Flex>
              <Flex justify="center" style={{ marginTop: 16 }}>
                <Button
                  type="dashed"
                  onClick={addNormalizeCfg}
                  icon={<PlusOutlined />}
                  style={{ width: '100%', maxWidth: 300 }}
                >
                  添加执行脚本
                </Button>
              </Flex>
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
                <DefaultConfgHistory flowKey={flowKey} />
              </Space>
            </div>
          </div>
        </Modal>
    </Spin>
  );
};

export default Step1CommonConfig;
