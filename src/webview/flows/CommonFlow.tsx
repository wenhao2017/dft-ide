import React, { useEffect } from 'react';
import { Alert, Badge, Button, Divider, Form, Radio, Space, Spin, Tooltip, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BranchesOutlined,
  CloudDownloadOutlined,
  DatabaseOutlined,
  SaveOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useVscodePath } from '../hooks/useVscodePath';
import { useFlowConfig } from '../hooks/useFlowConfig';
import PathInput from '../components/shared/PathInput';

const { Text, Title } = Typography;

const CommonFlow: React.FC = () => {
  const designTree = useVscodePath();
  const normTable  = useVscodePath();

  // ── 配置持久化 Hook ─────────────────────────────────
  const { savedData, loading, saving, syncing, hasUnsaved, handleSave, handleSync } =
    useFlowConfig('common');

  // 回填：从文件读到 savedData 后，填入各路径输入框
  useEffect(() => {
    if (!savedData) return;
    if (savedData.designTree) designTree.setValue(String(savedData.designTree));
    if (savedData.normTable)  normTable.setValue(String(savedData.normTable));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedData]);

  // ── 收集当前表单数据 ────────────────────────────────
  const collectFormData = () => ({
    designTree: designTree.value,
    normTable:  normTable.value,
  });

  const onSave = () => handleSave(collectFormData());
  const onSync = () => handleSync(collectFormData());

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <div>
        <div
          style={{
            border: '1px solid rgba(37,99,235,0.22)',
            borderRadius: 8,
            padding: '18px 20px',
            marginBottom: 20,
            background: 'linear-gradient(135deg, rgba(37,99,235,0.14), transparent 60%)',
          }}
        >
          <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: 700 }}>
            COMMON
          </Text>
          <Title level={3} style={{ margin: '6px 0 6px', fontSize: 22 }}>
            公共数据与分支同步
          </Title>
          <Text type="secondary">
            这里集中维护各流程都会复用的路径、分支和公共数据动作。
          </Text>
        </div>

        <Alert
          showIcon
          type="info"
          message="COMMON 是公共配置入口，可避免各流程重复维护同一份路径配置。"
          style={{ marginBottom: 20, borderRadius: 8 }}
        />

        {hasUnsaved && (
          <Alert
            showIcon
            type="warning"
            message="有尚未保存的本地配置，请先保存到本地状态目录。"
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        <div
          style={{
            border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
            borderRadius: 8,
            padding: 20,
            background: 'var(--vscode-editor-background)',
          }}
        >
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <Radio.Group defaultValue="design" buttonStyle="solid" size="large">
              <Radio.Button value="design">
                <BranchesOutlined style={{ marginRight: 8 }} />
                设计 Git 分支
              </Radio.Button>
              <Radio.Button value="verification">
                <BranchesOutlined style={{ marginRight: 8 }} />
                验证 Git 分支
              </Radio.Button>
            </Radio.Group>
          </div>

          <Form layout="vertical" style={{ maxWidth: 840, margin: '0 auto' }}>
            <Form.Item label="Design Tree 路径">
              <PathInput
                state={designTree}
                placeholder="请输入或选择 designtree 路径"
                size="large"
                showOpen
                showSelectFolder
              />
            </Form.Item>

            <Form.Item label="归一化表格路径">
              <PathInput
                state={normTable}
                placeholder="请输入或选择归一化表格路径"
                size="large"
                showOpen
                showSelectFile
              />
            </Form.Item>

            <Divider orientation="left">OBS 存储与公共数据</Divider>
            <Space size="middle" wrap>
              <Button size="large" icon={<DatabaseOutlined />}>
                打开 OBS 查看器
              </Button>
              <Button size="large" icon={<CloudDownloadOutlined />}>
                下载公共数据
              </Button>
            </Space>
          </Form>

          <Divider style={{ margin: '30px 0 22px' }} />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <Space wrap>
              <Tooltip title="Git Pull">
                <Button icon={<ArrowDownOutlined />} />
              </Tooltip>
              <Tooltip title="Git Push">
                <Button icon={<ArrowUpOutlined />} />
              </Tooltip>
              <Button icon={<BranchesOutlined />}>Git 详细操作</Button>
            </Space>
            <Space size="middle" wrap>
              <Badge dot={hasUnsaved} offset={[-4, 4]}>
                <Button
                  size="large"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={onSave}
                >
                  保存配置
                </Button>
              </Badge>
              <Button
                size="large"
                type="primary"
                icon={<SyncOutlined />}
                loading={syncing}
                onClick={onSync}
              >
                保存本地状态
              </Button>
            </Space>
          </div>
        </div>
      </div>
    </Spin>
  );
};

export default CommonFlow;
