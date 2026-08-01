import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
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
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

import {
  buildCustomDsubCommand,
  type ClusterSubmissionConfig,
  type CustomClusterSubmissionConfig,
  type DsubAliasOption,
} from '../../../shared/clusterSubmission'
import { getDsubAliases } from '../../utils/ipc'
import DonauResourcePicker from './DonauResourcePicker'

const { Paragraph, Text, Title } = Typography

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
}

export default function ClusterSubmissionConfigEditor({
  value = EMPTY_ALIAS,
  onChange,
}: ClusterSubmissionConfigProps) {
  const { token } = theme.useToken()
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
        }
        .dft-cluster-config .cluster-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--cluster-border);
          background:
            radial-gradient(circle at 96% 0%, ${token.colorPrimaryBg} 0, transparent 36%),
            linear-gradient(145deg, ${token.colorBgContainer}, ${token.colorFillQuaternary});
        }
        .dft-cluster-config .cluster-hero::after {
          content: "";
          position: absolute;
          width: 180px;
          height: 180px;
          right: -90px;
          top: -105px;
          border: 24px solid ${token.colorPrimaryBorder};
          border-radius: 50%;
          opacity: .22;
          pointer-events: none;
        }
        .dft-cluster-config .cluster-mode {
          padding: 4px;
          border-radius: 12px;
          background: ${token.colorFillQuaternary};
        }
        .dft-cluster-config .cluster-mode .ant-segmented-item {
          min-height: 38px;
          display: grid;
          place-items: center;
          font-weight: 650;
        }
        .dft-cluster-config .cluster-editor {
          margin-top: 14px;
          border-color: var(--cluster-border);
          box-shadow: 0 10px 30px rgba(0, 0, 0, .06);
        }
        .dft-cluster-config .cluster-preview {
          margin-top: 14px;
          border: 1px solid ${token.colorPrimaryBorder};
          border-radius: 12px;
          background: ${token.colorBgElevated};
          box-shadow: 0 8px 22px rgba(0, 0, 0, .10);
          overflow: hidden;
        }
        .dft-cluster-config .cluster-preview-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 13px;
          border-bottom: 1px solid ${token.colorPrimaryBorder};
          background: ${token.colorPrimaryBg};
        }
        .dft-cluster-config .cluster-command {
          min-height: 56px;
          margin: 0;
          padding: 16px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Consolas, monospace);
          font-size: 12px;
          font-weight: 550;
          line-height: 1.7;
          color: ${token.colorBgBase};
          background: ${token.colorText};
          box-shadow: inset 4px 0 0 ${token.colorPrimary};
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

      <Card className="cluster-hero" styles={{ body: { padding: 16 } }}>
        <Space direction="vertical" size={4} style={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <Space size={8} align="center">
            <CloudServerOutlined style={{ color: token.colorPrimary, fontSize: 19 }} />
            <Title level={5} style={{ margin: 0, fontSize: 16 }}>Donau集群提交策略</Title>
          </Space>
          <Paragraph type="secondary" style={{ margin: 0, maxWidth: 760 }}>
            使用个人 csh Alias，或独立选择 Donau 资源。两种方式都会生成完整命令，
            并通过 <Text code>DFT_IDE_DSUBRUN_I</Text> 下发给 run_flow。
          </Paragraph>
        </Space>
      </Card>

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

      <Card className="cluster-editor" styles={{ body: { padding: 16 } }}>
        {value.mode === 'alias' ? (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <Text strong>从 ~/.cshrc 选择 dsub Alias</Text>
                <div><Text type="secondary">IDE只加载定义中包含独立 dsub 命令的 Alias。</Text></div>
              </div>
              <Tooltip title="重新读取当前运行环境中的 ~/.cshrc">
                <Button
                  icon={<ReloadOutlined />}
                  loading={loadingAliases}
                  onClick={() => void loadAliases(true)}
                >
                  刷新 Alias
                </Button>
              </Tooltip>
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
              <ThunderboltOutlined style={{ color: token.colorPrimary }} />
              <Text strong>最终命令预览</Text>
            </Space>
            <Space size={6}>
              <Tag color="processing">DFT_IDE_DSUBRUN_I</Tag>
              {!validation && preview ? (
                <Tag icon={<CheckCircleFilled />} color="success">可以运行</Tag>
              ) : null}
            </Space>
          </div>
          <pre className="cluster-command">
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
      </Card>
    </section>
  )
}
