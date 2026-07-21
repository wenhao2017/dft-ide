import { Button, Space, Tooltip, Typography } from 'antd'

import { LeftOutlined, RightOutlined } from '@ant-design/icons'

import type { ModePanelTab } from '../../types'

const { Text, Title } = Typography

interface ModeTitleProps {
  activeTab: ModePanelTab

  title?: string

  accent: string

  collapsed: boolean

  totalCount: number

  focusedCount: number

  onCollapsedChange: (collapsed: boolean) => void
}

const tabLabels: Partial<Record<ModePanelTab, string>> = {
  mode: 'Mode',
  group: 'Group',
  tc: 'TC',
  subattr: 'SubAttr',
}

export default function ModeTitle({
  activeTab,
  title,
  accent,
  collapsed,
  totalCount,
  focusedCount,
  onCollapsedChange,
}: ModeTitleProps) {
  const activeTabLabel = tabLabels[activeTab] ?? activeTab

  if (collapsed) {
    return (
      <div
        title="展开列表"
        role="button"
        tabIndex={0}
        onClick={() => onCollapsedChange(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onCollapsedChange(false)
          }
        }}
        style={{
          width: 32,
          minWidth: 32,
          height: '100%',

          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',

          cursor: 'pointer',
          userSelect: 'none',

          borderRadius: 8,

          border:
            '1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.22))',

          borderLeft: `3px solid ${accent}`,

          background:
            'var(--vscode-sideBar-background, var(--vscode-editor-background))',

          overflow: 'hidden',
        }}
      >
        <Tooltip title="展开列表" placement="right">
          <Button
            type="text"
            size="small"
            icon={<RightOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              onCollapsedChange(false)
            }}
            style={{
              width: 22,
              minWidth: 22,
              height: 22,

              marginTop: 10,
              padding: 0,

              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',

              color: accent,
              fontSize: 11,

              borderRadius: 5,
              border: 'none',

              background: `color-mix(
                in srgb,
                ${accent} 10%,
                transparent
              )`,
            }}
          />
        </Tooltip>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '12px 12px 10px 14px',

        borderBottom:
          '1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.18))',

        background: `color-mix(
          in srgb,
          ${accent} 8%,
          var(
            --vscode-sideBar-background,
            var(--vscode-editor-background)
          )
        )`,

        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',

        gap: 8,

        flexShrink: 0,
      }}
    >
      <Space
        direction="vertical"
        size={2}
        style={{
          minWidth: 0,
          flex: 1,
        }}
      >
        <Text
          style={{
            color: accent,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {activeTabLabel}
        </Text>

        <Title
          level={5}
          style={{
            margin: 0,
            fontSize: 15,
          }}
        >
          {title ?? `${activeTabLabel} 配置管理`}
        </Title>

        <Text
          type="secondary"
          style={{
            fontSize: 12,
          }}
        >
          {activeTab === 'mode' ? (
            <>已关注 {focusedCount} 个，共 {totalCount} 个</>
          ) : (
            <>共 {totalCount} 个</>
          )}
        </Text>
      </Space>

      <Tooltip title="收起列表" placement="right">
        <Button
          type="text"
          size="small"
          icon={<LeftOutlined />}
          onClick={() => onCollapsedChange(true)}
          style={{
            width: 26,
            minWidth: 26,
            height: 26,

            marginTop: 2,
            padding: 0,

            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',

            flexShrink: 0,

            color: accent,

            border: `1px solid color-mix(
              in srgb,
              ${accent} 27%,
              transparent
            )`,

            borderRadius: 6,
          }}
        />
      </Tooltip>
    </div>
  )
}
