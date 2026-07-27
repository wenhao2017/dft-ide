import { Button, Select, Space, Tooltip, Typography } from 'antd'

import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'

import type { ModePanelTab } from '../../types'

const { Text } = Typography

export interface ModeToolbarOption {
  label: string
  value: string
}

interface ModeToolbarProps {
  activeTab: ModePanelTab

  /**
   * 当前是否存在点击选中的条目。
   * 仅用于复制和重命名。
   */
  hasSelected: boolean

  /**
   * 当前复选框勾选数量。
   * 用于控制删除按钮。
   */
  checkedCount: number

  focusOptions: ModeToolbarOption[]

  focusedNames: string[]

  accent?: string

  onFocusChange: (names: string[]) => void

  onCreate: () => void

  onCopy: () => void

  onRename?: () => void

  /**
   * 删除所有复选框勾选的条目。
   */
  onDelete: () => void

  onRefresh?: () => void
}

const tabLabels: Partial<Record<ModePanelTab, string>> = {
  mode: 'Mode',
  group: 'Group',
  tc: 'TC',
  subattr: 'SubAttr',
}

export default function ModeToolbar({
  activeTab,
  hasSelected,
  checkedCount,
  focusOptions,
  focusedNames,
  accent = 'var(--vscode-focusBorder, #1677ff)',
  onFocusChange,
  onCreate,
  onCopy,
  onRename,
  onDelete,
  onRefresh,
}: ModeToolbarProps) {
  const activeTabLabel = tabLabels[activeTab] ?? activeTab

  const handleFocusChange = (names: string[]) => {
    onFocusChange(Array.from(new Set(names.filter(Boolean))))
  }

  return (
    <Space
      direction="vertical"
      size={10}
      style={{
        width: '100%',
      }}
    >
      {focusOptions.length > 0 && (
      <Space
        direction="vertical"
        size={6}
        style={{
          width: '100%',
        }}
      >
        <Space
          size={6}
          style={{
            width: '100%',
          }}
        >
          <FilterOutlined
            style={{
              color: focusedNames.length
                ? accent
                : 'var(--vscode-descriptionForeground)',
            }}
          />

          <Text
            type="secondary"
            style={{
              fontSize: 12,
            }}
          >
            关注 {activeTabLabel}
          </Text>

          {focusedNames.length > 0 && (
            <Button
              type="link"
              size="small"
              onClick={() => {
                handleFocusChange([])
              }}
              style={{
                height: 'auto',
                padding: 0,
                fontSize: 12,
              }}
            >
              清空关注
            </Button>
          )}
        </Space>

        <Space.Compact style={{ width: '100%' }}>
          <Select
            mode="multiple"
            allowClear
            size="small"
            maxTagCount="responsive"
            placeholder={`选择关注的 ${activeTabLabel}`}
            value={focusedNames}
            options={focusOptions}
            onChange={handleFocusChange}
            style={{ flex: 1, minWidth: 0 }}
          />
          {onRefresh && (
            <Tooltip title="刷新 Mode 配置">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                aria-label="刷新 Mode 配置"
                onClick={onRefresh}
              />
            </Tooltip>
          )}
        </Space.Compact>
      </Space>
      )}

      <Space size={6} wrap>
        <Tooltip title={`新增 ${activeTabLabel}`}>
          <Button size="small" icon={<PlusOutlined />} onClick={onCreate} />
        </Tooltip>

        <Tooltip title="复制当前选择">
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={!hasSelected}
            onClick={onCopy}
          />
        </Tooltip>

        {onRename && (
          <Tooltip title="重命名当前选择">
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={!hasSelected}
              onClick={onRename}
            />
          </Tooltip>
        )}

        <Tooltip
          title={
            checkedCount > 0
              ? `删除已勾选的 ${checkedCount} 个项目`
              : '请先勾选需要删除的项目'
          }
        >
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={checkedCount === 0}
            onClick={onDelete}
          />
        </Tooltip>
      </Space>
    </Space>
  )
}
