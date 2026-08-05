import React, { useEffect, useMemo, useState } from 'react'
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
import PipelineExecutionOverview from '../shared/PipelineExecutionOverview'
import ScopedEnvironmentConfig, { type ScopedEnvironmentOverride } from '../shared/ScopedEnvironmentConfig'
import type { ToolConfig } from '../shared/toolConfigTypes'
import { DESIGN_FLOW_ACCENTS } from '../../flowTheme'
import { getModules } from '../../utils/ipc'

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
  const accent = DESIGN_FLOW_ACCENTS[repo]
  const [form] = Form.useForm()
  const [configuredModules, setConfiguredModules] = useState<string[]>([])
  const tools = (Form.useWatch('tools', { form, preserve: true }) as ToolConfig[] | undefined) ?? []
  const cluster = (Form.useWatch('cluster', { form, preserve: true }) as ClusterSubmissionConfig | undefined) ?? DEFAULT_CLUSTER
  const scopedOverrides = (Form.useWatch('scopedOverrides', { form, preserve: true }) as Record<string, ScopedEnvironmentOverride> | undefined) ?? {}
  const scopeKeys = useMemo(
    () => Array.from(new Set([...configuredModules, ...moduleKeys])).filter(Boolean),
    [configuredModules, moduleKeys],
  )
  const {
    savedData,
    loading,
    debouncedSave,
  } = useFlowConfig(repo)

  useEffect(() => {
    void getModules(repo).then((result) => {
      if (result.success) setConfiguredModules(result.modules)
    }).catch(() => setConfiguredModules([]))
  }, [repo])

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
      scopedOverrides: (step2.scopedOverrides as Record<string, ScopedEnvironmentOverride> | undefined) ?? {},
    })
  }, [form, savedData])

  const autoSave = (values: Record<string, unknown>) => {
    const previousStep2 = (savedData?.step2 as Record<string, unknown> | undefined) ?? {}
    const { scopedOverrides: nextOverrides = {}, ...step2Task } = values
    debouncedSave({
      step2: {
        ...previousStep2,
        step2Task,
        scopedOverrides: nextOverrides,
      },
    })
  }

  const updateField = (name: string, value: unknown) => {
    form.setFieldValue(name, value)
    autoSave(form.getFieldsValue(true) as Record<string, unknown>)
  }

  const handlePrev = () => {
    if (activeTab === 'execution') {
      onActiveTabChange('environment')
      return
    }
    onPrev()
  }

  const handleNext = () => {
    if (activeTab === 'environment') {
      onActiveTabChange('execution')
      return
    }
    onNext()
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
                style={{ paddingTop: 12 }}
              >
                <ScopedEnvironmentConfig
                  flowKey={repo}
                  scopeLabel="Module"
                  scopeKeys={scopeKeys}
                  accent={accent}
                  defaultTools={tools}
                  defaultCluster={cluster}
                  overrides={scopedOverrides}
                  onDefaultToolsChange={(value) => updateField('tools', value)}
                  onDefaultClusterChange={(value) => updateField('cluster', value)}
                  onOverridesChange={(value) => updateField('scopedOverrides', value)}
                />
              </Form>
            ),
          },
          {
            key: 'execution',
            label: <Space><AppstoreOutlined />配置执行</Space>,
            children: (
              <div style={{ paddingTop: 12 }}>
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
        <Button onClick={handlePrev} icon={<LeftOutlined />}>上一页</Button>
        <Button type="primary" onClick={handleNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </Spin>
  )
}

export default Step2ToolConfig
