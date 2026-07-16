import { Button, Checkbox, Empty, List, Tooltip, Typography } from 'antd'

import {
  CaretRightOutlined,
  FileTextOutlined,
  StopOutlined,
} from '@ant-design/icons'

import type { ModePanelItem, ModePanelTab } from '../../types'

const { Text } = Typography

interface ModeListProps {
  tab: ModePanelTab

  items: ModePanelItem[]

  selectedName: string

  /**
   * 当前批量勾选的条目名称。
   *
   * 注意：这不是 focusedNames。
   */
  checkedNames: string[]

  runningNames: string[]

  accent: string

  onSelect: (item: ModePanelItem) => void

  onCheckedChange: (name: string, checked: boolean) => void

  onRun: (item: ModePanelItem) => void

  onStop: (item: ModePanelItem) => void
}

const TAB_LABELS: Record<ModePanelTab, string> = {
  mode: '模式',
  group: 'Group',
  tc: 'TC',
  subattr: 'SubAttr',
}

export default function ModeList({
  tab,
  items,
  selectedName,
  checkedNames,
  runningNames,
  accent,
  onSelect,
  onCheckedChange,
  onRun,
  onStop,
}: ModeListProps) {
  const selectedBackground = `var(--vscode-list-inactiveSelectionBackground, color-mix(in srgb, ${accent} 14%, var(--vscode-editor-background, #ffffff)))`

  const selectedForeground =
    'var(--vscode-list-inactiveSelectionForeground, var(--vscode-editor-foreground, var(--vscode-foreground)))'

  const selectedBorder = `color-mix(in srgb, ${accent} 68%, var(--vscode-panel-border, rgba(127, 127, 127, 0.26)))`

  const selectedShadow = `0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent), 0 4px 12px rgba(0, 0, 0, 0.08)`

  if (!items.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={`暂无${TAB_LABELS[tab]}`}
        style={{ margin: '28px 0' }}
      />
    )
  }

  return (
    <List
      size="small"
      split={false}
      dataSource={items}
      renderItem={(item) => {
        const selected = selectedName === item.name

        const checked = checkedNames.includes(item.name)

        const running = runningNames.includes(item.name)

        const modeItem = tab === 'mode' && 'preMode' in item ? item : undefined

        return (
          <List.Item
            onClick={() => onSelect(item)}
            style={{
              minWidth: 0,
              minHeight: modeItem ? 48 : 40,

              marginBottom: 4,
              padding: '6px 8px 6px 9px',

              cursor: 'pointer',

              background: selected ? selectedBackground : undefined,

              border: selected
                ? `1px solid ${selectedBorder}`
                : '1px solid transparent',

              borderLeft: selected
                ? `3px solid ${accent}`
                : '3px solid transparent',

              borderRadius: 6,

              boxShadow: selected ? selectedShadow : 'none',

              transition:
                'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',

              boxSizing: 'border-box',
            }}
          >
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
              <div
                style={{
                  minWidth: 0,
                  flex: 1,

                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  onClick={(event) => {
                    event.stopPropagation()
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Checkbox
                    checked={checked}
                    onChange={(event) => {
                      onCheckedChange(item.name, event.target.checked)
                    }}
                  />
                </span>

                <FileTextOutlined
                  style={{
                    color: selected
                      ? accent
                      : 'var(--vscode-descriptionForeground)',
                    flexShrink: 0,
                  }}
                />

                <div
                  style={{
                    minWidth: 0,
                    flex: 1,

                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                  }}
                >
                  <Text
                    strong={selected}
                    ellipsis={{ tooltip: item.name }}
                    style={{
                      minWidth: 0,
                      fontSize: 13,
                      lineHeight: '20px',
                      color: selected ? selectedForeground : undefined,
                    }}
                  >
                    {item.name}
                  </Text>

                  {modeItem && (
                    <Text
                      type="secondary"
                      ellipsis={{ tooltip: modeItem.preMode }}
                      style={{
                        minWidth: 0,
                        fontSize: 11,
                        lineHeight: '16px',
                      }}
                    >
                      {modeItem.preMode}
                    </Text>
                  )}
                </div>
              </div>

              {tab === 'mode' && (
                <span
                  onClick={(event) => {
                    event.stopPropagation()
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  {running ? (
                    <Tooltip title="停止">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<StopOutlined />}
                        onClick={() => {
                          onStop(item)
                        }}
                        style={{
                          width: 26,
                          height: 26,
                          padding: 0,

                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      />
                    </Tooltip>
                  ) : (
                    <Tooltip title="运行">
                      <Button
                        type="text"
                        size="small"
                        icon={<CaretRightOutlined />}
                        onClick={() => {
                          onRun(item)
                        }}
                        style={{
                          width: 26,
                          height: 26,
                          padding: 0,

                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',

                          color: accent,
                        }}
                      />
                    </Tooltip>
                  )}
                </span>
              )}
            </div>
          </List.Item>
        )
      }}
    />
  )
}
