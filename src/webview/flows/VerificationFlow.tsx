import React, {  useState } from 'react';
import Step1CommonConfig from '../components/verification/Step1_CommonConfig';

import ConfigExecution from '../components/verification/ConfigExecution';

import Step4Result from '../components/verification/Step4_Result';
import FlowShell from '../components/shared/FlowShell';
import Step5Cloud from '../components/verification/Step5_Cloud';


const VerificationFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);


  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));


  const initialConfig = {
    tc: [
      { name: "Compute_TC_A" },
      { name: "Storage_TC_B" },
      { name: "Network_TC_C" },
    ],
    subattr: [
      { name: "attr_capacity_limit" },
      { name: "attr_io_threshold" },
      { name: "attr_latency_mode" },
    ],
    groups: [
      {
        name: "Root_Cluster_01",
        tc: ["Compute_TC_A", "Storage_TC_B"],
        subattr: ["attr_capacity_limit", "attr_io_threshold"],
      },
      {
        name: "Archive_Node_02",
      },
    ],
  }

  const steps = [
    { title: '公共配置', description: '环境与出口', content: <Step1CommonConfig onNext={nextStep} /> },
    { title: '配置和执行', description: '仿真工具链', content: <ConfigExecution initialConfig={initialConfig} /> },
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
