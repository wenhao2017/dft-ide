import { Alert, Empty, Segmented, Select, Space, Switch, Tag, Typography } from 'antd'
import { ApartmentOutlined, SettingOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'

import type { ClusterSubmissionConfig } from '../../../shared/clusterSubmission'
import type { RepoKey } from '../../utils/ipc'
import ClusterSubmissionConfigEditor from './ClusterSubmissionConfig'
import ToolConfigEditor from './ToolConfigEditor'
import type { ToolConfig } from './toolConfigTypes'

const { Text, Title } = Typography

export interface ScopedEnvironmentOverride {
  tools?: ToolConfig[]
  cluster?: ClusterSubmissionConfig
}

interface Props {
  flowKey: Extract<RepoKey, 'hibist' | 'sailor' | 'verification'>
  scopeLabel: 'Module' | 'Mode'
  scopeKeys: string[]
  accent: string
  defaultTools: ToolConfig[]
  defaultCluster: ClusterSubmissionConfig
  overrides: Record<string, ScopedEnvironmentOverride>
  onDefaultToolsChange: (tools: ToolConfig[]) => void
  onDefaultClusterChange: (cluster: ClusterSubmissionConfig) => void
  onOverridesChange: (overrides: Record<string, ScopedEnvironmentOverride>) => void
}

export default function ScopedEnvironmentConfig({
  flowKey,
  scopeLabel,
  scopeKeys,
  accent,
  defaultTools,
  defaultCluster,
  overrides,
  onDefaultToolsChange,
  onDefaultClusterChange,
  onOverridesChange,
}: Props) {
  const [view, setView] = useState<'default' | 'special'>('default')
  const [scopeKey, setScopeKey] = useState('')
  const availableKeys = useMemo(
    () => Array.from(new Set([...scopeKeys, ...Object.keys(overrides)])).filter(Boolean).sort(),
    [overrides, scopeKeys],
  )

  useEffect(() => {
    if (scopeKey && availableKeys.includes(scopeKey)) return
    setScopeKey(availableKeys[0] ?? '')
  }, [availableKeys, scopeKey])

  const current = overrides[scopeKey] ?? {}
  const updateCurrent = (patch: ScopedEnvironmentOverride) => {
    if (!scopeKey) return
    const nextValue = { ...current, ...patch }
    const next = { ...overrides }
    if (nextValue.tools === undefined && nextValue.cluster === undefined) delete next[scopeKey]
    else next[scopeKey] = nextValue
    onOverridesChange(next)
  }

  const status = (key: string) => {
    const value = overrides[key]
    if (value?.tools !== undefined && value?.cluster !== undefined) return '工具、集群已覆盖'
    if (value?.tools !== undefined) return '工具已覆盖'
    if (value?.cluster !== undefined) return '集群已覆盖'
    return '完全继承'
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: 14, border: '1px solid var(--vscode-panel-border)', borderRadius: 10,
      }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>配置范围</Title>
          <Text type="secondary">默认配置对整个流程生效，特殊配置仅覆盖选中的 {scopeLabel}。</Text>
        </div>
        <Segmented
          value={view}
          onChange={(value) => setView(value as 'default' | 'special')}
          options={[
            { value: 'default', label: <Space><SettingOutlined />默认配置</Space> },
            { value: 'special', label: <Space><ApartmentOutlined />特殊配置</Space> },
          ]}
        />
      </div>

      {view === 'default' ? (
        <>
          <ToolConfigEditor
            section
            accent={accent}
            value={defaultTools}
            onChange={onDefaultToolsChange}
            scopeLabel="配置流程默认使用的工具版本或本地路径。"
          />
          <ClusterSubmissionConfigEditor
            flowKey={flowKey}
            accent={accent}
            value={defaultCluster}
            onChange={onDefaultClusterChange}
          />
        </>
      ) : availableKeys.length === 0 ? (
        <Empty description={`暂无可配置的 ${scopeLabel}`} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text strong>选择 {scopeLabel}</Text>
            <Select
              showSearch
              value={scopeKey || undefined}
              style={{ minWidth: 260, flex: 1 }}
              options={availableKeys.map((key) => ({
                value: key,
                label: (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{key}</span>
                    <Text type="secondary">{status(key)}</Text>
                  </div>
                ),
              }))}
              onChange={setScopeKey}
            />
            <Tag color={current.tools !== undefined || current.cluster !== undefined ? 'processing' : 'default'}>
              {status(scopeKey)}
            </Tag>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><Text strong>工具配置</Text><div><Text type="secondary">关闭时继承默认配置</Text></div></div>
            <Switch
              checked={current.tools !== undefined}
              checkedChildren="自定义覆盖"
              unCheckedChildren="继承默认"
              onChange={(checked) => updateCurrent({ tools: checked ? [...defaultTools] : undefined })}
            />
          </div>
          {current.tools !== undefined ? (
            <ToolConfigEditor
              key={`tools-${scopeKey}`}
              section
              accent={accent}
              value={current.tools}
              onChange={(tools) => updateCurrent({ tools })}
              scopeLabel={`仅对 ${scopeKey} 生效；其他 ${scopeLabel} 继续使用默认配置。`}
            />
          ) : (
            <Alert showIcon type="info" message={`当前继承默认工具配置（${defaultTools.length} 项）`} />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><Text strong>集群配置</Text><div><Text type="secondary">关闭时继承默认配置</Text></div></div>
            <Switch
              checked={current.cluster !== undefined}
              checkedChildren="自定义覆盖"
              unCheckedChildren="继承默认"
              onChange={(checked) => updateCurrent({
                cluster: checked ? { ...defaultCluster } : undefined,
              })}
            />
          </div>
          {current.cluster !== undefined ? (
            <ClusterSubmissionConfigEditor
              key={`cluster-${scopeKey}`}
              flowKey={flowKey}
              accent={accent}
              value={current.cluster}
              onChange={(cluster) => updateCurrent({ cluster })}
            />
          ) : (
            <Alert showIcon type="info" message="当前继承默认集群配置" />
          )}
        </>
      )}
    </div>
  )
}
