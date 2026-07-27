import {
  ApartmentOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { Button } from 'antd'

import type { ModePanelTab } from '../../types'

interface ModeTypeSwitcherProps {
  activeTab: ModePanelTab
  accent: string
  onChange: (tab: ModePanelTab) => void
}

const options: Array<{
  value: ModePanelTab
  label: string
  icon: React.ReactNode
}> = [
  { value: 'mode', label: 'Mode', icon: <AppstoreOutlined /> },
  { value: 'group', label: 'Group', icon: <ApartmentOutlined /> },
  { value: 'tc', label: 'TC', icon: <FileTextOutlined /> },
  { value: 'subattr', label: 'SubAttr', icon: <TagsOutlined /> },
]

export default function ModeTypeSwitcher({
  activeTab,
  accent,
  onChange,
}: ModeTypeSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="配置类型"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 4,
        padding: 4,
        border: '1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.2))',
        borderRadius: 9,
        background:
          'color-mix(in srgb, var(--vscode-editor-foreground) 4%, transparent)',
      }}
    >
      {options.map((option) => {
        const active = option.value === activeTab

        return (
          <Button
            key={option.value}
            type="text"
            aria-pressed={active}
            aria-label={option.label}
            onClick={() => onChange(option.value)}
            style={{
              position: 'relative',
              minWidth: 0,
              height: 50,
              padding: '5px 2px 4px',
              color: active
                ? accent
                : 'var(--vscode-foreground, currentColor)',
              border: active
                ? `1px solid color-mix(in srgb, ${accent} 34%, transparent)`
                : '1px solid transparent',
              borderRadius: 6,
              background: active
                ? `color-mix(in srgb, ${accent} 13%, var(--vscode-sideBar-background, var(--vscode-editor-background)))`
                : 'transparent',
              boxShadow: active
                ? `inset 0 -2px 0 ${accent}, 0 1px 2px rgba(0, 0, 0, 0.08)`
                : 'none',
            }}
          >
            <span
              style={{
                display: 'flex',
                height: '100%',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                {option.icon}
              </span>

              <span
                style={{
                  overflow: 'hidden',
                  maxWidth: '100%',
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  lineHeight: '14px',
                  textOverflow: 'ellipsis',
                }}
              >
                {option.label}
              </span>
            </span>
          </Button>
        )
      })}
    </div>
  )
}
