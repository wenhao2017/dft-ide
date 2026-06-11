import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, Col, Form, Radio, Row, Select, Space, Spin, message, RadioChangeEvent, Modal } from 'antd';
import {
  BranchesOutlined,
  FileAddOutlined,
  FileTextOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  RightOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../../hooks/useVscodePath';
import { useFlowConfig } from '../../hooks/useFlowConfig';
import PathInput from '../shared/PathInput';
import { generateDefaultFlowConfigs, getGitInfo } from '../../utils/ipc';
import useWizardStore from '../../store/wizardStore';
import CollapsibleSection from '../shared/CollapsibleSection';
import ControlledPathInput from '../shared/ControlledPathInput';
import Link from 'antd/es/typography/Link';

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

const domainOptions = [
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

const emptyNormalizeCfg = (): NormalizeCfg => ({ commandCfg: '', jsonCfg: '' });

const Step1CommonConfig: React.FC<Props> = ({ onNext, moduleKey, category }) => {
  const flowKey = category.toLowerCase();
  const project = useVscodePath();
  const workPath = useVscodePath();
  // const sailorCfg = useVscodePath();
  const [domainCfg, setDomainCfg] = useState<number>(1);

  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [normalizeCfgs, setNormalizeCfgs] = useState<NormalizeCfg[]>([emptyNormalizeCfg()]);
  const [generating, setGenerating] = useState(false);
  const [normalizeIndex, setNormalizeIndex] = useState<number>(0);
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
    if (source.workPath) workPath.setValue(String(source.workPath));
    // if (source.sailorCfg) sailorCfg.setValue(String(source.sailorCfg));
    if (source.domainCfg) setDomainCfg(Number(source.domainCfg))

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
      if (typeof source.normalizeIndex === 'number') {
        setNormalizeIndex(Math.max(0, Math.min(source.normalizeIndex, normalizedCfgs.length - 1)));
      }
    } else if (typeof source.normalizeIndex === 'number') {
      setNormalizeIndex(Math.max(0, source.normalizeIndex));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData, moduleKey]);

  const collectFormData = () => ({
    project: project.value,
    workPath: workPath.value,
    domainCfg,
    // sailorCfg: sailorCfg.value,
    normalizeCfgs,
    normalizeIndex,
  });

  const onSave = () => {
    const data = collectFormData();
    if (!moduleKey) {
      void handleSave(data);
      return;
    }
    void handleSave({ moduleKey, step1: data });
  };

  const handleRadioChange = (e: RadioChangeEvent) => {
    setNormalizeIndex(Number(e.target.value));
  };

  const addNormalizeCfg = () => {
    setNormalizeCfgs((prev) => [...prev, emptyNormalizeCfg()]);
  };

  const removeNormalizeCfg = (index: number) => {
    setNormalizeCfgs((prev) => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : [emptyNormalizeCfg()];
    });
    setNormalizeIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return 0;
      return prev;
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

  const configHeader = (
    <Row style={{ marginBottom: 4 }}>
      <Col span={1} />
      <Col span={22} style={{ marginLeft: 4 }}>执行脚本</Col>
      {/* <Col span={11} style={{ marginLeft: 4 }}>配置json文件</Col> */}
    </Row>
  );

  const onGenerateDefaults = async () => {
    setGenerating(true);
    try {
      const result = await generateDefaultFlowConfigs(flowKey as 'hibist' | 'sailor');
      if (!result.success) {
        message.error(result.error ?? '生成默认配置失败');
        return;
      }
      message.success(`已生成 ${result.created} 个默认 cfg，目录：${result.configsDir ?? 'configs'}`);
    } finally {
      // setGenerating(false);
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

            {/* <Form.Item label={`common ${category} cfg`}>
              <PathInput
                state={sailorCfg}
                pathSources={['local']}
                placeholder={`请选择 common ${category} cfg`}
                showOpen
                showSelectFile
              />
            </Form.Item> */}

            <Form.Item label="选择领域">
              <Select
                value={domainCfg}
                onChange={(value) => setDomainCfg(value)}
                allowClear
                placeholder="请选择领域"
                options={domainOptions}
              />
            </Form.Item>
          </Card>

          <Card size="small" style={{ marginBottom: 14 }} styles={{ body: { padding: 18 } }}>
            <CollapsibleSection title="归一化表格转 cfg">
              {configHeader}
              {normalizeCfgs.map((normalizeCfg, index) => (
                <Row key={index} gutter={8} style={{ marginBottom: 16 }}>
                  <Col span={1}>
                    <Space>
                      <Radio checked={normalizeIndex === index} onChange={handleRadioChange} value={index} />
                    </Space>
                  </Col>
                  <Col span={22} className="dft-path-input">
                    <ControlledPathInput
                      value={normalizeCfg.commandCfg}
                      onChange={(value) => setNormalCfg(index, value, 1)}
                      placeholder="请选择执行脚本"
                      pathSources={['local']}
                      showSelectFile
                      showOpen
                    />
                  </Col>
                  {/* <Col span={11} className="dft-path-input">
                    <ControlledPathInput
                      value={normalizeCfg.jsonCfg}
                      onChange={(value) => setNormalCfg(index, value, 2)}
                      placeholder="请选择json文件"
                      pathSources={['local']}
                      showSelectFile
                      showOpen
                    />
                  </Col> */}
                  <Col span={1}>
                    <Button
                      type="text"
                      danger
                      icon={<MinusCircleOutlined />}
                      onClick={() => removeNormalizeCfg(index)}
                    />
                  </Col>
                </Row>
              ))}
              <Button type="dashed" onClick={() => addNormalizeCfg()} block icon={<PlusOutlined />}>
                添加
              </Button>
            </CollapsibleSection>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <Button icon={<FileAddOutlined />} onClick={onGenerateDefaults}>
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
              <span style={{ fontSize: 16, fontWeight: 700 }}>产生配置日志</span>
            </div>
          }
          open={generating}
          onCancel={() => {setGenerating(false)}}
          footer={null}
          width={750}
          style={{ top: 40 }}
          destroyOnHidden
        >
          <div style={{ marginTop: 12, marginBottom: 20 }}>
            {/* Steps bar */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              borderBottom: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
              paddingBottom: 12,
              marginBottom: 16
            }}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Space size="large">
                  <Link>
                    <FileTextOutlined /> {flowKey}/normalized-table.md
                  </Link>
                  <Link>
                    <FileTextOutlined /> {flowKey}/design_tree.mock.json
                  </Link>
                  <Link>
                    <FileTextOutlined /> {flowKey}/execution.log
                  </Link>
                </Space>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <Button onClick={() => setGenerating(false)}>关闭</Button>
                </div>
              </Space>
            </div>
          </div>
        </Modal>
    </Spin>
  );
};

export default Step1CommonConfig;
