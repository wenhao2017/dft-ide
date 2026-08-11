import { Button, Checkbox, Empty, List, Tooltip, Typography, Dropdown, Tree } from 'antd'
import type { TreeDataNode } from 'antd'

import {
  CaretRightOutlined,
  FileTextOutlined,
  StopOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  FileOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

import type { ModeConfigItem, ModeTreeNodeItem, ModePanelTab } from '../../types'
import { toModeTreeNodeItem } from '../../../../../components/verification/mode/ModePanel/utils'

const { Text } = Typography

interface ModeListProps {
  tab: ModePanelTab

  items: ModeConfigItem[]

  selectedItem: ModeTreeNodeItem

  /**
   * 当前批量勾选的条目名称。
   *
   * 注意：这不是 focusedNames。
   */
  checkedItems: ModeTreeNodeItem[]

  runningKeys: string[]

  accent: string

  onSelect: (item: ModeTreeNodeItem) => void

  onCheckedChange: (item: ModeTreeNodeItem, checked: boolean) => void

  onRun: (item: ModeTreeNodeItem) => void

  onRunStrategy: (item: ModeTreeNodeItem) => void

  onStop: (item: ModeTreeNodeItem) => void

  openSelected: (item: ModeTreeNodeItem) => void

  duplicateSelected: (item: ModeTreeNodeItem) => void

  openRename: (item: ModeTreeNodeItem) => void

  deleteSelected: (item: ModeTreeNodeItem) => void
}

const TAB_LABELS: Record<ModePanelTab, string> = {
  mode: '模式',
}

export default function ModeList({
  tab,
  items,
  selectedItem,
  checkedItems,
  runningKeys,
  accent,
  onSelect,
  onCheckedChange,
  onRun,
  onRunStrategy,
  onStop,
  openSelected,
  duplicateSelected,
  openRename,
  deleteSelected,
}: ModeListProps) {
  const selectedBackground = `var(--vscode-list-inactiveSelectionBackground, color-mix(in srgb, ${accent} 14%, var(--vscode-editor-background, #ffffff)))`

  const selectedForeground =
    'var(--vscode-list-inactiveSelectionForeground, var(--vscode-editor-foreground, var(--vscode-foreground)))'

  const selectedBorder = `color-mix(in srgb, ${accent} 68%, var(--vscode-panel-border, rgba(127, 127, 127, 0.26)))`

  const selectedShadow = `0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent), 0 4px 12px rgba(0, 0, 0, 0.08)`

  const renderModeRow = (item: ModeTreeNodeItem) => {
    const isVersion = Boolean(item.version)
    const displayName = isVersion ? item.version : item.name
    const selected = selectedItem.key === item.key
    const checked = checkedItems.some(a => a.key === item.key)
    const running = runningKeys.some(key => key === item.key);

    let dropdownItems = [
      { key: 'open', icon: <FileOutlined />, label: '打开' },
      { key: 'copy', icon: <CopyOutlined />, label: '复制' },
      { key: 'rename', icon: <EditOutlined />, label: '重命名' },
      { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
    ];

    return (
      <Dropdown
        trigger={['contextMenu']}
        onOpenChange={(open) => {
          if (open) {
            onSelect(item);
          }
        }}
        menu={{
          items: dropdownItems,
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation();
            if (key === 'open') openSelected(item);
            if (key === 'copy') void duplicateSelected(item);
            if (key === 'rename') openRename(item);
            if (key === 'delete') deleteSelected(item);
          },
        }}
      >
      <List.Item
        onClick={() => onSelect(item)}
        style={{
          minWidth: 0,
          minHeight: 40,

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
                  onCheckedChange(item, event.target.checked)
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
                ellipsis={{ tooltip: displayName }}
                style={{
                  minWidth: 0,
                  fontSize: 13,
                  lineHeight: '20px',
                  color: selected ? selectedForeground : undefined,
                }}
              >
                {displayName}
              </Text>

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
              <Tooltip title="策略执行">
                <Button
                  type="text"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={() => {
                    onRunStrategy(item)
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
              {running && (
                <Tooltip title="启动新实例">
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
              {running ? (
                <Tooltip title="停止全部实例">
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
      </Dropdown>
    )
  }

  const treeData: TreeDataNode[] =
    items.map((item) => ({
      key: item.name,
      title: renderModeRow(toModeTreeNodeItem(item)),
      children: item.versions?.map((version) => ({
        key: `${item.name}@${version}`,
        title: renderModeRow(toModeTreeNodeItem(item, version)),
      })),
    }))

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
    <div
      style={{
        maxHeight: items.length > 5 ? 260 : undefined,
        overflowY: items.length > 5 ? 'auto' : undefined,
        paddingRight: items.length > 5 ? 4 : undefined,
      }}
    >
      <Tree
        blockNode
        selectable={false}
        showLine={false}
        checkStrictly={true}
        className="dft-mode-tree"
        treeData={treeData}
      />
    </div>
  )
}
