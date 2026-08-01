import { useState } from 'react'
import { AutoComplete, Button, Empty, message, Select, Space, Typography, theme } from 'antd'
import { DeleteOutlined, PlusOutlined, ToolOutlined } from '@ant-design/icons'

import ControlledPathInput from './ControlledPathInput'
import FlowConfigSection from './FlowConfigSection'
import { getMavToolVersions } from '../../utils/ipc'
import type { ToolConfig, ToolPatch } from './toolConfigTypes'

const TOOL_NAME_OPTIONS = ['eli', 'dc', 'pt', 'vcs', 'fml'].map((value) => ({
  label: value.toUpperCase(), value,
}))
const createVersionTool = (): ToolConfig => ({
  id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: 'version', name: '', version: '',
})

function patchTool(tool: ToolConfig, patch: ToolPatch): ToolConfig {
  if (patch.type === 'version') return {
    id: tool.id, type: 'version', name: patch.name ?? tool.name,
    version: patch.version ?? (tool.type === 'version' ? tool.version : ''),
  }
  if (patch.type === 'path') return {
    id: tool.id, type: 'path', name: patch.name ?? tool.name,
    path: patch.path ?? (tool.type === 'path' ? tool.path : ''),
  }
  return tool.type === 'version'
    ? { ...tool, name: patch.name ?? tool.name, version: patch.version ?? tool.version }
    : { ...tool, name: patch.name ?? tool.name, path: patch.path ?? tool.path }
}

export interface ToolConfigEditorProps {
  value?: ToolConfig[]
  onChange?: (tools: ToolConfig[]) => void
  scopeLabel?: string
  section?: boolean
  accent?: string
}

export default function ToolConfigEditor({
  value = [],
  onChange,
  scopeLabel = '为当前 Flow 配置运行时所需的工具版本或本地路径。',
  section = false,
  accent,
}: ToolConfigEditorProps) {
  const { token } = theme.useToken()
  const sectionAccent = accent ?? token.colorPrimary
  const [versionsByTool, setVersionsByTool] = useState<Record<string, string[]>>({})
  const [loadingToolId, setLoadingToolId] = useState<string>()
  const addTool = () => onChange?.([...value, createVersionTool()])
  const updateTool = (id: string, patch: ToolPatch) =>
    onChange?.(value.map((tool) => tool.id === id ? patchTool(tool, patch) : tool))

  const loadVersions = async (tool: ToolConfig) => {
    const name = tool.name.trim()
    if (!name) return void message.warning('请先输入或选择工具名称')
    setLoadingToolId(tool.id)
    try {
      const versions = await getMavToolVersions(name)
      setVersionsByTool((current) => ({ ...current, [tool.id]: versions }))
      if (!versions.length) message.info('mav 未返回可用版本，可手动输入版本')
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingToolId(undefined)
    }
  }

  const editor = (
    <>
      <style>{`
        .dft-tool-editor .tool-row {
          display: grid;
          grid-template-columns: 34px 92px minmax(120px, .8fr) minmax(170px, 1.25fr) 32px;
          gap: 9px;
          align-items: end;
          padding: 12px;
          border: 1px solid ${token.colorBorderSecondary};
          border-radius: 10px;
          background: color-mix(in srgb, ${sectionAccent} 3%, ${token.colorBgContainer});
        }
        .dft-tool-editor .tool-index {
          align-self: center;
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          color: ${sectionAccent};
          background: color-mix(in srgb, ${sectionAccent} 12%, ${token.colorBgContainer});
          font-size: 11px;
          font-weight: 700;
        }
        .dft-tool-editor .tool-field {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .dft-tool-editor .tool-field-label {
          color: ${token.colorTextSecondary};
          font-size: 11px;
          line-height: 1;
        }
        .dft-tool-editor .tool-delete {
          align-self: end;
        }
        @media (max-width: 720px) {
          .dft-tool-editor .tool-row {
            grid-template-columns: 34px minmax(0, 1fr) 32px;
          }
          .dft-tool-editor .tool-field {
            grid-column: 2;
          }
          .dft-tool-editor .tool-index {
            grid-column: 1;
            grid-row: 1;
          }
          .dft-tool-editor .tool-delete {
            grid-column: 3;
            grid-row: 1;
          }
        }
      `}</style>
      <Space direction="vertical" size={12} style={{ width: '100%' }} className="dft-tool-editor">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Typography.Text type="secondary">
            {value.length ? `已配置 ${value.length} 个工具` : '尚未配置工具，可按需添加。'}
          </Typography.Text>
          <Button icon={<PlusOutlined />} onClick={addTool}>添加工具</Button>
        </div>

        {value.length === 0 ? (
          <div style={{ padding: '24px 12px', border: `1px dashed ${token.colorBorder}`, borderRadius: 10 }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工具配置" />
          </div>
        ) : value.map((tool, index) => (
          <div key={tool.id} className="tool-row">
            <div className="tool-index">{String(index + 1).padStart(2, '0')}</div>
            <div className="tool-field">
              <span className="tool-field-label">配置方式</span>
              <Select
                value={tool.type}
                options={[
                  { label: 'Version', value: 'version' },
                  { label: 'Path', value: 'path' },
                ]}
                onChange={(type: ToolConfig['type']) => updateTool(tool.id, { type })}
              />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">工具名称</span>
              <AutoComplete
                allowClear
                placeholder="输入或选择工具名称"
                value={tool.name}
                options={TOOL_NAME_OPTIONS}
                filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                onChange={(name) => {
                  const normalized = name.trim().toLocaleLowerCase()
                  if (normalized && value.some((item) => item.id !== tool.id && item.name.trim().toLocaleLowerCase() === normalized)) {
                    message.error('同名 Tool 只能配置一个')
                    return
                  }
                  updateTool(tool.id, { name })
                  setVersionsByTool((current) => {
                    const next = { ...current }; delete next[tool.id]; return next
                  })
                }}
                onSelect={(name) => void loadVersions({ ...tool, name })}
                onBlur={() => {
                  if (tool.type === 'version' && tool.name.trim() && !versionsByTool[tool.id]) void loadVersions(tool)
                }}
              />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{tool.type === 'version' ? '工具版本' : '工具路径'}</span>
              {tool.type === 'version' ? (
                <AutoComplete
                  allowClear
                  placeholder="输入或选择版本"
                  value={tool.version}
                  options={(versionsByTool[tool.id] ?? []).map((version) => ({ label: version, value: version }))}
                  onFocus={() => { if (!versionsByTool[tool.id]) void loadVersions(tool) }}
                  onChange={(version) => updateTool(tool.id, { version })}
                  notFoundContent={loadingToolId === tool.id ? '查询中...' : undefined}
                />
              ) : (
                <ControlledPathInput
                  placeholder="输入或选择本地目录绝对路径"
                  value={tool.path}
                  showSelectFile={false}
                  showSelectFolder
                  pathSources={['local']}
                  onChange={(path) => updateTool(tool.id, { path })}
                />
              )}
            </div>
            <Button
              className="tool-delete"
              danger
              type="text"
              aria-label={`删除工具 ${tool.name || index + 1}`}
              icon={<DeleteOutlined />}
              onClick={() => onChange?.(value.filter((item) => item.id !== tool.id))}
            />
          </div>
        ))}
      </Space>
    </>
  )

  if (!section) return editor

  return (
    <FlowConfigSection
      index="01"
      icon={<ToolOutlined />}
      title="工具配置"
      description={scopeLabel}
      accent={sectionAccent}
      defaultExpanded={false}
    >
      {editor}
    </FlowConfigSection>
  )
}
