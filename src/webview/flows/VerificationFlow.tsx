import React, { useRef, useState } from 'react';
import Step1CommonConfig from '../components/verification/Step1_CommonConfig';
import Step2ToolConfig, { PipelineExecutionRef } from '../components/verification/Step2_ToolConfig';
import Step4Result from '../components/verification/Step4_Result';
import FlowShell from '../components/shared/FlowShell';
import DesignTreePanel from '../components/shared/DesignTreePanel';
import Step5Cloud from '../components/verification/Step5_Cloud';

const VerificationFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedModule, setSelectedModule] = useState('');
  const [executionModuleKeys, setExecutionModuleKeys] = useState<string[]>([]);
  const [moduleWorkDirs, setModuleWorkDirs] = useState<Record<string, string>>({});

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const executionRef = useRef<PipelineExecutionRef>(null);

  const handleTreeRun = (keys: string[]) => {
    executionRef.current?.handleExternalRun(keys);
  };

  const handleTreeStop = (keys: string[]) => {
    executionRef.current?.handleExternalStop(keys);
  };

  const steps = [
    { title: '公共配置', description: '环境与出口', content: <Step1CommonConfig onNext={nextStep} /> },
    { title: '工具配置', description: '仿真工具链', content: <Step2ToolConfig
      ref={executionRef}
      moduleKey={selectedModule}
      onModuleSelect={setSelectedModule}
      onNext={nextStep}
      onPrev={prevStep}
      moduleKeys={executionModuleKeys}
      moduleWorkDirs={moduleWorkDirs} />
    },
    { title: '结果页', description: '日志与报告', content: <Step4Result onNext={nextStep} onPrev={prevStep} /> },
    { title: '端云协同', description: '共享与复用', content: <Step5Cloud onPrev={prevStep} /> },
  ];

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
          <DesignTreePanel
            accent="#059669"
            flow="verification"
            flowLabel="Verification"
            enableRun={currentStep === 2}
            selectedKey={selectedModule}
            onSelect={setSelectedModule}
            onExecutionSelectionChange={setExecutionModuleKeys}
            onModuleWorkDirsChange={setModuleWorkDirs}
            onRun={handleTreeRun}
            onStop={handleTreeStop}
          />
        ) : undefined
      }
    />
  );
};

export default VerificationFlow;
