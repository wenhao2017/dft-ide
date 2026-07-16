import { useEffect, useMemo, useState } from 'react'

import { Button, Empty, Modal, Space, Spin, message, Typography } from 'antd'

import type {
  BaseConfigItem,
  GetLanderModePipelines,
  LanderStep,
  ModeConfigItem,
  ModeRunPayload,
  RunParamRow,
} from './types'

import StepSelector from './StepSelector'
import ParamTable from './ParamTable'

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

  const stepNames = useMemo(() => {
    return steps.slice(range[0], range[1] + 1).map((step) => step.name)
  }, [steps, range])

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
              <StepSelector steps={steps} range={range} onChange={setRange} />
            ) : (
              <Empty description="暂无 Step" />
            )}
          </div>

          <div>
            <Typography.Text strong>运行参数</Typography.Text>

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
