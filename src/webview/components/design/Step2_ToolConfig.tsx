import React, { useEffect } from 'react'
import {
  Button,
  Form,
  Space,
  Spin,
  Tabs,
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
            label: <Space><SettingOutlined />工具与集群</Space>,
            children: (
              <Form
                form={form}
                layout="vertical"
                onValuesChange={(_changed, values) => autoSave(values)}
                style={{ paddingTop: 12 }}
              >
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <Form.Item name="tools" noStyle>
                      <ToolConfigEditor section accent={accent} scopeLabel="按需配置工具版本或本地路径；未指定时沿用当前运行环境。" />
                    </Form.Item>
                  </div>
                  <div>
                    <Form.Item name="cluster" noStyle>
                      <ClusterSubmissionConfigEditor accent={accent} />
                    </Form.Item>
                  </div>
                </div>
              </Form>
            ),
          },
          {
            key: 'execution',
            label: <Space><AppstoreOutlined />配置执行</Space>,
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
