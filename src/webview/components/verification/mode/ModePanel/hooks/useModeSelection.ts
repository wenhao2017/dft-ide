import { useCallback, useMemo, useState } from 'react'

import type {
  ModeTreeNodeItem,
  ModePanelTab,
  ResourceStore,
  NameListStore,
  NameStore,
} from '../../types'

import { INITIAL_NAME_LISTS, INITIAL_NAMES } from '../constants'
import { toModeTreeNodeItem } from '../../../../../components/verification/mode/ModePanel/utils'

interface UseModeSelectionProps {
  activeTab: ModePanelTab

  resources: ResourceStore

  /**
   * 更新并持久化 resources.focusModes。
   *
   * Mode 的关注状态只使用 resources.focusModes，
   * 不再同时保存到 checkedNames.mode。
   */
  onModeFocusChange: (names: string[]) => void

  onSelect?: (tab: ModePanelTab, item?: ModeTreeNodeItem) => void

  onCheckedChange?: (tab: ModePanelTab, names: string[]) => void
}

export function useModeSelection({
  activeTab,
  resources,
  onModeFocusChange,
  onSelect,
  onCheckedChange,
}: UseModeSelectionProps) {
  const [selectedNames, setSelectedNames] = useState<NameStore>(INITIAL_NAMES)

  /**
   * 非 Mode Tab 的本地关注状态。
   *
   * Mode 的关注状态直接使用 resources.focusModes。
   */
  const [localCheckedNames, setLocalCheckedNames] =
    useState<NameListStore>(INITIAL_NAME_LISTS)

  /**
   * 对外暴露统一的关注状态。
   *
   * mode 始终来自 resources.focusModes，
   * 避免出现两份不同步的数据。
   */
  const checkedNames = useMemo<NameListStore>(
    () => ({
      ...localCheckedNames,
      mode: resources.focusModes,
    }),
    [localCheckedNames, resources.focusModes],
  )

  const activeCheckedNames = checkedNames[activeTab]

  /**
   * 当前 Tab 下已关注的项目。
   */
  const activeItems = useMemo(() => {
    if (activeTab !== 'mode') {
      return resources[activeTab]
    }

    const focusSet = new Set(resources.focusModes)

    return resources.mode.filter((item) => focusSet.has(item.name))
  }, [activeTab, activeCheckedNames, resources])

  const storedSelectedItem = selectedNames[activeTab]

  const selectedItem = useMemo(() => {
    const findItem = activeItems.find((item) => item.name === storedSelectedItem.name)
    if (findItem) {
      if (storedSelectedItem.version && findItem.versions?.includes(storedSelectedItem.version)) {
        return storedSelectedItem
      }
      return toModeTreeNodeItem(findItem)
    }
    return toModeTreeNodeItem(activeItems[0])
  }, [activeItems, storedSelectedItem])

  /**
   * 使用实际选中项名称。
   *
   * 当原选择不存在，但 activeItems 有数据时，
   * selectedItem 会回退到第一项。
   */
  const selectedName = selectedItem?.name ?? ''

  const visibleNames = useMemo(
    () => activeItems.map((item) => item.name),
    [activeItems],
  )

  const allVisibleChecked =
    visibleNames.length > 0 &&
    visibleNames.every((name) => activeCheckedNames.includes(name))

  const someVisibleChecked =
    visibleNames.some((name) => activeCheckedNames.includes(name)) &&
    !allVisibleChecked

  const selectItem = useCallback(
    (tab: ModePanelTab, item?: ModeTreeNodeItem) => {
      setSelectedNames((current) => ({
        ...current,
        [tab]: item ? item : { key: '', name: '' },
      }))

      onSelect?.(tab, item)
    },
    [onSelect],
  )

  const setTabCheckedNames = useCallback(
    (tab: ModePanelTab, names: string[]) => {
      const nextNames = Array.from(new Set(names.filter(Boolean)))

      if (tab === 'mode') {
        onModeFocusChange(nextNames)
      } else {
        setLocalCheckedNames((current) => ({
          ...current,
          [tab]: nextNames,
        }))
      }

      onCheckedChange?.(tab, nextNames)
    },
    [onCheckedChange, onModeFocusChange],
  )

  const toggleChecked = useCallback(
    (name: string, checked: boolean) => {
      const nextNames = checked
        ? [...activeCheckedNames, name]
        : activeCheckedNames.filter((item) => item !== name)

      setTabCheckedNames(activeTab, nextNames)
    },
    [activeCheckedNames, activeTab, setTabCheckedNames],
  )

  const toggleAllVisible = useCallback(
    (checked: boolean) => {
      if (checked) {
        setTabCheckedNames(activeTab, [...activeCheckedNames, ...visibleNames])

        return
      }

      const visibleSet = new Set(visibleNames)

      setTabCheckedNames(
        activeTab,
        activeCheckedNames.filter((name) => !visibleSet.has(name)),
      )
    },
    [activeCheckedNames, activeTab, visibleNames, setTabCheckedNames],
  )

  const clearChecked = useCallback(() => {
    setTabCheckedNames(activeTab, [])
  }, [activeTab, setTabCheckedNames])

  return {
    selectedNames,

    checkedNames,

    activeItems,

    selectedItem,

    filteredItems: activeItems,

    selectedName,

    activeCheckedNames,

    visibleNames,

    allVisibleChecked,

    someVisibleChecked,

    selectItem,

    setTabCheckedNames,

    toggleChecked,

    toggleAllVisible,

    clearChecked,
  }
}
