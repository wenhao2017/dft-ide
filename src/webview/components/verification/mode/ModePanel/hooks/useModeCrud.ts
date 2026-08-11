import { useCallback } from 'react'

import { message } from 'antd'

import type {
  ModeTreeNodeItem,
  ModeConfigItem,
  ModePanelTab,
  ResourceStore,
} from '../../types'

import { createCopyName, sameName, toModeTreeNodeItem, duplicateModeTreeNodeItem } from '../utils'

interface UseModeCrudProps {
  resources: ResourceStore

  updateResources: (updater: (current: ResourceStore) => ResourceStore) => void

  selectItem: (tab: ModePanelTab, item?: ModeTreeNodeItem) => void

  checkedNames: Record<ModePanelTab, string[]>

  selectedNames: Record<ModePanelTab, ModeTreeNodeItem>

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
// -------------------------------------------- Mode -------------------------------------------------
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
    (tab: ModePanelTab, name: string) => {
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
        const item: ModeConfigItem = {
          name: normalizedName,
        }

        updateResources((current) => ({
          ...current,

          mode: [...current.mode, item],

          focusModes: Array.from(new Set([...current.focusModes, item.name])),
        }))

        selectItem(tab, toModeTreeNodeItem(item))
      } else {
        const item: ModeTreeNodeItem = {
          key: normalizedName,
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
    (item?: ModeTreeNodeItem, tab?: ModePanelTab, targetName?: string) => {
      if (!item) {
        return false
      }

      const targetTab = tab ?? 'mode'

      const duplicatedName = targetName ?? createCopyName(resources[targetTab], item.name)

      const duplicated: ModeTreeNodeItem = {
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
    (item: ModeTreeNodeItem, tab: ModePanelTab, nextName: string) => {
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

      const renamed: ModeTreeNodeItem = {
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

      if (removeSet.has(selectedNames[tab].name)) {
        const remain = resources[tab].filter(
          (item) => !removeSet.has(item.name),
        )

        selectItem(tab, toModeTreeNodeItem(remain[0]))
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

// -------------------------------------------- Version -------------------------------------------------
  const appendVersion = useCallback(
    (item: ModeTreeNodeItem, tab: ModePanelTab, version: string) => {
      if (tab === 'mode') {
        const findItem = resources.mode.find(m => m.name === item.name)
        if (!findItem) return false

        if (findItem.versions === undefined) {
          findItem.versions = []
        }
        findItem.versions.push(version)

        updateResources((current) => ({
          ...current,
          [tab]: current[tab].map((a) =>
            sameName(a.name, item.name) ? findItem : a,
          ),
          focusModes: current.focusModes,
        }))

        selectItem(tab, duplicateModeTreeNodeItem(item, version))
      }
      return true
    },
    [resources, selectItem, updateResources],
  )

  const renameVersion = useCallback(
    (item: ModeTreeNodeItem, tab: ModePanelTab, targetVersion: string) => {
      if (tab === 'mode') {
        const findItem = resources.mode.find(m => m.name === item.name)
        if (!findItem) return false

        if (findItem.versions === undefined) {
          findItem.versions = []
        }
        const index = findItem.versions.indexOf(item.version!);
        if (index !== -1) {
          findItem.versions[index] = targetVersion;
        }

        updateResources((current) => ({
          ...current,
          [tab]: current[tab].map((a) =>
            sameName(a.name, item.name) ? findItem : a,
          ),
          focusModes: current.focusModes,
        }))

        selectItem(tab, duplicateModeTreeNodeItem(item, targetVersion))
      }
      return true
    },
    [resources, selectItem, updateResources],
  )

  const deleteVersion = useCallback(
    (item: ModeTreeNodeItem, tab: ModePanelTab) => {
      if (tab === 'mode') {
        if (!item.version) return false
        const findItem = resources.mode.find(m => m.name === item.name)
        if (!findItem) return false

        if (findItem.versions === undefined) {
          findItem.versions = []
        }
        findItem.versions = findItem.versions.filter(version => version !== item.version);

        updateResources((current) => ({
          ...current,
          [tab]: current[tab].map((a) =>
            sameName(a.name, item.name) ? findItem : a,
          ),
          focusModes: current.focusModes,
        }))

        selectItem(tab, duplicateModeTreeNodeItem(item))
      }
      return true
    },
    [resources, selectItem, updateResources],
  )

  return {
    createItem,
    duplicateItem,
    renameItem,
    deleteItems,

    appendVersion,
    renameVersion,
    deleteVersion
  }
}
