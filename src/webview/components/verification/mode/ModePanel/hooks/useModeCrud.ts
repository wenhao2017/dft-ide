import { useCallback } from 'react'

import { message } from 'antd'

import type {
  BaseConfigItem,
  ModeConfigItem,
  ModePanelItem,
  ModePanelTab,
  ParsedCfgResult,
  ResourceStore,
} from '../../types'

import { createCopyName, sameName } from '../utils'

interface UseModeCrudProps {
  resources: ResourceStore

  updateResources: (updater: (current: ResourceStore) => ResourceStore) => void

  selectItem: (tab: ModePanelTab, item?: ModePanelItem) => void

  checkedNames: Record<ModePanelTab, string[]>

  selectedNames: Record<ModePanelTab, string>

  setCheckedNames: (tab: ModePanelTab, names: string[]) => void

  setRunningNames: (updater: (current: string[]) => string[]) => void
}

export function useModeCrud({
  resources,
  updateResources,
  selectItem,
  checkedNames,
  selectedNames,
  setCheckedNames,
  setRunningNames,
}: UseModeCrudProps) {
  const ensureUniqueName = useCallback(
    (tab: ModePanelTab, name: string, ignoreName?: string) => {
      const duplicated = resources[tab].some((item) => {
        const namesMatch = (left: string, right: string) =>
          tab === 'mode' ? sameName(left, right) : left === right

        if (ignoreName && namesMatch(item.name, ignoreName)) {
          return false
        }

        return namesMatch(item.name, name)
      })

      if (duplicated) {
        throw new Error(`${tab} 名称 "${name}" 已存在`)
      }
    },
    [resources],
  )

  const createItem = useCallback(
    (tab: ModePanelTab, name: string, cfgResult?: ParsedCfgResult) => {
      const normalizedName = name.trim()

      if (!normalizedName) {
        message.warning('请输入名称')

        return false
      }

      try {
        ensureUniqueName(tab, normalizedName)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '名称已存在')

        return false
      }

      if (tab === 'mode') {
        if (!cfgResult?.preMode) {
          message.warning('mode.cfg 中未解析到有效 preMode')

          return false
        }

        const item: ModeConfigItem = {
          name: normalizedName,

          preMode: cfgResult.preMode,
        }

        updateResources((current) => ({
          ...current,

          mode: [...current.mode, item],

          focusModes: Array.from(new Set([...current.focusModes, item.name])),
        }))

        selectItem(tab, item)
      } else {
        const item: BaseConfigItem = {
          name: normalizedName,
        }

        updateResources((current) => ({
          ...current,

          [tab]: [...current[tab], item],
        }))

        selectItem(tab, item)
      }

      message.success(`已新增 ${normalizedName}`)

      return true
    },
    [ensureUniqueName, selectItem, updateResources],
  )

  const duplicateItem = useCallback(
    (item?: ModePanelItem, tab?: ModePanelTab, targetName?: string) => {
      if (!item) {
        return false
      }

      const targetTab = tab ?? 'mode'

      const duplicatedName = targetName ?? createCopyName(resources[targetTab], item.name)

      const duplicated: ModePanelItem = {
        ...item,

        name: duplicatedName,
      }

      updateResources((current) => ({
        ...current,

        [targetTab]: [...current[targetTab], duplicated],

        ...(targetTab === 'mode'
          ? {
              focusModes: Array.from(
                new Set([...current.focusModes, duplicated.name]),
              ),
            }
          : {}),
      }))

      selectItem(targetTab, duplicated)

      message.success(`已复制 ${item.name}`)

      return true
    },
    [resources, selectItem, updateResources],
  )

  const renameItem = useCallback(
    (item: ModePanelItem, tab: ModePanelTab, nextName: string) => {
      const name = nextName.trim()

      if (!name) {
        message.warning('请输入名称')

        return false
      }

      try {
        ensureUniqueName(tab, name, item.name)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '名称已存在')

        return false
      }

      const renamed: ModePanelItem = {
        ...item,

        name,
      }

      updateResources((current) => ({
        ...current,

        [tab]: current[tab].map((currentItem) =>
          sameName(currentItem.name, item.name) ? renamed : currentItem,
        ),

        ...(tab === 'mode'
          ? {
              focusModes: current.focusModes.map((value) =>
                sameName(value, item.name) ? name : value,
              ),
            }
          : {}),
      }))

      selectItem(tab, renamed)

      message.success(`已重命名为 ${name}`)

      return true
    },
    [ensureUniqueName, selectItem, updateResources],
  )

  const deleteItems = useCallback(
    (tab: ModePanelTab, names: string[]) => {
      const removeSet = new Set(names)

      updateResources((current) => ({
        ...current,

        [tab]: current[tab].filter((item) => !removeSet.has(item.name)),

        ...(tab === 'mode'
          ? {
              focusModes: current.focusModes.filter(
                (name) => !removeSet.has(name),
              ),
            }
          : {}),
      }))

      setCheckedNames(
        tab,
        checkedNames[tab].filter((name) => !removeSet.has(name)),
      )

      if (tab === 'mode') {
        setRunningNames((current) =>
          current.filter((name) => !removeSet.has(name)),
        )
      }

      if (removeSet.has(selectedNames[tab])) {
        const remain = resources[tab].filter(
          (item) => !removeSet.has(item.name),
        )

        selectItem(tab, remain[0])
      }
    },
    [
      checkedNames,
      resources,
      selectItem,
      selectedNames,
      setCheckedNames,
      setRunningNames,
      updateResources,
    ],
  )

  return {
    createItem,

    duplicateItem,

    renameItem,

    deleteItems,
  }
}
