import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { Button, Empty, message, Slider, Space, Tooltip } from 'antd'

export interface StepSelectorStep {
  id: string
  name: string
}

export type StepSelectorPresets = Record<string, string[]>

interface StepSelectorProps {
  steps: StepSelectorStep[]
  range: [number, number]
  onChange: (range: [number, number]) => void
  presets?: StepSelectorPresets
}

interface SliderMark {
  label: ReactNode
  style: CSSProperties
}

export const VERIFICATION_STEP_PRESETS: StepSelectorPresets = {
  Plan: ['gen_plan_env', 'release_plan', 'gen_atpg_setting', 'gen_pdl_env'],
  Env: [
    'gen_atpg_env_pre',
    'gen_atpg_env',
    'gen_crg_env',
    'run_crg_gen',
    'run_atpg',
    'gen_all_scan_env',
    'run_all_scan',
    'delivery_data',
  ],
  Sim: ['sed_3d_tb', 'gen_sim_env', 'run_sim'],
}

const normalizeRange = (
  range: [number, number],
  maxIndex: number,
): [number, number] => {
  const start = Math.max(0, Math.min(range[0], maxIndex))
  const end = Math.max(0, Math.min(range[1], maxIndex))
  return start <= end ? [start, end] : [end, start]
}

const findContinuousRange = (
  steps: StepSelectorStep[],
  names: string[],
): [number, number] | undefined => {
  if (!names.length) {
    return undefined
  }

  for (let start = 0; start <= steps.length - names.length; start++) {
    const matched = names.every(
      (name, offset) => steps[start + offset]?.name === name,
    )
    if (matched) {
      return [start, start + names.length - 1]
    }
  }

  return undefined
}

export default function StepSelector({
  steps,
  range,
  onChange,
  presets,
}: StepSelectorProps) {
  const maxIndex = Math.max(steps.length - 1, 0)
  const safeRange = useMemo(
    () => normalizeRange(range, maxIndex),
    [range, maxIndex],
  )

  const marks = useMemo(() => {
    return steps.reduce<Record<number, SliderMark>>((result, step, index) => {
      result[index] = {
        style: {
          cursor: 'help',
          pointerEvents: 'none',
        },
        label: (
          <Tooltip title={step.name} placement="top" mouseEnterDelay={0}>
            <span
              style={{
                position: 'relative',
                top: -14,
                display: 'inline-block',
                minWidth: 24,
                padding: '14px 4px 2px',
                lineHeight: '20px',
                cursor: 'help',
                pointerEvents: 'none',
              }}
            >
              {index + 1}
            </span>
          </Tooltip>
        ),
      }
      return result
    }, {})
  }, [steps])

  const applyPreset = (name: string, stepNames?: string[]) => {
    if (!stepNames?.length) {
      message.warning(`${name} 未配置 Step`)
      return
    }

    const result = findContinuousRange(steps, stepNames)
    if (!result) {
      message.warning(`${name} 预设不满足当前 Step 顺序`)
      return
    }

    onChange(result)
  }

  if (!steps.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Step" />
  }

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      {presets && (
        <Space wrap>
          {Object.entries(presets).map(([name, value]) => (
            <Button
              key={name}
              size="small"
              onClick={() => applyPreset(name, value)}
            >
              {name}
            </Button>
          ))}
        </Space>
      )}

      <Slider
        range={{ draggableTrack: true }}
        dots
        min={0}
        max={maxIndex}
        marks={marks}
        value={safeRange}
        tooltip={{
          formatter: (value) => {
            if (typeof value !== 'number') {
              return ''
            }
            return steps[value]?.name ?? ''
          },
        }}
        onChange={(value: number[]) => {
          if (Array.isArray(value) && value.length === 2) {
            onChange(normalizeRange([value[0], value[1]], maxIndex))
          }
        }}
      />
    </Space>
  )
}
