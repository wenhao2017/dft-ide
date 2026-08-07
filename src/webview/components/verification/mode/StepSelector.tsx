import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { Empty, Slider, Tooltip } from 'antd'

export interface StepSelectorStep {
  id: string
  name: string
}

interface StepSelectorProps {
  steps: StepSelectorStep[]
  range: [number, number]
  onChange: (range: [number, number]) => void
}

interface SliderMark {
  label: ReactNode
  style: CSSProperties
}

const normalizeRange = (
  range: [number, number],
  maxIndex: number,
): [number, number] => {
  const start = Math.max(0, Math.min(range[0], maxIndex))
  const end = Math.max(0, Math.min(range[1], maxIndex))
  return start <= end ? [start, end] : [end, start]
}

export default function StepSelector({
  steps,
  range,
  onChange,
}: StepSelectorProps) {
  const [hoveredStepIndex, setHoveredStepIndex] = useState<number>()
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
          <Tooltip
            title={step.name}
            placement="top"
            open={hoveredStepIndex === index}
          >
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
  }, [hoveredStepIndex, steps])

  if (!steps.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Step" />
  }

  return (
    <div
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        const stepWidth = maxIndex > 0 ? bounds.width / maxIndex : bounds.width
        const nearestIndex = maxIndex > 0
          ? Math.round((event.clientX - bounds.left) / stepWidth)
          : 0
        const nodeX = bounds.left + nearestIndex * stepWidth
        const nextIndex = Math.abs(event.clientX - nodeX) <= 14
          ? Math.max(0, Math.min(nearestIndex, maxIndex))
          : undefined

        setHoveredStepIndex((current) => current === nextIndex ? current : nextIndex)
      }}
      onPointerLeave={() => setHoveredStepIndex(undefined)}
    >
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
    </div>
  )
}
