import React, { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Form,
  Space,
  Spin,
  Tabs,
  Typography,
} from 'antd'
import {
  AppstoreOutlined,
  LeftOutlined,
  RightOutlined,
  SaveOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons'

import { useFlowConfig } from '../../hooks/useFlowConfig'
import {
  migrateLegacyClusterSubmission,
  type ClusterSubmissionConfig,
} from '../../../shared/clusterSubmission'
import ClusterSubmissionConfigEditor from '../shared/ClusterSubmissionConfig'
import PipelineExecutionOverview from '../shared/PipelineExecutionOverview'
import ToolConfigEditor from '../shared/ToolConfigEditor'
import type { LanderStep } from './mode/types'
import { useVerificationStageConfig } from './mode/ModePanel/hooks/useVerificationStageConfig'

interface Props {
  onNext: () => void
  onPrev: () => void
  moduleKey?: string
  onModuleSelect?: (moduleKey: string) => void
  moduleKeys: string[]
  moduleWorkDirs?: Record<string, string>
  defaultStepsByModule?: Record<string, LanderStep[]>
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
  moduleKeys,
  moduleWorkDirs,
  defaultStepsByModule,
}) => {
  const [activeTab, setActiveTab] = useState('environment')
  const [form] = Form.useForm()
  const { stage } = useVerificationStageConfig()
  const flowLabel = stage ? `Lander / ${stage}` : 'Lander'
  const {
    savedData,
    loading,
    saving,
    hasUnsaved,
    handleSave,
    markDirty,
  } = useFlowConfig('verification')

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

  const save = async () => {
    const values = form.getFieldsValue(true) as Record<string, unknown>
    const previousStep2 = (savedData?.step2 as Record<string, unknown> | undefined) ?? {}
    await handleSave({
      step2: {
        ...previousStep2,
        step2Task: values,
      },
    })
  }

  return (
    <Spin spinning={loading} tip="正在读取 Verification Flow 配置...">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        items={[
          {
            key: 'environment',
            label: <Space><SettingOutlined />工具与集群</Space>,
            children: (
              <Form
                form={form}
                layout="vertical"
                onValuesChange={markDirty}
                style={{ paddingTop: 12 }}
              >
                <Card
                  title={<Space><ToolOutlined />工具配置</Space>}
                  extra={<Typography.Text type="secondary">Flow 级配置 · 所有 Mode 共用</Typography.Text>}
                  style={{ marginBottom: 16 }}
                >
                  <Form.Item name="tools" noStyle>
                    <ToolConfigEditor />
                  </Form.Item>
                </Card>

                <Form.Item name="cluster" noStyle>
                  <ClusterSubmissionConfigEditor />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'execution',
            label: <Space><AppstoreOutlined />配置执行</Space>,
            children: (
              <PipelineExecutionOverview
                flowKey="verification"
                flowLabel={flowLabel}
                moduleKeys={moduleKeys}
                moduleWorkDirs={moduleWorkDirs}
                defaultTasksByModule={defaultStepsByModule}
                activeModuleKey={moduleKey}
                onActiveModuleChange={onModuleSelect}
              />
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
        <Badge dot={hasUnsaved} offset={[-4, 4]}>
          <Button icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
            保存 Flow 配置
          </Button>
        </Badge>
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </Spin>
  )
}

export default Step2ToolConfig
