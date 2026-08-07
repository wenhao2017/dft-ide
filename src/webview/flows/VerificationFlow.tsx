import React, { useCallback, useState } from 'react'

import Step1CommonConfig from '../components/verification/Step1_CommonConfig'
import Step2ToolConfig from '../components/verification/Step2_ToolConfig'
import Step3Result from '../components/verification/Step3_Result'
import Step4Cloud from '../components/verification/Step4_Cloud'
import FlowShell from '../components/shared/FlowShell'

import ModePanel from '../components/verification/mode/ModePanel'

import type {
  ModePanelItem,
  ModePanelTab,
  ModeRunPayload,
} from '../components/verification/mode/types'
import { useVerificationStageConfig } from '../components/verification/mode/ModePanel/hooks/useVerificationStageConfig'
import usePipelineRuntimeStore from '../store/pipelineRuntimeStore'

const VerificationFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0)
  const [step2Tab, setStep2Tab] = useState<'environment' | 'execution'>('environment')
  const [selectedModule, setSelectedModule] = useState('')
  const [executionModuleKeys, setExecutionModuleKeys] = useState<string[]>([])
  const [moduleWorkDirs] = useState<Record<string, string>>({})
  const [defaultStepsByMode, setDefaultStepsByMode] = useState<Record<string, ModeRunPayload['steps']>>({})
  const [, setLastRunPayload] = useState<ModeRunPayload>()

  const startRuntime = usePipelineRuntimeStore((state) => state.startRuntime)
  const stopRuntime = usePipelineRuntimeStore((state) => state.stopRuntime)
  const { stage } = useVerificationStageConfig()
  const runtimeLabel = stage ? `Lander / ${stage}` : 'Lander'

  const nextStep = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 3))
  }

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0))
  }

  const handleSelect = (tab: ModePanelTab, item?: ModePanelItem) => {
    if (tab === 'mode') {
      setSelectedModule(item?.name ?? '')
    }
  }

  const handleCheckedChange = useCallback((tab: ModePanelTab, keys: string[]) => {
    if (tab === 'mode') {
      setExecutionModuleKeys(keys)
    }
  }, [])

  const handleRun = (payload: ModeRunPayload) => {
    setLastRunPayload(payload)
    setSelectedModule(payload.mode.name)
    setExecutionModuleKeys((current) => (
      current.includes(payload.mode.name) ? current : [...current, payload.mode.name]
    ))

    startRuntime(
      'verification',
      payload.mode.name,
      runtimeLabel,
      payload.stepIds,
      moduleWorkDirs[payload.mode.name],
      payload.steps,
      payload.rows,
    )
  }

  const handleStop = (keys: string[]) => {
    keys.filter(Boolean).forEach((moduleKey) => {
      stopRuntime('verification', moduleKey, runtimeLabel)
    })
  }

  const steps = [
    {
      title: '环境配置',
      description: '路径与模块',
      content: <Step1CommonConfig onNext={nextStep} />,
    },
    {
      title: '配置执行',
      description: '版本与资源',
      content: (
        <Step2ToolConfig
          moduleKey={selectedModule}
          onModuleSelect={setSelectedModule}
          onNext={nextStep}
          onPrev={prevStep}
          moduleKeys={executionModuleKeys}
          moduleWorkDirs={moduleWorkDirs}
          defaultStepsByModule={defaultStepsByMode}
          activeTab={step2Tab}
          onActiveTabChange={setStep2Tab}
        />
      ),
    },
    {
      title: '结果查看',
      description: '报告与日志',
      content: <Step3Result onNext={nextStep} onPrev={prevStep} />,
    },
    {
      title: '端云协同',
      description: '提交与归档',
      content: <Step4Cloud onPrev={prevStep} />,
    },
  ]

  return (
    <FlowShell
      accent="#059669"
      eyebrow="Verification Flow"
      title="验证任务闭环"
      description="围绕验证环境、工具配置、仿真执行与报告查看建立稳定闭环。"
      steps={steps}
      current={currentStep}
      onStepChange={setCurrentStep}
      sidebar={
        currentStep === 1 && step2Tab === 'execution' ? (
          <ModePanel
            key="execution-sidebar"
            accent="#059669"
            initialCollapsed={false}
            title="模式与参数配置"
            onSelect={handleSelect}
            onCheckedChange={handleCheckedChange}
            onDefaultStepsChange={setDefaultStepsByMode}
            onRun={handleRun}
            onStop={handleStop}
          />
        ) : undefined
      }
    />
  )
}

export default VerificationFlow
