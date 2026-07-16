import { useMemo } from 'react'

import { Empty, List, Slider, Space, Tag, Typography } from 'antd'

import type { LanderStep } from './types'

const { Text } = Typography

interface StepSelectorProps {
  steps: LanderStep[]

  range: [number, number]

  onChange: (range: [number, number]) => void
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
  const maxIndex = Math.max(steps.length - 1, 0)

  const safeRange = useMemo(() => {
    return normalizeRange(range, maxIndex)
  }, [range, maxIndex])

  const selectedStepIds = useMemo(() => {
    if (!steps.length) {
      return []
    }

    return steps.slice(safeRange[0], safeRange[1] + 1).map((step) => step.id)
  }, [steps, safeRange])

  const selectedIdSet = useMemo(() => {
    return new Set(selectedStepIds)
  }, [selectedStepIds])

  const marks = useMemo(() => {
    if (!steps.length) {
      return {}
    }

    return steps.reduce<Record<number, string>>((acc, step, index) => {
      acc[index] = String(index + 1)
      return acc
    }, {})
  }, [steps])

  if (!steps.length) {
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Step" />
    )
  }

  return (
    <Space
      direction="vertical"
      size={10}
      style={{
        width: '100%',
      }}
    >
      <div>
        <Text strong>Step 范围</Text>

        <Text
          type="secondary"
          style={{
            marginLeft: 8,
          }}
        >
          已选 {selectedStepIds.length} 个 Step
        </Text>
      </div>

      <Slider
        range
        min={0}
        max={maxIndex}
        marks={marks}
        value={safeRange}
        tooltip={{
          formatter: (value) => {
            if (typeof value !== 'number') {
              return ''
            }

            return steps[value]?.name ?? String(value + 1)
          },
        }}
        onChange={(value) => {
          if (Array.isArray(value) && value.length === 2) {
            const nextRange: [number, number] = [value[0], value[1]]

            onChange(normalizeRange(nextRange, maxIndex))
          }
        }}
      />

      <List
        size="small"
        bordered
        dataSource={steps}
        style={{
          maxHeight: 360,
          overflow: 'auto',
        }}
        renderItem={(step, index) => {
          const selected = selectedIdSet.has(step.id)

          return (
            <List.Item
              style={{
                opacity: selected ? 1 : 0.55,

                background: selected
                  ? 'var(--vscode-list-inactiveSelectionBackground, transparent)'
                  : undefined,
              }}
            >
              <Space
                align="start"
                style={{
                  width: '100%',
                }}
              >
                <Tag>{index + 1}</Tag>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Space size={6} wrap>
                    <Text strong={selected}>{step.name}</Text>

                    {selected && <Tag>selected</Tag>}

                    {step.enableGroup && <Tag>Group</Tag>}

                    {step.enableTC && <Tag>TC</Tag>}

                    {step.enableSubAttr && <Tag>SubAttr</Tag>}
                  </Space>

                  <div>
                    <Text
                      type="secondary"
                      ellipsis={{
                        tooltip: step.command,
                      }}
                    >
                      {step.command}
                    </Text>
                  </div>

                  {step.description && (
                    <div>
                      <Text
                        type="secondary"
                        ellipsis={{
                          tooltip: step.description,
                        }}
                      >
                        {step.description}
                      </Text>
                    </div>
                  )}
                </div>
              </Space>
            </List.Item>
          )
        }}
      />
    </Space>
  )
}
