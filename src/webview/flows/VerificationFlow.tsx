import React, { useCallback, useRef, useState } from 'react'

import Step1CommonConfig from '../components/verification/Step1_CommonConfig'
import Step2ToolConfig, {
  PipelineExecutionRef,
} from '../components/verification/Step2_ToolConfig'
import Step3Result from '../components/verification/Step3_Result'
import Step4Cloud from '../components/verification/Step4_Cloud'
import FlowShell from '../components/shared/FlowShell'

import ModePanel from '../components/verification/mode/ModePanel'

import type {
  ModePanelItem,
  ModePanelTab,
  ModeRunPayload,
} from '../components/verification/mode/types'

const VerificationFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedModule, setSelectedModule] = useState('')
  const [executionModuleKeys, setExecutionModuleKeys] = useState<string[]>([])
  const [moduleWorkDirs] = useState<Record<string, string>>({})
  const [defaultStepsByMode, setDefaultStepsByMode] = useState<Record<string, ModeRunPayload['steps']>>({})
  const [, setLastRunPayload] = useState<ModeRunPayload>()

  const executionRef = useRef<PipelineExecutionRef>(null)
  const pendingRunRef = useRef<ModeRunPayload | undefined>(undefined)

  const setExecutionRef = useCallback((instance: PipelineExecutionRef | null) => {
    executionRef.current = instance

    if (instance && pendingRunRef.current) {
      const payload = pendingRunRef.current
      pendingRunRef.current = undefined
      instance.handleExternalRun([payload.mode.name], payload.stepIds, payload.steps, payload.rows)
    }
  }, [])

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

    if (executionRef.current) {
      executionRef.current.handleExternalRun([payload.mode.name], payload.stepIds, payload.steps, payload.rows)
    } else {
      pendingRunRef.current = payload
      setCurrentStep(1)
    }
  }

  const handleStop = (keys: string[]) => {
    executionRef.current?.handleExternalStop(keys)
  }

  const steps = [
    {
      title: '公共配置',
      description: '环境与出口',
      content: <Step1CommonConfig onNext={nextStep} />,
    },
    {
      title: '工具配置',
      description: '仿真工具链',
      content: (
        <Step2ToolConfig
          ref={setExecutionRef}
          moduleKey={selectedModule}
          onModuleSelect={setSelectedModule}
          onNext={nextStep}
          onPrev={prevStep}
          moduleKeys={executionModuleKeys}
          moduleWorkDirs={moduleWorkDirs}
          defaultStepsByModule={defaultStepsByMode}
        />
      ),
    },
    {
      title: '结果页',
      description: '日志与报告',
      content: <Step3Result onNext={nextStep} onPrev={prevStep} />,
    },
    {
      title: '端云协同',
      description: '共享与复用',
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
        currentStep !== 0 ? (
          <ModePanel
            accent="#059669"
            initialTab="mode"
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
