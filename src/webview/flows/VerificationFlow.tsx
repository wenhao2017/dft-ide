import React, { useState } from 'react';
import { Steps } from 'antd';
import Step1CommonConfig from '../components/verification/Step1_CommonConfig';
import Step2ToolConfig from '../components/verification/Step2_ToolConfig';
import Step3Execution from '../components/verification/Step3_Execution';
import Step4Result from '../components/verification/Step4_Result';
import Step5Cloud from '../components/verification/Step5_Cloud';

const VerificationFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const steps = [
    { title: '公共配置', content: <Step1CommonConfig onNext={nextStep} /> },
    { title: '工具配置', content: <Step2ToolConfig onNext={nextStep} onPrev={prevStep} /> },
    { title: '执行页', content: <Step3Execution onNext={nextStep} onPrev={prevStep} /> },
    { title: '结果页', content: <Step4Result onNext={nextStep} onPrev={prevStep} /> },
    { title: '端云协同', content: <Step5Cloud onPrev={prevStep} /> },
  ];

  return (
    <div>
      <Steps
        current={currentStep}
        onChange={setCurrentStep}
        items={steps.map((s) => ({ title: s.title }))}
        style={{ marginBottom: 32 }}
      />
      <div style={{ minHeight: 400 }}>{steps[currentStep].content}</div>
    </div>
  );
};

export default VerificationFlow;
