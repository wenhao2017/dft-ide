import { Badge, Space, Typography } from 'antd'

import { BranchesOutlined } from '@ant-design/icons'

import type { ModePanelItem, ModePanelTab } from '../../types'

const { Text } = Typography

interface ModeFooterProps {
  tab: ModePanelTab

  selectedItem?: ModePanelItem

  totalCount: number

  focusedCount: number

  visibleCount: number

  accent: string
}

const TAB_LABELS: Record<ModePanelTab, string> = {
  mode: '模式',
  group: 'Group',
  tc: 'TC',
  subattr: 'SubAttr',
}

export default function ModeFooter({
  tab,
  selectedItem,
  totalCount,
  focusedCount,
  visibleCount,
  accent,
}: ModeFooterProps) {
  const label = TAB_LABELS[tab]

  return (
    <div
      style={{
        margin: '0 12px 12px',
        padding: 12,

        borderRadius: 8,
        border: `1px solid color-mix(in srgb, ${accent} 20%, transparent)`,

        background: 'var(--vscode-editor-background)',

        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          当前{label}
        </Text>

        <div
          style={{
            width: '100%',
            minWidth: 0,

            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <BranchesOutlined style={{ color: accent, flexShrink: 0 }} />

          <Text
            strong
            ellipsis={{ tooltip: selectedItem?.name }}
            style={{ minWidth: 0, flex: 1 }}
          >
            {selectedItem?.name ?? `未选择${label}`}
          </Text>
        </div>

        <div
          style={{
            width: '100%',
            minWidth: 0,

            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Badge color={accent} text={`共 ${totalCount} 个${label}`} />

          <Text
            type="secondary"
            style={{
              minWidth: 0,
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            {tab === 'mode' ? (
              <>关注 {focusedCount} · 显示 {visibleCount}</>
            ) : (
              <>共 {totalCount} · 显示 {visibleCount}</>
            )}
          </Text>
        </div>
      </Space>
    </div>
  )
}
