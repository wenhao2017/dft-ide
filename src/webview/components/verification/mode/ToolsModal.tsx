import { Button, Input, Modal, Select, Space } from 'antd'

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'

import type { ToolConfig, ToolPatch } from './types'

interface ToolsModalProps {
  open: boolean

  tools: ToolConfig[]

  onCancel: () => void

  onChange: (tools: ToolConfig[]) => void
}

const createToolId = () =>
  `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const createVersionTool = (): ToolConfig => ({
  id: createToolId(),
  type: 'version',
  name: '',
  version: '',
})

function patchTool(tool: ToolConfig, patch: ToolPatch): ToolConfig {
  if (patch.type === 'version') {
    return {
      id: tool.id,
      type: 'version',
      name: patch.name ?? (tool.type === 'version' ? tool.name : ''),
      version: patch.version ?? (tool.type === 'version' ? tool.version : ''),
      path: patch.path ?? (tool.type === 'version' ? tool.path : undefined),
    }
  }

  if (patch.type === 'path') {
    return {
      id: tool.id,
      type: 'path',
      path: patch.path ?? (tool.type === 'path' ? tool.path : ''),
      name: patch.name ?? (tool.type === 'path' ? tool.name : undefined),
      version:
        patch.version ?? (tool.type === 'path' ? tool.version : undefined),
    }
  }

  if (tool.type === 'version') {
    return {
      ...tool,
      name: patch.name ?? tool.name,
      version: patch.version ?? tool.version,
      path: patch.path ?? tool.path,
    }
  }

  return {
    ...tool,
    path: patch.path ?? tool.path,
    name: patch.name ?? tool.name,
    version: patch.version ?? tool.version,
  }
}

export default function ToolsModal({
  open,
  tools,
  onCancel,
  onChange,
}: ToolsModalProps) {
  const addTool = () => {
    onChange([...tools, createVersionTool()])
  }

  const updateTool = (id: string, patch: ToolPatch) => {
    onChange(
      tools.map((tool) => (tool.id === id ? patchTool(tool, patch) : tool)),
    )
  }

  const removeTool = (id: string) => {
    onChange(tools.filter((tool) => tool.id !== id))
  }

  return (
    <Modal
      open={open}
      title="Tools 配置"
      width={680}
      okText="完成"
      cancelText="关闭"
      onCancel={onCancel}
      onOk={onCancel}
    >
      <Space
        direction="vertical"
        size={10}
        style={{
          width: '100%',
        }}
      >
        {tools.map((tool) => (
          <Space.Compact
            key={tool.id}
            style={{
              width: '100%',
            }}
          >
            <Select
              value={tool.type}
              style={{
                width: 110,
              }}
              options={[
                {
                  label: 'Version',
                  value: 'version',
                },
                {
                  label: 'Path',
                  value: 'path',
                },
              ]}
              onChange={(value: ToolConfig['type']) =>
                updateTool(tool.id, {
                  type: value,
                })
              }
            />

            {tool.type === 'version' ? (
              <>
                <Input
                  placeholder="name"
                  value={tool.name}
                  onChange={(event) =>
                    updateTool(tool.id, {
                      name: event.target.value,
                    })
                  }
                />

                <Input
                  placeholder="version"
                  value={tool.version}
                  onChange={(event) =>
                    updateTool(tool.id, {
                      version: event.target.value,
                    })
                  }
                />
              </>
            ) : (
              <Input
                placeholder="path"
                value={tool.path}
                onChange={(event) =>
                  updateTool(tool.id, {
                    path: event.target.value,
                  })
                }
              />
            )}

            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              onClick={() => removeTool(tool.id)}
            />
          </Space.Compact>
        ))}

        <Button block icon={<PlusOutlined />} onClick={addTool}>
          添加 Tool
        </Button>
      </Space>
    </Modal>
  )
}
