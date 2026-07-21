import { useEffect, useState } from 'react'

import { Button, Input, Modal, Space, Typography, message } from 'antd'

import {
  FileTextOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons'

import type { ModePanelTab, ParsedCfgResult } from '../../types'

const { Text } = Typography

interface CreateModalProps {
  open: boolean

  tab: ModePanelTab

  parsing: boolean

  cfgResult?: ParsedCfgResult

  /**
   * 面板强调色。
   * 不传时使用 VSCode 默认焦点颜色。
   */
  accent?: string

  onCancel: () => void

  onSelectCfg: () => Promise<string | null>

  onConfirm: (name: string, cfgResult?: ParsedCfgResult) => void
}

const tabLabels: Partial<Record<ModePanelTab, string>> = {
  mode: 'Mode',
  group: 'Group',
  tc: 'TC',
  subattr: 'SubAttr',
}

export default function CreateModal({
  open,
  tab,
  parsing,
  cfgResult,
  accent = 'var(--vscode-focusBorder, #1677ff)',
  onCancel,
  onSelectCfg,
  onConfirm,
}: CreateModalProps) {
  const [name, setName] = useState('')

  const [selectedFileName, setSelectedFileName] = useState('')

  useEffect(() => {
    if (!open) {
      setName('')
      setSelectedFileName('')
    }
  }, [open])

  const isMode = tab === 'mode'

  const normalizedName = name.trim()

  const tabLabel = tabLabels[tab] ?? tab

  const handleConfirm = () => {
    if (!normalizedName || parsing) {
      return
    }

    onConfirm(normalizedName, cfgResult)
  }

  const handleSelectCfg = async () => {
    try {
      const fileName = await onSelectCfg()
      if (fileName) {
        setSelectedFileName(`${fileName}.cfg`)
        setName(fileName)
      }
    } catch (error) {
      setSelectedFileName('')
      message.error(error instanceof Error ? error.message : '选择配置文件失败')
    }
  }

  return (
    <Modal
      open={open}
      width={480}
      centered
      maskClosable={!parsing}
      keyboard={!parsing}
      confirmLoading={parsing}
      okText="创建"
      cancelText="取消"
      okButtonProps={{
        disabled: !normalizedName || parsing,
      }}
      title={
        <Space size={8}>
          <PlusOutlined
            style={{
              color: accent,
            }}
          />

          <span>新增 {tabLabel}</span>
        </Space>
      }
      onCancel={onCancel}
      onOk={handleConfirm}
      styles={{
        body: {
          paddingTop: 8,
        },
      }}
    >
      <Space
        direction="vertical"
        size={16}
        style={{
          width: '100%',
        }}
      >
        {!isMode && <div>
          <Text
            type="secondary"
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 12,
            }}
          >
            名称
          </Text>

          <Input
            autoFocus
            allowClear
            placeholder={`请输入 ${tabLabel} 名称`}
            value={name}
            disabled={parsing}
            onChange={(event) => {
              setName(event.target.value)
            }}
            onPressEnter={handleConfirm}
          />
        </div>}

        {isMode && (
          <div>
            <Text
              type="secondary"
              style={{
                display: 'block',
                marginBottom: 6,
                fontSize: 12,
              }}
            >
              Mode 配置文件
            </Text>

            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border:
                  '1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.22))',
                background:
                  'var(--vscode-sideBar-background, var(--vscode-editor-background))',
              }}
            >
              <Space
                direction="vertical"
                size={10}
                style={{
                  width: '100%',
                }}
              >
                <Button
                  icon={<UploadOutlined />}
                  loading={parsing}
                  disabled={parsing}
                  onClick={() => void handleSelectCfg()}
                >
                  {parsing ? '正在解析' : '选择 mode.cfg'}
                </Button>

                {selectedFileName && (
                  <Space
                    size={8}
                    style={{
                      minWidth: 0,
                    }}
                  >
                    <FileTextOutlined
                      style={{
                        color: accent,
                        flexShrink: 0,
                      }}
                    />

                    <Text
                      ellipsis={{
                        tooltip: selectedFileName,
                      }}
                      style={{
                        minWidth: 0,
                        fontSize: 12,
                      }}
                    >
                      {selectedFileName}
                    </Text>
                  </Space>
                )}

                {cfgResult?.preMode && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${accent}33`,
                      background: 'var(--vscode-editor-background)',
                    }}
                  >
                    <Space size={6}>
                      <Text
                        type="secondary"
                        style={{
                          fontSize: 12,
                        }}
                      >
                        解析到的 preMode：
                      </Text>

                      <Text
                        strong
                        style={{
                          color: accent,
                          fontSize: 12,
                          fontFamily:
                            'var(--vscode-editor-font-family, monospace)',
                        }}
                      >
                        {cfgResult.preMode}
                      </Text>
                    </Space>
                  </div>
                )}
              </Space>
            </div>
          </div>
        )}
      </Space>
    </Modal>
  )
}
