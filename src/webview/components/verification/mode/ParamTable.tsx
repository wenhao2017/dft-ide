import { useState } from 'react'

import { Button, Space, Table } from 'antd'

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'

import type { ColumnsType } from 'antd/es/table'

import type { BaseConfigItem, RunParamRow, SelectorField } from './types'

import SelectorModal from './SelectorModal'
import ToolsModal from './ToolsModal'
import DonauModal from './DonauModal'

interface ParamTableProps {
  rows: RunParamRow[]

  groups: BaseConfigItem[]
  tcs: BaseConfigItem[]
  subattrs: BaseConfigItem[]

  onChange: (rows: RunParamRow[]) => void
}

const createRunParamRow = (): RunParamRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  groupNames: [],
  tcNames: [],
  subattrNames: [],
  tools: [],
  donau: {},
})

const FIELD_LABELS: Record<SelectorField, string> = {
  groupNames: 'Group',
  tcNames: 'TC',
  subattrNames: 'SubAttr',
}

export default function ParamTable({
  rows,
  groups,
  tcs,
  subattrs,
  onChange,
}: ParamTableProps) {
  const [selector, setSelector] = useState<{
    rowId: string
    field: SelectorField
  }>()

  const [toolsRowId, setToolsRowId] = useState<string>()

  const [donauRowId, setDonauRowId] = useState<string>()

  const updateRow = (rowId: string, patch: Partial<RunParamRow>) => {
    onChange(
      rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              ...patch,
            }
          : row,
      ),
    )
  }

  const addRow = () => {
    if (rows.length >= 1) {
      return
    }
    onChange([...rows, createRunParamRow()])
  }

  const deleteRow = (rowId: string) => {
    onChange(rows.filter((row) => row.id !== rowId))
  }

  const openSelector = (rowId: string, field: SelectorField) => {
    setSelector({
      rowId,
      field,
    })
  }

  const getSelectorItems = (field: SelectorField): BaseConfigItem[] => {
    if (field === 'groupNames') {
      return groups
    }

    if (field === 'tcNames') {
      return tcs
    }

    return subattrs
  }

  const selectedRow = selector
    ? rows.find((row) => row.id === selector.rowId)
    : undefined

  const toolsRow = toolsRowId
    ? rows.find((row) => row.id === toolsRowId)
    : undefined

  const donauRow = donauRowId
    ? rows.find((row) => row.id === donauRowId)
    : undefined

  const columns: ColumnsType<RunParamRow> = [
    {
      title: 'Group',
      dataIndex: 'groupNames',
      width: 120,
      render: (_, row) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={() => openSelector(row.id, 'groupNames')}
        >
          {row.groupNames.length}
        </Button>
      ),
    },

    {
      title: 'TC',
      dataIndex: 'tcNames',
      width: 120,
      render: (_, row) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={() => openSelector(row.id, 'tcNames')}
        >
          {row.tcNames.length}
        </Button>
      ),
    },

    {
      title: 'SubAttr',
      dataIndex: 'subattrNames',
      width: 130,
      render: (_, row) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={() => openSelector(row.id, 'subattrNames')}
        >
          {row.subattrNames.length}
        </Button>
      ),
    },

    {
      title: 'Tools',
      dataIndex: 'tools',
      width: 120,
      render: (_, row) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={() => setToolsRowId(row.id)}
        >
          {row.tools.length}
        </Button>
      ),
    },

    {
      title: 'Donau',
      dataIndex: 'donau',
      width: 120,
      render: (_, row) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={() => setDonauRowId(row.id)}
        >
          编辑
        </Button>
      ),
    },

    {
      title: '',
      width: 56,
      render: (_, row) => (
        <Button
          danger
          type="text"
          disabled={rows.length <= 1}
          icon={<DeleteOutlined />}
          onClick={() => deleteRow(row.id)}
        />
      ),
    },
  ]

  return (
    <>
      <Space
        direction="vertical"
        size={10}
        style={{
          width: '100%',
        }}
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={columns}
        />

        {rows.length === 0 && (
          <Button block icon={<PlusOutlined />} onClick={addRow}>
            添加参数
          </Button>
        )}
      </Space>

      {selector && (
        <SelectorModal
          open
          title={`选择 ${FIELD_LABELS[selector.field]}`}
          items={getSelectorItems(selector.field)}
          value={selectedRow?.[selector.field] ?? []}
          onCancel={() => setSelector(undefined)}
          onOk={(names) => {
            const patch: Partial<RunParamRow> = {
              [selector.field]: names,
            }

            updateRow(selector.rowId, patch)

            setSelector(undefined)
          }}
        />
      )}

      {toolsRowId && (
        <ToolsModal
          open
          tools={toolsRow?.tools ?? []}
          onCancel={() => setToolsRowId(undefined)}
          onChange={(tools) => {
            updateRow(toolsRowId, {
              tools,
            })
          }}
        />
      )}

      {donauRowId && (
        <DonauModal
          open
          value={donauRow?.donau ?? {}}
          onCancel={() => setDonauRowId(undefined)}
          onChange={(donau) => {
            updateRow(donauRowId, {
              donau,
            })
          }}
        />
      )}
    </>
  )
}
