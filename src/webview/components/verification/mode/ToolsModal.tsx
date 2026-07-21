import { message, Modal } from 'antd'

import ToolConfigEditor from '../../shared/ToolConfigEditor'
import type { ToolConfig } from '../../shared/toolConfigTypes'

interface ToolsModalProps {
  open: boolean
  tools: ToolConfig[]
  onCancel: () => void
  onChange: (tools: ToolConfig[]) => void
}

export default function ToolsModal({
  open,
  tools,
  onCancel,
  onChange,
}: ToolsModalProps) {
  const finish = () => {
    const invalid = tools.find((tool) => {
      if (!tool.name.trim()) return true
      if (tool.type === 'version') return !tool.version.trim()
      return !tool.path.trim() || !/^(?:[A-Za-z]:[\\/]|\/)/.test(tool.path.trim())
    })
    if (invalid) {
      message.error('请填写工具名称，并填写版本或工具本地目录绝对路径')
      return
    }

    const normalizedNames = tools.map((tool) => tool.name.trim().toLocaleLowerCase())
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      message.error('同名 Tool 只能配置一个')
      return
    }
    onCancel()
  }

  return (
    <Modal
      open={open}
      title='Tools 配置'
      width={860}
      okText='完成'
      cancelText='关闭'
      onCancel={onCancel}
      onOk={finish}
    >
      <ToolConfigEditor value={tools} onChange={onChange} />
    </Modal>
  )
}
