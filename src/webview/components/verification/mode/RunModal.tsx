import { useEffect, useMemo, useState } from 'react'

import { Button, Empty, Input, Modal, Popconfirm, Select, Space, Spin, message, Typography } from 'antd'

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
import { useVerificationStageConfig } from './ModePanel/hooks/useVerificationStageConfig'

interface RunModalProps {
  open: boolean
  mode?: ModeConfigItem

  groups: BaseConfigItem[]
  tcs: BaseConfigItem[]
  subattrs: BaseConfigItem[]

  onCancel: () => void
  onRun: (payload: ModeRunPayload) => void

  getLanderModePipelines: GetLanderModePipelines
}

const createRunParamRow = (): RunParamRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  groupNames: [],
  tcNames: [],
  subattrNames: [],
  tools: [],
  donau: {},
})

const cloneRows = (rows: RunParamRow[]): RunParamRow[] => {
  return rows.map((row) => ({
    ...row,
    groupNames: [...row.groupNames],
    tcNames: [...row.tcNames],
    subattrNames: [...row.subattrNames],
    tools: row.tools.map((tool) => ({
      ...tool,
    })),
    donau: {
      ...row.donau,
    },
  }))
}

type SavedParams = Record<string, RunParamRow[]>

const readSavedParams = (value: unknown): SavedParams => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, rows]) => Array.isArray(rows)),
  ) as SavedParams
}

export default function RunModal({
  open,
  mode,
  groups,
  tcs,
  subattrs,
  onCancel,
  onRun,
  getLanderModePipelines,
}: RunModalProps) {
  const [loading, setLoading] = useState(false)

  const [steps, setSteps] = useState<LanderStep[]>([])

  const [range, setRange] = useState<[number, number]>([0, 0])

  const [rows, setRows] = useState<RunParamRow[]>([createRunParamRow()])
  const [scenarioAlias, setScenarioAlias] = useState('')
  const [selectedAlias, setSelectedAlias] = useState<string>()
  const [savedParams, setSavedParams] = useState<SavedParams>({})
  const [savingParams, setSavingParams] = useState(false)
  const { stageConfig, loading: stageConfigLoading, handleSave } =
    useVerificationStageConfig()

  useEffect(() => {
    if (open && mode) {
      setRows([createRunParamRow()])
      setScenarioAlias('')
      setSelectedAlias(undefined)
    }
  }, [open, mode?.name])

  useEffect(() => {
    if (!stageConfigLoading) {
      setSavedParams(readSavedParams(stageConfig?.params))
    }
  }, [stageConfig, stageConfigLoading])

  useEffect(() => {
    if (!open || !mode) {
      return
    }

    const preMode = mode.preMode.trim()

    if (!preMode) {
      setSteps([])
      message.error('当前 Mode 没有配置 preMode')
      return
    }

    let cancelled = false

    const loadSteps = async () => {
      setLoading(true)

      try {
        const result = await getLanderModePipelines(preMode)

        if (cancelled) {
          return
        }

        if (!result.success) {
          setSteps([])

          message.error(result.error ?? '读取流水线步骤失败')

          return
        }

        setSteps(result.steps)
        setRange(result.steps.length > 0 ? [0, result.steps.length - 1] : [0, 0])
      } catch (error) {
        if (cancelled) {
          return
        }

        setSteps([])

        message.error(
          error instanceof Error ? error.message : '读取流水线步骤失败',
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadSteps()

    return () => {
      cancelled = true
    }
  }, [open, mode?.preMode, getLanderModePipelines])

  const selectedSteps = useMemo(() => {
    return steps.slice(range[0], range[1] + 1)
  }, [steps, range])

  const stepNames = useMemo(() => {
    return selectedSteps.map((step) => step.name)
  }, [selectedSteps])

  const loadSavedParams = (alias: string) => {
    const savedRows = savedParams[alias]

    if (!savedRows) {
      return
    }

    setSelectedAlias(alias)
    setScenarioAlias(alias)
    setRows(cloneRows(savedRows))
  }

  const saveCurrentParams = async () => {
    const alias = scenarioAlias.trim()

    if (!alias) {
      message.warning('请输入场景别名')
      return
    }

    const nextParams = {
      ...savedParams,
      [alias]: cloneRows(rows),
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

  const confirm = () => {
    if (!mode) {
      return
    }

    if (!stepNames.length) {
      message.warning('请选择至少一个 Step')

      return
    }

    onRun({
      mode,
      preMode: mode.preMode,
      stepRange: range,
      stepNames,
      stepIds: selectedSteps.map((step) => step.id),
      steps: selectedSteps.map((step) => ({ ...step })),
      rows: cloneRows(rows),
    })
  }

  return (
    <Modal
      open={open}
      title={mode ? `运行 ${mode.name}` : '运行'}
      width={1000}
      footer={null}
      onCancel={onCancel}
    >
      {loading ? (
        <div
          style={{
            minHeight: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spin />
        </div>
      ) : (
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

            <Space.Compact block style={{ margin: '10px 0' }}>
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
                保存场景
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
            </Space.Compact>

            <ParamTable
              rows={rows}
              groups={groups}
              tcs={tcs}
              subattrs={subattrs}
              onChange={setRows}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <Button onClick={onCancel}>取消</Button>

            <Button
              type="primary"
              disabled={!mode || !stepNames.length}
              onClick={confirm}
            >
              运行
            </Button>
          </div>
        </Space>
      )}
    </Modal>
  )
}
