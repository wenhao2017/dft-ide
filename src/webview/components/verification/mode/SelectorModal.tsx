import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Checkbox,
  Empty,
  Input,
  List,
  Modal,
  Space,
  Typography,
} from 'antd'

import type { BaseConfigItem } from './types'

const { Text } = Typography

interface SelectorModalProps {
  open: boolean
  title: string

  items: BaseConfigItem[]

  value: string[]

  onCancel: () => void

  onOk: (names: string[]) => void
}

export default function SelectorModal({
  open,
  title,
  items,
  value,
  onCancel,
  onOk,
}: SelectorModalProps) {
  const [search, setSearch] = useState('')

  const [checkedNames, setCheckedNames] = useState<string[]>(value)

  useEffect(() => {
    if (!open) {
      return
    }

    setSearch('')
    setCheckedNames(value)
  }, [open, value])

  const visibleItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) {
      return items
    }

    return items.filter((item) => item.name.toLowerCase().includes(keyword))
  }, [items, search])

  const visibleNames = useMemo(() => {
    return visibleItems.map((item) => item.name)
  }, [visibleItems])

  const allVisibleChecked =
    visibleNames.length > 0 &&
    visibleNames.every((name) => checkedNames.includes(name))

  const someVisibleChecked =
    visibleNames.some((name) => checkedNames.includes(name)) &&
    !allVisibleChecked

  const toggle = (name: string, checked: boolean) => {
    setCheckedNames((current) =>
      checked
        ? Array.from(new Set([...current, name]))
        : current.filter((item) => item !== name),
    )
  }

  const toggleAllVisible = (checked: boolean) => {
    if (checked) {
      setCheckedNames((current) =>
        Array.from(new Set([...current, ...visibleNames])),
      )

      return
    }

    const visibleNameSet = new Set(visibleNames)

    setCheckedNames((current) =>
      current.filter((name) => !visibleNameSet.has(name)),
    )
  }

  return (
    <Modal
      open={open}
      title={title}
      okText="确定"
      cancelText="取消"
      onCancel={onCancel}
      onOk={() => onOk(checkedNames)}
    >
      <Space
        direction="vertical"
        size={10}
        style={{
          width: '100%',
        }}
      >
        <Input
          allowClear
          placeholder="搜索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Checkbox
            checked={allVisibleChecked}
            indeterminate={someVisibleChecked}
            disabled={!visibleNames.length}
            onChange={(event) => toggleAllVisible(event.target.checked)}
          >
            全选当前可见
          </Checkbox>

          <Space size={8}>
            <Text type="secondary">已选 {checkedNames.length}</Text>

            {checkedNames.length > 0 && (
              <Button
                type="link"
                size="small"
                style={{
                  padding: 0,
                }}
                onClick={() => setCheckedNames([])}
              >
                清空
              </Button>
            )}
          </Space>
        </div>

        {visibleItems.length ? (
          <List
            size="small"
            bordered
            dataSource={visibleItems}
            style={{
              maxHeight: 360,
              overflow: 'auto',
            }}
            renderItem={(item) => (
              <List.Item>
                <Checkbox
                  checked={checkedNames.includes(item.name)}
                  onChange={(event) => toggle(item.name, event.target.checked)}
                >
                  {item.name}
                </Checkbox>
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
        )}
      </Space>
    </Modal>
  )
}
