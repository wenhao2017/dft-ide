import { useEffect, useMemo, useState } from 'react'

import { FileSearchOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Form, Input, Select, Space, message } from 'antd'

import { getLanderModeConfigInfo } from '../../utils/ipc'
import useWizardStore from '../../store/wizardStore'
import { readResources } from './mode/ModePanel/resource'
import { useVerificationStageConfig } from './mode/ModePanel/hooks/useVerificationStageConfig'

const selectStyle = { width: 240 }

export default function ReportParsingPanel() {
  const { stage, stageConfig, loading } = useVerificationStageConfig()
  const activeProject = useWizardStore((state) => state.activeProject)
  const resources = useMemo(() => readResources(stageConfig), [stageConfig])
  const [mode, setMode] = useState<string>()
  const [tc, setTc] = useState<string>()
  const [tcNames, setTcNames] = useState<string[]>([])
  const [landerVersion, setLanderVersion] = useState('')
  const [atpgStage, setAtpgStage] = useState('')
  const [atpgMode, setAtpgMode] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  const modeOptions = useMemo(
    () => resources.mode.map((item) => ({ label: item.name, value: item.name })),
    [resources.mode],
  )
  const tcOptions = useMemo(
    () => tcNames.map((name) => ({ label: name, value: name })),
    [tcNames],
  )
  const runSimPath = useMemo(() => {
    const projectPath = activeProject?.rootPath?.trim().replace(/[\\/]+$/, '')
    const projectName = activeProject?.name.trim()
    if (!projectPath || !projectName || !stage) return ''

    return `${projectPath}/${projectName}_verification/${stage}/verification/work/03.run_sim`
  }, [activeProject?.name, activeProject?.rootPath, stage])

  const handleAnalyze = () => {
    message.info('分析脚本尚未接入')
  }

  useEffect(() => {
    if (mode && !resources.mode.some((item) => item.name === mode)) {
      setMode(undefined)
    }
    if (tc && !tcNames.includes(tc)) {
      setTc(undefined)
    }
  }, [mode, resources.mode, tc, tcNames])

  useEffect(() => {
    let disposed = false
    setAtpgStage('')
    setAtpgMode('')
    setTcNames([])
    setParseError('')

    if (!mode || !stage) {
      setParsing(false)
      return () => {
        disposed = true
      }
    }

    setParsing(true)
    void getLanderModeConfigInfo({ stage, modeName: mode }).then(
      (result) => {
        if (disposed) return
        if (result.success) {
          setAtpgStage(result.info.atpgStage)
          setAtpgMode(result.info.atpgMode)
          setTcNames(result.info.parameters?.tcs ?? [])
        } else {
          setParseError(result.error ?? 'Mode 配置解析失败')
        }
        setParsing(false)
      },
      (error) => {
        if (disposed) return
        setParseError(error instanceof Error ? error.message : String(error))
        setParsing(false)
      },
    )

    return () => {
      disposed = true
    }
  }, [mode, stage])

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Card size="small" title="参数选择">
        <Form layout="inline">
          <Form.Item label="配置文件" style={{ marginBottom: 8 }}>
            <Select
              allowClear
              showSearch
              loading={loading}
              optionFilterProp="label"
              options={modeOptions}
              placeholder="请选择 Mode"
              style={selectStyle}
              value={mode}
              onChange={setMode}
            />
          </Form.Item>
          <Form.Item label="sample" style={{ marginBottom: 8 }}>
            <Select
              allowClear
              showSearch
              loading={loading}
              optionFilterProp="label"
              options={tcOptions}
              placeholder="请选择 TC"
              style={selectStyle}
              value={tc}
              onChange={setTc}
            />
          </Form.Item>
          <Form.Item label="atpg_stage" style={{ marginBottom: 8 }}>
            <Input
              readOnly
              value={atpgStage}
              placeholder={mode ? (parsing ? '正在解析...' : '未配置') : '选择 Mode 后自动解析'}
              style={selectStyle}
            />
          </Form.Item>
          <Form.Item label="atpg_mode" style={{ marginBottom: 8 }}>
            <Input
              readOnly
              value={atpgMode}
              placeholder={mode ? (parsing ? '正在解析...' : '未配置') : '选择 Mode 后自动解析'}
              style={selectStyle}
            />
          </Form.Item>
          <Form.Item label="lander_version" style={{ marginBottom: 8 }}>
            <Input
              allowClear
              value={landerVersion}
              placeholder="选填"
              style={selectStyle}
              onChange={(event) => setLanderVersion(event.target.value)}
            />
          </Form.Item>
          <Form.Item label="run_sim_path" style={{ marginBottom: 8 }}>
            <Input
              readOnly
              value={runSimPath}
              style={{ width: 520 }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" onClick={handleAnalyze}>
              分析
            </Button>
          </Form.Item>
        </Form>
        {parseError && (
          <Alert showIcon type="error" message="Mode 配置解析失败" description={parseError} />
        )}
      </Card>

      <Empty
        image={<FileSearchOutlined style={{ fontSize: 48 }} />}
        description="功能预留，后续支持报告解析"
      />
    </Space>
  )
}
