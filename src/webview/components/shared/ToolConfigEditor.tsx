import { useState } from 'react'
import { AutoComplete, Button, message, Select, Space, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'

import ControlledPathInput from './ControlledPathInput'
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
}

export default function ToolConfigEditor({ value = [], onChange }: ToolConfigEditorProps) {
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

  return <Space direction='vertical' size={10} style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography.Text>Tool 配置</Typography.Text>
      <Button size='small' type='text' icon={<PlusOutlined />} onClick={addTool}>添加 Tool</Button>
    </div>
    {value.map((tool) => <div key={tool.id} style={{
      display: 'grid', gridTemplateColumns: '100px minmax(150px, .8fr) minmax(240px, 1.4fr) 32px',
      gap: 8, alignItems: 'center', width: '100%',
    }}>
      <Select value={tool.type} options={[
        { label: 'Version', value: 'version' }, { label: 'Path', value: 'path' },
      ]} onChange={(type: ToolConfig['type']) => updateTool(tool.id, { type })} />
      <AutoComplete allowClear placeholder='输入或选择工具名称' value={tool.name}
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
        }} />
      {tool.type === 'version' ? <AutoComplete allowClear placeholder='输入或选择版本'
        value={tool.version}
        options={(versionsByTool[tool.id] ?? []).map((version) => ({ label: version, value: version }))}
        onFocus={() => { if (!versionsByTool[tool.id]) void loadVersions(tool) }}
        onChange={(version) => updateTool(tool.id, { version })}
        notFoundContent={loadingToolId === tool.id ? '查询中...' : undefined} />
        : <ControlledPathInput placeholder='手动输入或选择本地目录绝对路径' value={tool.path}
          showSelectFile={false} showSelectFolder pathSources={['local']}
          onChange={(path) => updateTool(tool.id, { path })} />}
      <Button danger type='text' icon={<DeleteOutlined />}
        onClick={() => onChange?.(value.filter((item) => item.id !== tool.id))} />
    </div>)}
  </Space>
}
