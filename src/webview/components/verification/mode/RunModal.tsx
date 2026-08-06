import { useEffect, useMemo, useRef, useState } from 'react'

import { Button, Checkbox, Empty, Input, Modal, Popconfirm, Select, Space, message, Typography } from 'antd'

import type {
  BaseConfigItem,
  GetLanderModePipelines,
  LanderStep,
  ModeConfigItem,
  ModeRunPayload,
  RunParamRow,
} from './types'

import StepSelector, { VERIFICATION_STEP_PRESETS } from './StepSelector'
import ParamTable from './ParamTable'
import { readSavedParams, type SavedParams } from './savedParamUtils'

interface RunModalProps {
  open: boolean
  mode?: ModeConfigItem
  stage?: string

  groups: BaseConfigItem[]
  tcs: BaseConfigItem[]
  subattrs: BaseConfigItem[]

  stageConfig: Record<string, unknown> | null
  stageConfigLoading: boolean
  handleSave: (data: Record<string, unknown>) => Promise<boolean>

  onCancel: () => void
  onAfterClose: () => void
  onRun: (payload: ModeRunPayload) => void

  getLanderModePipelines: GetLanderModePipelines
}

const createRunParamRow = (): RunParamRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  groupNames: [],
  tcNames: [],
  subattrNames: [],
  extraArg: '',
  tools: [],
  donau: {},
})

const cloneRows = (rows: RunParamRow[]): RunParamRow[] => {
  return rows.map((row) => ({
    ...row,
    groupNames: [...row.groupNames],
    tcNames: [...row.tcNames],
    subattrNames: [...row.subattrNames],
    extraArg: row.extraArg ?? '',
    tools: row.tools.map((tool) => ({
      ...tool,
    })),
    donau: {
      ...row.donau,
    },
  }))
}

const cloneRow = (row: RunParamRow): RunParamRow => cloneRows([row])[0]

export default function RunModal({
  open,
  mode,
  stage,
  groups,
  tcs,
  subattrs,
  stageConfig,
  stageConfigLoading,
  handleSave,
  onCancel,
  onAfterClose,
  onRun,
  getLanderModePipelines,
}: RunModalProps) {
  const [loading, setLoading] = useState(false)
  const loadRequestRef = useRef(0)
  const [init, setInit] = useState(false)
  const [dialogStep, setDialogStep] = useState<'options' | 'transition' | 'run'>('options')

  const [loadedSteps, setLoadedSteps] = useState<{
    optionsKey: string
    steps: LanderStep[]
  }>()

  const [range, setRange] = useState<[number, number]>([0, 0])

  const [rows, setRows] = useState<RunParamRow[]>([createRunParamRow()])
  const [scenarioAlias, setScenarioAlias] = useState('')
  const [selectedAlias, setSelectedAlias] = useState<string>()
  const [savedParams, setSavedParams] = useState<SavedParams>({})
  const [savingParams, setSavingParams] = useState(false)

  useEffect(() => {
    if (open && mode) {
      loadRequestRef.current += 1
      setLoading(false)
      setLoadedSteps(undefined)
      setRange([0, 0])
      setRows([createRunParamRow()])
      setScenarioAlias('')
      setSelectedAlias(undefined)
      setInit(false)
      setDialogStep('options')
    }
  }, [open, mode?.name, stage])

  useEffect(() => {
    if (!stageConfigLoading) {
      setSavedParams(readSavedParams(stageConfig?.params))
    }
  }, [stageConfig, stageConfigLoading])

  const optionsKey = mode && stage ? `${stage}\u0000${mode.name}\u0000${init}` : ''
  const steps = loadedSteps?.optionsKey === optionsKey ? loadedSteps.steps : []
  const runDialogReady = loadedSteps?.optionsKey === optionsKey

  const confirmRunOptions = async () => {
    if (!mode || loading) {
      return
    }

    if (!stage) {
      message.error('请先选择 Verification stage')
      return
    }

    const requestId = ++loadRequestRef.current
    const requestedOptionsKey = `${stage}\u0000${mode.name}\u0000${init}`
    setLoading(true)
    setLoadedSteps(undefined)
    setRange([0, 0])

    try {
      const result = await getLanderModePipelines({
        stage,
        modeName: mode.name,
        init,
      })

      if (requestId !== loadRequestRef.current) {
        return
      }

      if (!result.success) {
        message.error(result.error ?? '读取流水线步骤失败')
        return
      }

      setLoadedSteps({ optionsKey: requestedOptionsKey, steps: result.steps })
      setRange(result.steps.length > 0 ? [0, result.steps.length - 1] : [0, 0])
      // Close the compact options dialog first. Its after-close callback opens
      // the full run dialog, so the two modal animations and masks never overlap.
      setDialogStep('transition')
    } catch (error) {
      if (requestId !== loadRequestRef.current) {
        return
      }

      message.error(error instanceof Error ? error.message : '读取流水线步骤失败')
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false)
      }
    }
  }

  const selectedSteps = useMemo(() => {
    return steps.slice(range[0], range[1] + 1)
  }, [steps, range])

  const stepNames = useMemo(() => {
    return selectedSteps.map((step) => step.name)
  }, [selectedSteps])

  const loadSavedParams = (alias: string) => {
    const savedRow = savedParams[alias]

    if (!savedRow) {
      return
    }

    setSelectedAlias(alias)
    setScenarioAlias(alias)
    setRows([cloneRow(savedRow)])
  }

  const saveCurrentParams = async () => {
    const alias = scenarioAlias.trim()

    if (!alias) {
      message.warning('请输入场景别名')
      return
    }

    const nextParams = {
      ...savedParams,
      [alias]: cloneRow(rows[0]),
    }

    setSavingParams(true)
    try {
      if (await handleSave({ params: nextParams })) {
        setSavedParams(nextParams)
        setSelectedAlias(alias)
        setScenarioAlias(alias)
      }
    } finally {
      setSavingParams(false)
    }
  }

  const deleteSavedParams = async () => {
    if (!selectedAlias) {
      return
    }

    const nextParams = { ...savedParams }
    delete nextParams[selectedAlias]

    setSavingParams(true)
    try {
      if (await handleSave({ params: nextParams })) {
        setSavedParams(nextParams)
        setSelectedAlias(undefined)
        setScenarioAlias('')
      }
    } finally {
      setSavingParams(false)
    }
  }

  const clearRunParams = () => {
    setRows([createRunParamRow()])
    setSelectedAlias(undefined)
    setScenarioAlias('')
  }

  const closeModal = () => {
    loadRequestRef.current += 1
    onCancel()
  }

  const resetSession = () => {
    setDialogStep('options')
    setLoading(false)
    setLoadedSteps(undefined)
    setRange([0, 0])
    setRows([createRunParamRow()])
    setScenarioAlias('')
    setSelectedAlias(undefined)
    setInit(false)
  }

  const finishDialogClose = () => {
    if (!open) {
      resetSession()
      onAfterClose()
    }
  }

  const confirm = () => {
    if (!mode) {
      return
    }

    if (!stepNames.length) {
      message.warning('请选择至少一个 Step')

      return
    }

    const payload: ModeRunPayload = {
      mode,
      stepRange: range,
      stepNames,
      stepIds: selectedSteps.map((step) => step.id),
      steps: selectedSteps.map((step) => ({ ...step })),
      rows: cloneRows(rows),
    }

    // Keep the second-step content stable during Ant Design's close animation.
    // Reset it only after the modal is fully hidden.
    loadRequestRef.current += 1
    onRun(payload)
  }

  return (
    <>
      <Modal
        open={open && dialogStep === 'options'}
        title={mode ? `运行 ${mode.name}` : '运行'}
        width={520}
        confirmLoading={loading}
        okText="下一步"
        cancelText="取消"
        onCancel={closeModal}
        onOk={() => void confirmRunOptions()}
        afterOpenChange={(visible) => {
          if (!visible) {
            if (open && dialogStep === 'transition' && runDialogReady) {
              setDialogStep('run')
              return
            }

            finishDialogClose()
          }
        }}
        destroyOnHidden
      >
        <Checkbox checked={init} onChange={(event) => setInit(event.target.checked)}>
          init/flatMode
        </Checkbox>
      </Modal>

      <Modal
        open={open && dialogStep === 'run' && runDialogReady}
        title={mode ? `运行 ${mode.name}` : '运行'}
        width={1000}
        footer={null}
        onCancel={closeModal}
        afterOpenChange={(visible) => {
          if (!visible) {
            finishDialogClose()
          }
        }}
        destroyOnHidden
      >
        <Space
          direction="vertical"
          size={16}
          style={{
            width: '100%',
          }}
        >
          <div>
            <Typography.Text strong>Step 选择</Typography.Text>

            {steps.length ? (
              <StepSelector
                steps={steps}
                range={range}
                presets={VERIFICATION_STEP_PRESETS}
                onChange={setRange}
              />
            ) : (
              <Empty description="暂无 Step" />
            )}
          </div>

          <div>
            <Typography.Text strong>运行参数</Typography.Text>

            <Space.Compact block
              style={{ margin: '10px 0', width: '100%', maxWidth: 720 }}
            >
              <Select
                allowClear
                showSearch
                loading={stageConfigLoading}
                placeholder="选择已保存场景快速填充"
                value={selectedAlias}
                options={Object.keys(savedParams).map((alias) => ({
                  label: alias,
                  value: alias,
                }))}
                style={{ minWidth: 220, flex: 1 }}
                onClear={() => setSelectedAlias(undefined)}
                onChange={loadSavedParams}
              />
              <Input
                placeholder="输入场景别名"
                value={scenarioAlias}
                style={{ minWidth: 180, flex: 1 }}
                onChange={(event) => setScenarioAlias(event.target.value)}
                onPressEnter={() => void saveCurrentParams()}
              />
              <Button
                type="primary"
                loading={savingParams}
                onClick={() => void saveCurrentParams()}
              >
                保存
              </Button>
              <Popconfirm
                title={`删除场景“${selectedAlias ?? ''}”？`}
                disabled={!selectedAlias}
                onConfirm={() => void deleteSavedParams()}
              >
                <Button danger disabled={!selectedAlias} loading={savingParams}>
                  删除
                </Button>
              </Popconfirm>
              <Button disabled={savingParams} onClick={clearRunParams}>
                清除
              </Button>
            </Space.Compact>

            <ParamTable
              rows={rows}
              groups={groups}
              tcs={tcs}
              subattrs={subattrs}
              onChange={(nextRows) => setRows(nextRows.slice(0, 1))}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <Button onClick={closeModal}>取消</Button>

            <Button
              type="primary"
              disabled={!mode || !stepNames.length}
              onClick={confirm}
            >
              运行
            </Button>
          </div>
        </Space>
      </Modal>
    </>
  )
}
