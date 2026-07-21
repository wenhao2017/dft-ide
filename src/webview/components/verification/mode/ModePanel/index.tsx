import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import type {
  ModeConfigItem,
  ModePanelItem,
  ModePanelProps,
  ModePanelTab,
  ParsedCfgResult,
} from '../types'

import RunModal from '../RunModal'

import ModeTitle from './components/ModeTitle'
import ModeToolbar from './components/ModeToolbar'
import ModeList from './components/ModeList'
import ModeFooter from './components/ModeFooter'
import CreateModal from './components/CreateModal'
import RenameModal from './components/RenameModal'

import { useModeResource } from './hooks/useModeResource'
import { useModeSelection } from './hooks/useModeSelection'
import { useModeCrud } from './hooks/useModeCrud'
import { useModeRun } from './hooks/useModeRun'

import { createCopyName, parseImportedModeCfg, sameName } from './utils'

import {
  duplicateVerificationModeCfg,
  getLanderModePipelines,
  renameVerificationModeCfg,
  selectVerificationModeCfg,
} from '../../../../utils/ipc'
import { useVerificationStageConfig } from './hooks/useVerificationStageConfig'

export default function ModePanel({
  accent,
  initialTab = 'mode',
  title,
  onSelect,
  onCheckedChange,
  onDefaultStepsChange,
  onRun,
  onStop,
}: ModePanelProps) {
  const accentColor = accent ?? 'var(--vscode-focusBorder, #1677ff)'
  const { stage } = useVerificationStageConfig()

  const [activeTab] = useState<ModePanelTab>(initialTab)

  const [collapsed, setCollapsed] = useState(false)

  const [batchCheckedNamesByTab, setBatchCheckedNamesByTab] = useState<
    Record<ModePanelTab, string[]>
  >({
    mode: [],
    group: [],
    tc: [],
    subattr: [],
  })

  const { resources, updateResources } = useModeResource()

  const handleModeFocusChange = useCallback(
    (names: string[]) => {
      updateResources((current) => {
        const validNames = new Set(current.mode.map((item) => item.name))

        const nextFocusModes = Array.from(
          new Set(names.filter((name) => validNames.has(name))),
        )

        return {
          ...current,
          focusModes: nextFocusModes,
        }
      })
    },
    [updateResources],
  )

  const selection = useModeSelection({
    activeTab,
    resources,
    onModeFocusChange: handleModeFocusChange,
    onSelect,
    onCheckedChange,
  })

  const run = useModeRun({
    onRun,
    onStop,
  })

  const crud = useModeCrud({
    resources,
    updateResources,

    selectItem: selection.selectItem,

    checkedNames: selection.checkedNames,

    selectedNames: selection.selectedNames,

    setCheckedNames: selection.setTabCheckedNames,

    setRunningNames: run.setRunningNames,
  })

  const [createOpen, setCreateOpen] = useState(false)

  const [renameOpen, setRenameOpen] = useState(false)

  const [renameItem, setRenameItem] = useState<ModePanelItem>()

  const [cfgResult, setCfgResult] = useState<ParsedCfgResult>()

  const [parsing, setParsing] = useState(false)

  const allItems = resources[activeTab]

  const focusedNames = selection.activeCheckedNames

  const batchCheckedNames = batchCheckedNamesByTab[activeTab]

  const searchValue = selection.searchValues[activeTab]

  /**
   * resources.focusModes may be restored asynchronously from persisted state.
   * Keep the execution overview in sync even when the user has not changed the
   * focus selector during the current session.
   */
  useEffect(() => {
    onCheckedChange?.('mode', resources.focusModes)
  }, [onCheckedChange, resources.focusModes])

  useEffect(() => {
    if (!onDefaultStepsChange) {
      return
    }

    let cancelled = false
    const focusedNames = new Set(resources.focusModes)
    const focusedModes = resources.mode.filter((mode) => focusedNames.has(mode.name))

    void Promise.all(focusedModes.map(async (mode) => {
      const result = await getLanderModePipelines(mode.preMode)
      return [mode.name, result.success ? result.steps : []] as const
    })).then((entries) => {
      if (!cancelled) {
        onDefaultStepsChange(Object.fromEntries(entries))
      }
    })

    return () => {
      cancelled = true
    }
  }, [onDefaultStepsChange, resources.focusModes, resources.mode])

  const focusOptions = useMemo(
    () =>
      allItems.map((item) => ({
        label: item.name,
        value: item.name,
      })),
    [allItems],
  )

  /**
   * 当前列表仅显示：
   *
   * 1. 已关注项目；
   * 2. 符合当前搜索条件的项目。
   */
  const visibleItems = useMemo(() => {
    if (!focusedNames.length) {
      return []
    }

    const focusedSet = new Set(focusedNames)

    const term = searchValue.trim().toLowerCase()

    return allItems.filter((item) => {
      if (!focusedSet.has(item.name)) {
        return false
      }

      if (!term) {
        return true
      }

      if (item.name.toLowerCase().includes(term)) {
        return true
      }

      if (
        activeTab === 'mode' &&
        'preMode' in item &&
        typeof item.preMode === 'string'
      ) {
        return item.preMode.toLowerCase().includes(term)
      }

      return false
    })
  }, [activeTab, allItems, focusedNames, searchValue])

  useEffect(() => {
    const validNames = new Set(allItems.map((item) => item.name))

    const focusedNameSet = new Set(focusedNames)

    setBatchCheckedNamesByTab((current) => {
      const currentNames = current[activeTab]

      const nextNames = currentNames.filter(
        (name) => validNames.has(name) && focusedNameSet.has(name),
      )

      const unchanged =
        nextNames.length === currentNames.length &&
        nextNames.every((name, index) => name === currentNames[index])

      if (unchanged) {
        return current
      }

      return {
        ...current,
        [activeTab]: nextNames,
      }
    })
  }, [activeTab, allItems, focusedNames])

  /**
   * 只允许已关注项目成为当前选择。
   */
  const selectedItem = useMemo(() => {
    const item = selection.selectedItem

    if (!item) {
      return undefined
    }

    return focusedNames.includes(item.name) ? item : undefined
  }, [focusedNames, selection.selectedItem])

  const openCreate = () => {
    setCfgResult(undefined)
    setCreateOpen(true)
  }

  const closeCreate = () => {
    if (parsing) {
      return
    }

    setCreateOpen(false)
    setCfgResult(undefined)
  }

  const handleSelectCfg = async (): Promise<string | null> => {
    if (!stage) throw new Error('请先选择 Verification stage。')
    const selected = await selectVerificationModeCfg(stage)
    if (!selected) return null
    setParsing(true)
    setCfgResult(undefined)

    try {
      const result = await parseImportedModeCfg(selected.path)

      setCfgResult(result)
      return selected.modeName
    } finally {
      setParsing(false)
    }
  }

  const confirmCreate = (name: string, result?: ParsedCfgResult) => {
    const success = crud.createItem(activeTab, name, result)

    if (!success) {
      return
    }

    setCreateOpen(false)
    setCfgResult(undefined)
  }

  const openRename = (item: ModePanelItem) => {
    setRenameItem(item)
    setRenameOpen(true)
  }

  const closeRename = () => {
    setRenameOpen(false)
    setRenameItem(undefined)
  }

  const confirmRename = async (value: string) => {
    if (!renameItem) {
      return
    }

    if (activeTab === 'mode') {
      if (!stage) return
      const nextName = value.trim()
      if (!nextName) {
        message.warning('请输入名称')
        return
      }
      if (resources.mode.some((item) => !sameName(item.name, renameItem.name) && sameName(item.name, nextName))) {
        message.error(`mode 名称 ${nextName} 已存在`)
        return
      }
      try {
        await renameVerificationModeCfg(stage, renameItem.name, nextName)
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'Mode 配置文件重命名失败')
        return
      }
    }
    const success = crud.renameItem(renameItem, activeTab, value)

    if (!success) {
      return
    }

    closeRename()
  }

  const handleFocusChange = (names: string[]) => {
    const validNames = new Set(allItems.map((item) => item.name))

    const nextNames = Array.from(
      new Set(names.filter((name) => Boolean(name) && validNames.has(name))),
    )

    const addedName = nextNames.find((name) => !focusedNames.includes(name))

    selection.setTabCheckedNames(activeTab, nextNames)

    /**
     * 新增关注后，选中新关注的条目。
     */
    if (addedName) {
      const addedItem = allItems.find((item) => item.name === addedName)

      if (addedItem) {
        selection.selectItem(activeTab, addedItem)

        return
      }
    }

    /**
     * 当前选择仍在关注列表中时，
     * 继续保留当前选择。
     */
    const currentSelected = selection.selectedItem

    if (currentSelected && nextNames.includes(currentSelected.name)) {
      return
    }

    /**
     * 当前选择已取消关注，
     * 自动选择剩余的第一项。
     */
    const nextItem = allItems.find((item) => nextNames.includes(item.name))

    if (nextItem) {
      selection.selectItem(activeTab, nextItem)

      return
    }

    selection.selectItem(activeTab, undefined)
  }

  const handleCopy = async () => {
    if (!selectedItem) {
      return
    }

    if (activeTab === 'mode') {
      if (!stage) return
      const targetName = createCopyName(resources.mode, selectedItem.name)
      try {
        await duplicateVerificationModeCfg(stage, selectedItem.name, targetName)
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'Mode 配置文件复制失败')
        return
      }
      crud.duplicateItem(selectedItem, activeTab, targetName)
      return
    }
    crud.duplicateItem(selectedItem, activeTab)
  }

  const handleRename = () => {
    if (!selectedItem) {
      return
    }

    openRename(selectedItem)
  }

  const handleDelete = () => {
    if (!batchCheckedNames.length) {
      return
    }

    crud.deleteItems(activeTab, batchCheckedNames)
  }

  const handleBatchCheckedChange = (name: string, checked: boolean) => {
    setBatchCheckedNamesByTab((current) => {
      const currentNames = current[activeTab]

      const nextNames = checked
        ? Array.from(new Set([...currentNames, name]))
        : currentNames.filter((currentName) => currentName !== name)

      return {
        ...current,
        [activeTab]: nextNames,
      }
    })
  }

  const handleRunItem = (item: ModePanelItem) => {
    if (
      activeTab !== 'mode' ||
      !('preMode' in item) ||
      typeof item.preMode !== 'string' ||
      !item.preMode.trim()
    ) {
      return
    }

    run.openRun(item)
  }

  const handleStopItem = (item: ModePanelItem) => {
    if (activeTab !== 'mode') {
      return
    }

    void run.stopModes([item.name])
  }

  /**
   * 收起状态只保留展开条。
   */
  if (collapsed) {
    return (
      <div
        style={{
          width: 32,
          minWidth: 32,
          maxWidth: 32,

          flex: '1 1 0',
          minHeight: 0,
          alignSelf: 'stretch',

          display: 'flex',
          flexDirection: 'column',

          overflow: 'hidden',
        }}
      >
        <ModeTitle
          activeTab={activeTab}
          title={title}
          accent={accentColor}
          collapsed
          totalCount={allItems.length}
          focusedCount={focusedNames.length}
          onCollapsedChange={setCollapsed}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        width: 300,
        minWidth: 280,
        maxWidth: 300,

        flex: '0 0 auto',
        alignSelf: 'flex-start',

        borderRadius: 8,

        border:
          '1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.22))',

        background:
          'var(--vscode-sideBar-background, var(--vscode-editor-background))',

        display: 'flex',
        flexDirection: 'column',

        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <ModeTitle
        activeTab={activeTab}
        title={title}
        accent={accentColor}
        collapsed={false}
        totalCount={allItems.length}
        focusedCount={focusedNames.length}
        onCollapsedChange={setCollapsed}
      />

      <div
        style={{
          minWidth: 0,
          padding: 12,
          boxSizing: 'border-box',
        }}
      >
        <ModeToolbar
          activeTab={activeTab}
          searchValue={searchValue}
          hasSelected={Boolean(selectedItem)}
          checkedCount={batchCheckedNames.length}
          focusOptions={focusOptions}
          focusedNames={focusedNames}
          accent={accentColor}
          onSearchChange={(value) => {
            selection.setSearchValues((current) => ({
              ...current,
              [activeTab]: value,
            }))
          }}
          onFocusChange={handleFocusChange}
          onCreate={openCreate}
          onCopy={handleCopy}
          onRename={handleRename}
          onDelete={handleDelete}
        />

        <div style={{ marginTop: 10 }}>
          <ModeList
            tab={activeTab}
            items={visibleItems}
            selectedName={selectedItem?.name ?? ''}
            checkedNames={batchCheckedNames}
            runningNames={run.runningNames}
            accent={accentColor}
            onSelect={(item) => {
              selection.selectItem(activeTab, item)
            }}
            onCheckedChange={handleBatchCheckedChange}
            onRun={handleRunItem}
            onStop={handleStopItem}
          />
        </div>
      </div>

      <ModeFooter
        tab={activeTab}
        selectedItem={selectedItem}
        totalCount={allItems.length}
        focusedCount={focusedNames.length}
        visibleCount={visibleItems.length}
        accent={accentColor}
      />

      <CreateModal
        open={createOpen}
        tab={activeTab}
        parsing={parsing}
        cfgResult={cfgResult}
        accent={accentColor}
        onCancel={closeCreate}
        onSelectCfg={handleSelectCfg}
        onConfirm={confirmCreate}
      />

      <RenameModal
        open={renameOpen}
        value={renameItem?.name ?? ''}
        accent={accentColor}
        onCancel={closeRename}
        onConfirm={confirmRename}
      />

      <RunModal
        open={run.runOpen}
        mode={run.runMode}
        groups={resources.group}
        tcs={resources.tc}
        subattrs={resources.subattr}
        getLanderModePipelines={getLanderModePipelines}
        onCancel={run.closeRun}
        onRun={run.handleRun}
      />
    </div>
  )
}
