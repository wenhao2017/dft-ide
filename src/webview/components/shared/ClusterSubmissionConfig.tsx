import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Col,
  Empty,
  Input,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd'
import {
  CheckCircleFilled,
  CloudServerOutlined,
  CodeOutlined,
  EditOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

import {
  buildCustomDsubCommand,
  type ClusterSubmissionConfig,
  type CustomClusterSubmissionConfig,
  type DsubAliasOption,
} from '../../../shared/clusterSubmission'
import { getDsubAliases, openUserCshrc } from '../../utils/ipc'
import DonauResourcePicker from './DonauResourcePicker'
import FlowConfigSection from './FlowConfigSection'

const { Text } = Typography

const EMPTY_ALIAS: ClusterSubmissionConfig = {
  mode: 'alias',
  aliasName: '',
}

const EMPTY_CUSTOM: CustomClusterSubmissionConfig = {
  mode: 'custom',
  group: '',
  queue: '',
  cpu: '',
  memory: '',
  extraArgs: '',
}

export interface ClusterSubmissionConfigProps {
  value?: ClusterSubmissionConfig
  onChange?: (value: ClusterSubmissionConfig) => void
  accent?: string
}

export default function ClusterSubmissionConfigEditor({
  value = EMPTY_ALIAS,
  onChange,
  accent,
}: ClusterSubmissionConfigProps) {
  const { token } = theme.useToken()
  const sectionAccent = accent ?? token.colorPrimary
  const [aliases, setAliases] = useState<DsubAliasOption[]>([])
  const [loadingAliases, setLoadingAliases] = useState(false)
  const [lastAliasName, setLastAliasName] = useState(
    value.mode === 'alias' ? value.aliasName : '',
  )
  const [lastCustom, setLastCustom] = useState<CustomClusterSubmissionConfig>(
    value.mode === 'custom' ? value : EMPTY_CUSTOM,
  )

  const loadAliases = async (showSuccess = false) => {
    setLoadingAliases(true)
    try {
      const nextAliases = await getDsubAliases()
      setAliases(nextAliases)
      if (showSuccess) {
        message.success(`已加载 ${nextAliases.length} 个 dsub Alias`)
      }
    } catch {
      setAliases([])
    } finally {
      setLoadingAliases(false)
    }
  }

  useEffect(() => {
    void loadAliases()
  }, [])

  useEffect(() => {
    const handleCshrcSaved = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown>
      if (data?.command === 'dsubAliasesChanged') {
        void loadAliases(true)
      }
    }
    window.addEventListener('message', handleCshrcSaved)
    return () => window.removeEventListener('message', handleCshrcSaved)
  }, [])

  useEffect(() => {
    if (value.mode === 'alias') setLastAliasName(value.aliasName)
    else setLastCustom(value)
  }, [value])

  const selectedAlias = value.mode === 'alias'
    ? aliases.find((alias) => alias.name === value.aliasName)
    : undefined

  const preview = useMemo(() => {
    if (value.mode === 'alias') {
      return selectedAlias?.command ?? ''
    }
    try {
      return buildCustomDsubCommand(value).command
    } catch {
      return ''
    }
  }, [selectedAlias, value])

  const validation = useMemo(() => {
    if (value.mode === 'alias') {
      if (!value.aliasName) return '请选择一个包含 dsub 的用户 Alias。'
      if (!selectedAlias && !loadingAliases) return '当前 Alias 不存在，请刷新后重新选择。'
      return undefined
    }
    if (!value.group.trim()) return '请选择或填写 Donau 用户组。'
    if (!value.queue.trim()) return '请选择或填写 Donau 队列。'
    try {
      buildCustomDsubCommand(value)
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, [loadingAliases, selectedAlias, value])

  const switchMode = (mode: 'alias' | 'custom') => {
    if (mode === 'alias') {
      onChange?.({ mode: 'alias', aliasName: lastAliasName })
    } else {
      onChange?.(lastCustom)
    }
  }

  const updateCustom = (patch: Partial<CustomClusterSubmissionConfig>) => {
    const current = value.mode === 'custom' ? value : lastCustom
    const next = { ...current, ...patch }
    setLastCustom(next)
    onChange?.(next)
  }

  return (
    <section className="dft-cluster-config">
      <style>{`
        .dft-cluster-config {
          --cluster-border: ${token.colorBorderSecondary};
          --cluster-surface: ${token.colorBgContainer};
          --cluster-soft: ${token.colorFillQuaternary};
          width: 100%;
        }
        .dft-cluster-config .cluster-mode {
          padding: 4px;
          border-radius: 10px;
          background: color-mix(in srgb, ${sectionAccent} 7%, ${token.colorBgContainer});
        }
        .dft-cluster-config .cluster-mode .ant-segmented-item {
          min-height: 38px;
          display: grid;
          place-items: center;
          font-weight: 650;
        }
        .dft-cluster-config .cluster-editor {
          margin-top: 14px;
          padding: 16px;
          border: 1px solid var(--cluster-border);
          border-radius: 10px;
          background: color-mix(in srgb, ${sectionAccent} 3%, ${token.colorBgContainer});
        }
        .dft-cluster-config .cluster-preview {
          margin-top: 14px;
          border: 1px solid ${token.colorBorderSecondary};
          border-radius: 10px;
          background: var(--vscode-textCodeBlock-background, ${token.colorFillQuaternary});
          overflow: hidden;
        }
        .dft-cluster-config .cluster-preview-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 12px;
          border-bottom: 1px solid ${token.colorBorderSecondary};
          background: ${token.colorFillQuaternary};
        }
        .dft-cluster-config .terminal-lights {
          display: inline-flex;
          gap: 5px;
        }
        .dft-cluster-config .terminal-light {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: ${token.colorBorder};
        }
        .dft-cluster-config .terminal-light:first-child {
          background: ${token.colorError};
        }
        .dft-cluster-config .terminal-light:nth-child(2) {
          background: ${token.colorWarning};
        }
        .dft-cluster-config .terminal-light:nth-child(3) {
          background: ${token.colorSuccess};
        }
        .dft-cluster-config .cluster-command {
          min-height: 56px;
          margin: 0;
          padding: 16px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Consolas, monospace);
          font-size: 12px;
          font-weight: 500;
          line-height: 1.7;
          color: var(--vscode-editor-foreground, ${token.colorText});
          background: var(--vscode-textCodeBlock-background, color-mix(in srgb, ${token.colorText} 5%, ${token.colorBgContainer}));
        }
        .dft-cluster-config .cluster-command.is-placeholder {
          color: ${token.colorTextSecondary};
          font-family: var(--vscode-font-family, sans-serif);
          font-weight: 400;
        }
        .dft-cluster-config .alias-option {
          display: grid;
          gap: 2px;
          min-width: 0;
          padding: 3px 0;
        }
        .dft-cluster-config .alias-option-command {
          overflow: hidden;
          color: ${token.colorTextSecondary};
          font-family: var(--vscode-editor-font-family, monospace);
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      <FlowConfigSection
        index="02"
        icon={<CloudServerOutlined />}
        title="Donau集群提交策略"
        description="运行流水线前需选择个人 csh Alias，或独立配置 Donau 资源。"
        accent={sectionAccent}
        defaultExpanded
      >
        <Segmented
          block
          className="cluster-mode"
          value={value.mode}
          onChange={(mode) => switchMode(mode as 'alias' | 'custom')}
          options={[
            {
              value: 'alias',
              label: <Space><CodeOutlined />使用个人 Alias</Space>,
            },
            {
              value: 'custom',
              label: <Space><CloudServerOutlined />独立配置集群</Space>,
            },
          ]}
        />

        <div className="cluster-editor">
        {value.mode === 'alias' ? (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <Text strong>从 ~/.cshrc 选择 dsub Alias</Text>
                <div><Text type="secondary">IDE只加载定义中包含独立 dsub 命令的 Alias。</Text></div>
              </div>
              <Space size={8}>
                <Tooltip title="在 VS Code 中编辑当前用户的 ~/.cshrc，保存后自动刷新 Alias">
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => {
                      void openUserCshrc().catch((error) => {
                        message.error(error instanceof Error ? error.message : String(error))
                      })
                    }}
                  >
                    编辑 ~/.cshrc
                  </Button>
                </Tooltip>
                <Tooltip title="重新读取当前运行环境中的 ~/.cshrc">
                  <Button
                    icon={<ReloadOutlined />}
                    loading={loadingAliases}
                    onClick={() => void loadAliases(true)}
                  >
                    刷新 Alias
                  </Button>
                </Tooltip>
              </Space>
            </div>

            {loadingAliases && aliases.length === 0 ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : (
              <Select
                showSearch
                allowClear
                style={{ width: '100%' }}
                value={value.aliasName || undefined}
                placeholder="选择个人 dsub Alias"
                optionFilterProp="searchText"
                notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有发现可用的 dsub Alias" />}
                options={aliases.map((alias) => ({
                  value: alias.name,
                  searchText: `${alias.name} ${alias.command}`,
                  label: (
                    <div className="alias-option">
                      <Text strong>{alias.name}</Text>
                      <div className="alias-option-command">{alias.command}</div>
                    </div>
                  ),
                }))}
                onChange={(aliasName = '') => {
                  setLastAliasName(aliasName)
                  onChange?.({ mode: 'alias', aliasName })
                }}
              />
            )}

          </Space>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <Text strong>独立 Donau 配置</Text>
                <div><Text type="secondary">选择 Account 和 Queue，并按需设置资源及扩展参数。</Text></div>
              </div>
              <div style={{ minWidth: 180 }}>
                <DonauResourcePicker
                  account={value.group}
                  queue={value.queue}
                  onChange={({ account, queue }) => updateCustom({ group: account, queue })}
                />
              </div>
            </div>

            <Row gutter={[12, 12]}>
              <Col xs={24} lg={14}>
                <Text type="secondary">用户组 / Account</Text>
                <Input
                  value={value.group}
                  placeholder="例如 root.ug_dft..."
                  onChange={(event) => updateCustom({ group: event.target.value })}
                />
              </Col>
              <Col xs={24} lg={10}>
                <Text type="secondary">队列 / Queue</Text>
                <Input
                  value={value.queue}
                  placeholder="例如 normal、bigmem"
                  onChange={(event) => updateCustom({ queue: event.target.value })}
                />
              </Col>
              <Col xs={12} lg={6}>
                <Text type="secondary">CPU</Text>
                <Input
                  value={value.cpu}
                  placeholder="1"
                  onChange={(event) => updateCustom({ cpu: event.target.value })}
                />
              </Col>
              <Col xs={12} lg={6}>
                <Text type="secondary">内存 / MB</Text>
                <Input
                  value={value.memory}
                  placeholder="20000"
                  onChange={(event) => updateCustom({ memory: event.target.value })}
                />
              </Col>
              <Col xs={24} lg={12}>
                <Text type="secondary">其他参数</Text>
                <Input
                  value={value.extraArgs}
                  placeholder="-FR 'Design-Compiler'"
                  onChange={(event) => updateCustom({ extraArgs: event.target.value })}
                />
              </Col>
            </Row>
          </Space>
        )}

        <div className="cluster-preview">
          <div className="cluster-preview-bar">
            <Space size={8}>
              <span className="terminal-lights" aria-hidden="true">
                <i className="terminal-light" />
                <i className="terminal-light" />
                <i className="terminal-light" />
              </span>
              <ThunderboltOutlined style={{ color: sectionAccent }} />
              <Text strong>最终命令预览</Text>
            </Space>
            <Space size={6}>
              <Tag color="processing">DFT_IDE_DSUBRUN_I</Tag>
              {!validation && preview ? (
                <Tag icon={<CheckCircleFilled />} color="success">可以运行</Tag>
              ) : null}
            </Space>
          </div>
          <pre className={`cluster-command${preview ? '' : ' is-placeholder'}`}>
            {preview || '完成上方配置后，这里将显示最终的 dsub -I 命令。'}
          </pre>
        </div>

        {validation ? (
          <Alert
            style={{ marginTop: 12 }}
            showIcon
            type="info"
            message={validation}
          />
        ) : null}
        </div>
      </FlowConfigSection>
    </section>
  )
}
