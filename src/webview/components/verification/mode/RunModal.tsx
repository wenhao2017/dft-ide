import { useEffect, useMemo, useRef, useState } from 'react'

import { Button, Descriptions, Empty, Input, Modal, Popconfirm, Select, Space, Spin, Tag, message, Typography } from 'antd'
import { EyeOutlined } from '@ant-design/icons'

import type {
  GetLanderModePipelines,
  LanderModeParameters,
  LanderStep,
  ModeConfigItem,
  ModeRunPayload,
  RunParamRow,
} from './types'

import StepSelector from './StepSelector'
import ParamTable from './ParamTable'
import { readSavedParams, type SavedParams } from './savedParamUtils'

interface RunModalProps {
  open: boolean
  mode?: ModeConfigItem
  stage?: string

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

const renderNames = (names: string[]) => names.length > 0
  ? (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      <Typography.Text type="secondary">已选 {names.length} 项</Typography.Text>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          maxHeight: 120,
          overflowY: 'auto',
          padding: 6,
          border: '1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.2))',
          borderRadius: 4,
          background: 'var(--vscode-editor-background, rgba(127, 127, 127, 0.04))',
        }}
      >
        {names.map((name) => (
          <Tag
            key={name}
            title={name}
            style={{
              maxWidth: '100%',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </Tag>
        ))}
      </div>
    </Space>
  )
  : <Typography.Text type="secondary">未选择</Typography.Text>

export default function RunModal({
  open,
  mode,
  stage,
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
  // Keep this non-interactive until Lander exposes a source such as mode.cfg.
  const init = false

  const [loadedSteps, setLoadedSteps] = useState<{
    optionsKey: string
    steps: LanderStep[]
    parameters: LanderModeParameters
  }>()

  const [range, setRange] = useState<[number, number]>([0, 0])

  const [rows, setRows] = useState<RunParamRow[]>([createRunParamRow()])
  const [scenarioAlias, setScenarioAlias] = useState('')
  const [selectedAlias, setSelectedAlias] = useState<string>()
  const [previewAlias, setPreviewAlias] = useState<string>()
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
      setPreviewAlias(undefined)
    }
  }, [open, mode?.name, stage])

  useEffect(() => {
    if (!stageConfigLoading) {
      setSavedParams(readSavedParams(stageConfig?.params))
    }
  }, [stageConfig, stageConfigLoading])

  const optionsKey = mode && stage ? `${stage}\u0000${mode.name}\u0000${init}` : ''
  const steps = loadedSteps?.optionsKey === optionsKey ? loadedSteps.steps : []
  const parameters = loadedSteps?.optionsKey === optionsKey
    ? loadedSteps.parameters
    : { groups: [], tcs: [], subattrs: [] }
  const runDialogReady = loadedSteps?.optionsKey === optionsKey
  const previewRow = previewAlias ? savedParams[previewAlias] : undefined

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

      setLoadedSteps({
        optionsKey: requestedOptionsKey,
        steps: result.steps,
        parameters: result.parameters ?? { groups: [], tcs: [], subattrs: [] },
      })
      setRange(result.steps.length > 0 ? [0, result.steps.length - 1] : [0, 0])
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

  useEffect(() => {
    if (open && mode) {
      void confirmRunOptions()
    }
    // The request is intentionally keyed only by the selected mode and stage.
    // init is fixed to false until it has a non-interactive source such as CFG.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode?.name, stage])

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
        setPreviewAlias(undefined)
        setScenarioAlias('')
      }
    } finally {
      setSavingParams(false)
    }
  }

  const clearRunParams = () => {
    setRows([createRunParamRow()])
    setSelectedAlias(undefined)
    setPreviewAlias(undefined)
    setScenarioAlias('')
  }

  const closeModal = () => {
    loadRequestRef.current += 1
    onCancel()
  }

  const resetSession = () => {
    setLoading(false)
    setLoadedSteps(undefined)
    setRange([0, 0])
    setRows([createRunParamRow()])
    setScenarioAlias('')
    setSelectedAlias(undefined)
    setPreviewAlias(undefined)
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
    <Modal
        open={open}
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

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <Spin />
              </div>
            ) : steps.length ? (
              <StepSelector
                steps={steps}
                range={range}
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
                disabled={!selectedAlias || !savedParams[selectedAlias]}
                onClick={() => setPreviewAlias(selectedAlias)}
              >
                预览
              </Button>
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
              groups={parameters.groups.map((name) => ({ name }))}
              tcs={parameters.tcs.map((name) => ({ name }))}
              subattrs={parameters.subattrs.map((name) => ({ name }))}
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

        <Modal
          open={Boolean(previewAlias && previewRow)}
          title={previewAlias ? `场景预览：${previewAlias}` : '场景预览'}
          width={720}
          footer={null}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          onCancel={() => setPreviewAlias(undefined)}
        >
          {previewRow && (
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Group">
                {renderNames(previewRow.groupNames)}
              </Descriptions.Item>
              <Descriptions.Item label="TC">
                {renderNames(previewRow.tcNames)}
              </Descriptions.Item>
              <Descriptions.Item label="SubAttr">
                {renderNames(previewRow.subattrNames)}
              </Descriptions.Item>
              <Descriptions.Item label="Extra Arg">
                {previewRow.extraArg || <Typography.Text type="secondary">未配置</Typography.Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Tools">
                {previewRow.tools.length > 0
                  ? (
                    <Space direction="vertical" size={4}>
                      {previewRow.tools.map((tool) => (
                        <Typography.Text key={tool.id}>
                          {tool.name}: {tool.type === 'version' ? tool.version : tool.path}
                        </Typography.Text>
                      ))}
                    </Space>
                  )
                  : <Typography.Text type="secondary">未配置</Typography.Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Donau">
                {Object.entries(previewRow.donau)
                  .filter(([, value]) => Boolean(value))
                  .map(([key, value]) => `${key}: ${value}`)
                  .join('，') || <Typography.Text type="secondary">未配置</Typography.Text>}
              </Descriptions.Item>
            </Descriptions>
          )}
        </Modal>
    </Modal>
  )
}
