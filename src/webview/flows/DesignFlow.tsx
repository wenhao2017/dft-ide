import React, { useState } from 'react';
import Step1CommonConfig from '../components/design/Step1_CommonConfig';
import Step2ToolConfig from '../components/design/Step2_ToolConfig';
import Step3Execution from '../components/design/Step3_Execution';
import Step4Result from '../components/design/Step4_Result';
import Step5Cloud from '../components/design/Step5_Cloud';
import FlowShell from '../components/shared/FlowShell';

const DesignFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const steps = [
    { title: '公共配置', description: '路径与模板', content: <Step1CommonConfig onNext={nextStep} /> },
    { title: '工具配置', description: '版本与集群', content: <Step2ToolConfig onNext={nextStep} onPrev={prevStep} /> },
    { title: '执行页', description: '脚本与任务', content: <Step3Execution onNext={nextStep} onPrev={prevStep} /> },
    { title: '结果页', description: '报告与定位', content: <Step4Result onNext={nextStep} onPrev={prevStep} /> },
    { title: '端云协同', description: '同步与归档', content: <Step5Cloud onPrev={prevStep} /> },
  ];

  return (
    <FlowShell
      accent="#7c3aed"
      eyebrow="Design Flow"
      title="设计任务编排"
      description="把公共路径、工具版本、集群资源与执行结果收束到同一条清晰流程里。"
      steps={steps}
      current={currentStep}
      onStepChange={setCurrentStep}
    />
  );
};

export default DesignFlow;
