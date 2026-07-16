import { useEffect, useRef, useState } from 'react'

import { Input, Modal, Space, Typography } from 'antd'

import { EditOutlined } from '@ant-design/icons'

const { Text } = Typography

interface RenameModalProps {
  open: boolean

  value: string

  accent?: string

  onCancel: () => void

  onConfirm: (value: string) => void
}

export default function RenameModal({
  open,
  value,
  accent = 'var(--vscode-focusBorder, #1677ff)',
  onCancel,
  onConfirm,
}: RenameModalProps) {
  const inputRef = useRef<React.ComponentRef<typeof Input>>(null)

  const [name, setName] = useState(value)

  useEffect(() => {
    if (!open) {
      return
    }

    setName(value)

    requestAnimationFrame(() => {
      inputRef.current?.focus({
        cursor: 'all',
      })
    })
  }, [open, value])

  const normalizedName = name.trim()

  const unchanged = normalizedName === value.trim()

  const confirmDisabled = !normalizedName || unchanged

  const handleConfirm = () => {
    if (confirmDisabled) {
      return
    }

    onConfirm(normalizedName)
  }

  return (
    <Modal
      open={open}
      width={480}
      centered
      title={
        <Space size={8}>
          <EditOutlined
            style={{
              color: accent,
            }}
          />

          <span>重命名</span>
        </Space>
      }
      okText="重命名"
      cancelText="取消"
      okButtonProps={{
        disabled: confirmDisabled,
      }}
      onCancel={onCancel}
      onOk={handleConfirm}
      styles={{
        body: {
          paddingTop: 8,
        },
      }}
    >
      <Space
        direction="vertical"
        size={6}
        style={{
          width: '100%',
        }}
      >
        <Text
          type="secondary"
          style={{
            fontSize: 12,
          }}
        >
          新名称
        </Text>

        <Input
          ref={inputRef}
          allowClear
          value={name}
          placeholder="请输入新的名称"
          onChange={(event) => {
            setName(event.target.value)
          }}
          onPressEnter={handleConfirm}
        />
      </Space>
    </Modal>
  )
}
