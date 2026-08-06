import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import type {
  ModeConfigItem,
  ModePanelItem,
  ModePanelProps,
  ModePanelTab,
} from '../types'

import RunModal from '../RunModal'

import ModeTitle from './components/ModeTitle'
import ModeToolbar from './components/ModeToolbar'
import ModeList from './components/ModeList'
import ModeFooter from './components/ModeFooter'
import ModeTypeSwitcher from './components/ModeTypeSwitcher'
import CreateModal from './components/CreateModal'
import RenameModal from './components/RenameModal'

import { useModeResource } from './hooks/useModeResource'
import { useModeSelection } from './hooks/useModeSelection'
import { useModeCrud } from './hooks/useModeCrud'
import { useModeRun } from './hooks/useModeRun'

import { createCopyName, sameName } from './utils'
import { readSavedParams, updateSavedParamReferences } from '../savedParamUtils'

import {
  deleteVerificationModeCfg,
  duplicateVerificationModeCfg,
  getLanderModePipelines,
  renameVerificationModeCfg,
  selectVerificationModeCfg,
  openFileInEditor,
} from '../../../../utils/ipc'
import { confirmDelete } from '../../../../utils/confirmDelete'
import { useVerificationStageConfig } from './hooks/useVerificationStageConfig'
import usePipelineRuntimeStore from '../../../../store/pipelineRuntimeStore'
import { useShallow } from 'zustand/react/shallow'

export default function ModePanel({
  accent,
  initialTab = 'mode',
  title,
  initialCollapsed = false,
  onSelect,
  onCheckedChange,
  onDefaultStepsChange,
  onRun,
  onStop,
}: ModePanelProps) {
  const accentColor = accent ?? 'var(--vscode-focusBorder, #1677ff)'
  const {
    stage,
    stageConfig,
    loading: stageConfigLoading,
    handleSave,
  } = useVerificationStageConfig()

  const [activeTab, setActiveTab] = useState<ModePanelTab>(initialTab)

  const [collapsed, setCollapsed] = useState(initialCollapsed)

  const [batchCheckedNamesByTab, setBatchCheckedNamesByTab] = useState<
    Record<ModePanelTab, string[]>
  >({
    mode: [],
    group: [],
    tc: [],
    subattr: [],
  })

  const { resources, updateResources, syncModesFromDirectory } = useModeResource()

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
  const runningModeNames = usePipelineRuntimeStore(
    useShallow((state) =>
      Object.values(state.runtimes)
        .filter(
          (runtime) =>
            runtime.flowKey === 'verification' &&
            runtime.runState === 'running',
        )
        .map((runtime) => runtime.moduleKey),
    ),
  )

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

  const [parsing, setParsing] = useState(false)

  const allItems = resources[activeTab]

  const focusedNames =
    activeTab === 'mode'
      ? selection.activeCheckedNames
      : allItems.map((item) => item.name)

  const batchCheckedNames = batchCheckedNamesByTab[activeTab]

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

    void getLanderModePipelines().then((result) => {
      if (!cancelled) {
        onDefaultStepsChange(Object.fromEntries(
          focusedModes.map((mode) => [mode.name, result.success ? result.steps : []]),
        ))
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

  const visibleItems = selection.filteredItems

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
    setCreateOpen(true)
  }

  const closeCreate = () => {
    if (parsing) {
      return
    }

    setCreateOpen(false)
  }

  const handleSelectCfg = async (): Promise<string | null> => {
    if (!stage) throw new Error('请先选择 Verification stage。')
    const selected = await selectVerificationModeCfg(stage)
    if (!selected) return null
    setParsing(true)

    try {
      return selected.modeName
    } finally {
      setParsing(false)
    }
  }

  const confirmCreate = (name: string) => {
    const success = crud.createItem(activeTab, name)

    if (!success) {
      return
    }

    setCreateOpen(false)
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

    const nextName = value.trim()
    if (!nextName) {
      message.warning('请输入名称')
      return
    }

    if (activeTab === 'mode') {
      if (!stage) return
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
    } else {
      if (resources[activeTab].some((item) => item.name !== renameItem.name && item.name === nextName)) {
        message.error(`${activeTab} 名称 "${nextName}" 已存在`)
        return
      }

      const result = updateSavedParamReferences(
        readSavedParams(stageConfig?.params),
        activeTab,
        [renameItem.name],
        nextName,
      )
      if (result.affectedAliases.length > 0) {
        if (!await handleSave({ params: result.params })) return
        message.warning(
          `重命名影响了 ${result.affectedAliases.length} 个保存场景，已自动更新参数`,
        )
      }
    }
    const success = crud.renameItem(renameItem, activeTab, nextName)

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

  const handleVersion = async () => {
    if (!selectedItem) {
      return
    }

    if (activeTab === 'mode') {
      if (!stage) return
      // const targetName = createVersionName(resources.mode, selectedItem.name)
      // try {
      //   await duplicateVerificationModeCfg(stage, selectedItem.name, targetName)
      // } catch (error) {
      //   message.error(error instanceof Error ? error.message : 'Mode 配置文件新增版本失败')
      //   return
      // }
      // crud.duplicateVersionItem(selectedItem, activeTab, targetName)
    }
  }

  const handleOpen = async () => {
    if (!selectedItem) return;
    const selectMode = resources.mode.find((item) => item.name === selectedItem.name);
    if (!selectMode) return;

    if (selectMode.filePath) {
      openFileInEditor(selectMode.filePath);
    } else {
      message.warning('模块 CFG 路径为空');
    }
  };

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

  const handleDelete = async () => {
    const deleteNames = batchCheckedNames.length
      ? [...batchCheckedNames]
      : selectedItem ? [selectedItem.name] : [];

    if (!deleteNames.length) {
      return;
    }

    if (!await confirmDelete('Mode', deleteNames)) return

    if (activeTab === 'mode') {
      if (!stage) return
      try {
        await deleteVerificationModeCfg(stage, deleteNames)
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'Mode 配置文件删除失败')
        return
      }
    } else {
      const result = updateSavedParamReferences(
        readSavedParams(stageConfig?.params),
        activeTab,
        deleteNames,
      )
      if (result.affectedAliases.length > 0) {
        if (!await handleSave({ params: result.params })) return
        message.warning(
          `删除影响了 ${result.affectedAliases.length} 个保存场景，已自动移除相关参数`,
        )
      }
    }

    crud.deleteItems(activeTab, deleteNames)
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
      !item.name
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

      <div style={{ padding: '10px 12px 0' }}>
        <ModeTypeSwitcher
          activeTab={activeTab}
          accent={accentColor}
          onChange={setActiveTab}
        />
      </div>

      <div
        style={{
          minWidth: 0,
          padding: 12,
          boxSizing: 'border-box',
        }}
      >
        <ModeToolbar
          activeTab={activeTab}
          hasSelected={Boolean(selectedItem)}
          checkedCount={batchCheckedNames.length}
          focusOptions={activeTab === 'mode' ? focusOptions : []}
          focusedNames={focusedNames}
          accent={accentColor}
          onFocusChange={handleFocusChange}
          onCreate={openCreate}
          onVersion={handleVersion}
          onCopy={handleCopy}
          onRename={handleRename}
          onDelete={handleDelete}
          onRefresh={activeTab === 'mode' ? () => {
            void syncModesFromDirectory()
              .then(() => message.success('Modes synced from lander_cfg'))
              .catch((error) => message.error(
                error instanceof Error ? error.message : 'Failed to sync modes',
              ))
          } : undefined}
        />

        <div style={{ marginTop: 10 }}>
          <ModeList
            tab={activeTab}
            items={visibleItems}
            selectedName={selectedItem?.name ?? ''}
            checkedNames={batchCheckedNames}
            runningNames={runningModeNames}
            accent={accentColor}
            onSelect={(item) => {
              selection.selectItem(activeTab, item)
            }}
            onCheckedChange={handleBatchCheckedChange}
            onRun={handleRunItem}
            onStop={handleStopItem}
            openSelected={handleOpen}
            duplicateSelected={handleCopy}
            openRename={handleRename}
            deleteSelected={handleDelete}
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
        stage={stage}
        groups={resources.group}
        tcs={resources.tc}
        subattrs={resources.subattr}
        getLanderModePipelines={getLanderModePipelines}
        stageConfig={stageConfig}
        stageConfigLoading={stageConfigLoading}
        handleSave={handleSave}
        onCancel={run.closeRun}
        onAfterClose={run.clearRunMode}
        onRun={run.handleRun}
      />
    </div>
  )
}
