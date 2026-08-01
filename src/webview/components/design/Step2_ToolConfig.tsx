import React, { useEffect } from 'react'
import {
  Button,
  Col,
  Form,
  Row,
  Space,
  Spin,
  Tag,
  Tabs,
  Typography,
} from 'antd'
import {
  AppstoreOutlined,
  LeftOutlined,
  RightOutlined,
  SettingOutlined,
} from '@ant-design/icons'

import { useFlowConfig } from '../../hooks/useFlowConfig'
import {
  migrateLegacyClusterSubmission,
  type ClusterSubmissionConfig,
} from '../../../shared/clusterSubmission'
import ClusterSubmissionConfigEditor from '../shared/ClusterSubmissionConfig'
import ExecutionContextBridge from '../shared/ExecutionContextBridge'
import PipelineExecutionOverview from '../shared/PipelineExecutionOverview'
import ToolConfigEditor from '../shared/ToolConfigEditor'

interface Props {
  onNext: () => void
  onPrev: () => void
  moduleKey?: string
  onModuleSelect?: (moduleKey: string) => void
  category: string
  moduleKeys: string[]
  moduleWorkDirs?: Record<string, string>
  activeTab: 'environment' | 'execution'
  onActiveTabChange: (tab: 'environment' | 'execution') => void
}

const DEFAULT_CLUSTER: ClusterSubmissionConfig = {
  mode: 'alias',
  aliasName: '',
}

const Step2ToolConfig: React.FC<Props> = ({
  onNext,
  onPrev,
  moduleKey,
  onModuleSelect,
  category,
  moduleKeys,
  moduleWorkDirs,
  activeTab,
  onActiveTabChange,
}) => {
  const repo = category.toLowerCase() === 'sailor' ? 'sailor' : 'hibist'
  const flowLabel = repo === 'sailor' ? 'Sailor' : 'Hibist'
  const accent = repo === 'sailor' ? '#0ea5e9' : '#7c3aed'
  const [form] = Form.useForm()
  const {
    savedData,
    loading,
    debouncedSave,
  } = useFlowConfig(repo)

  useEffect(() => {
    if (!savedData) {
      form.setFieldsValue({ cluster: DEFAULT_CLUSTER })
      return
    }
    const step2 = (savedData.step2 as Record<string, unknown> | undefined) ?? savedData
    const task = (step2.step2Task as Record<string, unknown> | undefined) ?? {}
    form.setFieldsValue({
      ...task,
      cluster: migrateLegacyClusterSubmission(task) ?? DEFAULT_CLUSTER,
    })
  }, [form, savedData])

  const autoSave = (values: Record<string, unknown>) => {
    const previousStep2 = (savedData?.step2 as Record<string, unknown> | undefined) ?? {}
    debouncedSave({
      step2: {
        ...previousStep2,
        step2Task: values,
      },
    })
  }

  return (
    <Spin spinning={loading} tip="正在读取 Flow 配置...">
      <Tabs
        activeKey={activeTab}
        onChange={(tab) => onActiveTabChange(tab as 'environment' | 'execution')}
        type="card"
        items={[
          {
            key: 'environment',
            label: (
              <Space size={7}>
                <SettingOutlined />工具与集群
                <Tag color="purple" bordered={false} style={{ margin: 0, fontSize: 11 }}>Flow 级</Tag>
              </Space>
            ),
            children: (
              <Form
                form={form}
                layout="vertical"
                onValuesChange={(_changed, values) => autoSave(values)}
                style={{ paddingTop: 12 }}
              >
                <div style={{ marginBottom: 14 }}>
                  <Typography.Text strong>Flow 运行环境</Typography.Text>
                  <div>
                    <Typography.Text type="secondary">
                      工具与集群策略是两个独立的 Flow 级配置项，修改后自动保存并对所有 Module 生效。
                    </Typography.Text>
                  </div>
                </div>
                <Row gutter={[16, 16]} align="stretch">
                  <Col xs={24} xl={12} style={{ display: 'flex' }}>
                    <Form.Item name="tools" noStyle>
                      <ToolConfigEditor section scopeLabel="配置工具版本或本地路径，当前 Flow 的所有 Module 共用。" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} xl={12} style={{ display: 'flex' }}>
                    <Form.Item name="cluster" noStyle>
                      <ClusterSubmissionConfigEditor />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            ),
          },
          {
            key: 'execution',
            label: (
              <Space size={7}>
                <AppstoreOutlined />配置执行
                <Tag color="processing" bordered={false} style={{ margin: 0, fontSize: 11 }}>Module 级</Tag>
              </Space>
            ),
            children: (
              <div className="dft-execution-view" style={{ paddingTop: 12 }}>
                <ExecutionContextBridge scope="Module" accent={accent} />
                <PipelineExecutionOverview
                  flowKey={repo}
                  flowLabel={flowLabel}
                  moduleKeys={moduleKeys}
                  moduleWorkDirs={moduleWorkDirs}
                  activeModuleKey={moduleKey}
                  onActiveModuleChange={onModuleSelect}
                />
              </div>
            ),
          },
        ]}
      />

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginTop: 20,
        paddingTop: 16,
        borderTop: '1px solid var(--vscode-panel-border)',
      }}>
        <Button onClick={onPrev} icon={<LeftOutlined />}>上一页</Button>
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </Spin>
  )
}

export default Step2ToolConfig
