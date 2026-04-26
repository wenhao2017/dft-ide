import React, { useState } from 'react';
import Step1CommonConfig from '../components/verification/Step1_CommonConfig';
import Step2ToolConfig from '../components/verification/Step2_ToolConfig';
import Step3Execution from '../components/verification/Step3_Execution';
import Step4Result from '../components/verification/Step4_Result';
import Step5Cloud from '../components/verification/Step5_Cloud';
import FlowShell from '../components/shared/FlowShell';

const VerificationFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const steps = [
    { title: '公共配置', description: '环境与出口', content: <Step1CommonConfig onNext={nextStep} /> },
    { title: '工具配置', description: '仿真工具链', content: <Step2ToolConfig onNext={nextStep} onPrev={prevStep} /> },
    { title: '执行页', description: '用例与命令', content: <Step3Execution onNext={nextStep} onPrev={prevStep} /> },
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
    />
  );
};

export default VerificationFlow;
