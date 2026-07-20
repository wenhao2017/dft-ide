import { Input, Modal, Space } from 'antd'

import type { DonauConfig } from './types'
import DonauResourcePicker from '../../shared/DonauResourcePicker'

interface DonauModalProps {
  open: boolean
  value: DonauConfig
  onCancel: () => void
  onChange: (value: DonauConfig) => void
}

function cleanDonauValue(value: DonauConfig): DonauConfig {
  return {
    ...(value.group ? { group: value.group } : {}),
    ...(value.queue ? { queue: value.queue } : {}),
    ...(value.cpu ? { cpu: value.cpu } : {}),
    ...(value.mem ? { mem: value.mem } : {}),
  }
}

export default function DonauModal({
  open,
  value,
  onCancel,
  onChange,
}: DonauModalProps) {
  const update = (key: keyof DonauConfig, nextValue: string) => {
    const next: DonauConfig = {
      ...value,
      [key]: nextValue.trim() || undefined,
    }

    onChange(cleanDonauValue(next))
  }

  return (
    <Modal
      open={open}
      title="Donau 配置"
      okText="完成"
      cancelText="关闭"
      onCancel={onCancel}
      onOk={onCancel}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <DonauResourcePicker
          account={value.group}
          queue={value.queue}
          onChange={({ account, queue }) => {
            onChange(cleanDonauValue({
              ...value,
              group: account,
              queue,
            }))
          }}
        />

        <Input
          addonBefore="Group"
          placeholder="手动输入 Donau Account / Group"
          value={value.group ?? ''}
          onChange={(event) => update('group', event.target.value)}
        />

        <Input
          addonBefore="Queue"
          placeholder="手动输入 Donau Queue"
          value={value.queue ?? ''}
          onChange={(event) => update('queue', event.target.value)}
        />

        <Input
          placeholder="cpu"
          value={value.cpu ?? ''}
          onChange={(event) => update('cpu', event.target.value)}
        />

        <Input
          placeholder="mem"
          value={value.mem ?? ''}
          onChange={(event) => update('mem', event.target.value)}
        />
      </Space>
    </Modal>
  )
}
