import { Button } from 'antd'

import type { ModePanelTab } from '../../types'

interface ModeTypeSwitcherProps {
  activeTab: ModePanelTab
  accent: string
  onChange: (tab: ModePanelTab) => void
}

const options: Array<{ value: ModePanelTab; label: string }> = [
  { value: 'mode', label: 'Mode' },
  { value: 'group', label: 'Group' },
  { value: 'tc', label: 'TC' },
  { value: 'subattr', label: 'SubAttr' },
]

export default function ModeTypeSwitcher({
  activeTab,
  accent,
  onChange,
}: ModeTypeSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Configuration type"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 2,
        padding: 3,
        border:
          '1px solid color-mix(in srgb, var(--vscode-editor-foreground) 9%, transparent)',
        borderRadius: 8,
        background:
          'color-mix(in srgb, var(--vscode-editor-foreground) 4.5%, transparent)',
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
              height: 36,
              padding: '0 4px',
              color: active
                ? 'var(--vscode-foreground, currentColor)'
                : 'var(--vscode-descriptionForeground, currentColor)',
              border: active
                ? '1px solid color-mix(in srgb, var(--vscode-editor-foreground) 12%, transparent)'
                : '1px solid transparent',
              borderRadius: 5,
              background: active
                ? 'var(--vscode-editor-background)'
                : 'transparent',
              boxShadow: active
                ? '0 1px 3px rgba(0, 0, 0, 0.14)'
                : 'none',
              transition:
                'color 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
            }}
          >
            <span
              style={{
                display: 'flex',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                maxWidth: '100%',
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                letterSpacing: '0.1px',
                lineHeight: '16px',
                textOverflow: 'ellipsis',
              }}
            >
              {option.label}
            </span>

            {active && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  bottom: 3,
                  left: '50%',
                  width: 18,
                  height: 2,
                  borderRadius: 2,
                  background: accent,
                  transform: 'translateX(-50%)',
                }}
              />
            )}
          </Button>
        )
      })}
    </div>
  )
}
