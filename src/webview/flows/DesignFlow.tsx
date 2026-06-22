import React, { useState } from 'react';
import Step1CommonConfig from '../components/design/Step1_CommonConfig';
import Step2ToolConfig from '../components/design/Step2_ToolConfig';
import Step3Execution from '../components/design/Step3_Execution';
import Step4Result from '../components/design/Step4_Result';
import Step5Cloud from '../components/design/Step5_Cloud';
import FlowShell from '../components/shared/FlowShell';
import DesignTreePanel from '../components/shared/DesignTreePanel';

interface Props {
  category: string;
}

const DesignFlow: React.FC<Props> = ({ category }) => {
  const repo = category.toLowerCase() === 'sailor' ? 'sailor' : 'hibist';
  const accent = repo === 'sailor' ? '#0ea5e9' : '#7c3aed';
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedModule, setSelectedModule] = useState('');
  const [executionModuleKeys, setExecutionModuleKeys] = useState<string[]>([]);
  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const steps = [
    {
      title: '环境配置',
      description: '路径与模块',
      content: <Step1CommonConfig onNext={nextStep} category={category} />,
    },
    {
      title: '执行配置',
      description: '版本与资源',
      content: (
        <Step2ToolConfig
          moduleKey={selectedModule}
          onNext={nextStep}
          onPrev={prevStep}
          category={category}
          moduleKeys={executionModuleKeys}
        />
      ),
    },
    // {
    //   title: '执行配置',
    //   description: '脚本与任务',
    //   content: (
    //     <Step3Execution
    //       moduleKey={selectedModule}
    //       onNext={nextStep}
    //       onPrev={prevStep}
    //       category={category}
    //       moduleKeys={executionModuleKeys}
    //     />
    //   ),
    // },
    {
      title: '结果查看',
      description: '报告与日志',
      content: <Step4Result onNext={nextStep} onPrev={prevStep} category={category} />,
    },
    {
      title: '端云协同',
      description: '提交与归档',
      content: <Step5Cloud onPrev={prevStep} repo={repo} />,
    },
  ];

  return (
    <FlowShell
      accent={accent}
      eyebrow="Design Flow"
      title={`${category} 设计任务编排`}
      description="把公共路径、工具版本、集群资源与执行结果收束到同一条清晰流程里。"
      steps={steps}
      current={currentStep}
      onStepChange={setCurrentStep}
      sidebar={
        currentStep !== 0 ? (
          <DesignTreePanel
            accent={accent}
            flow={repo}
            flowLabel={category}
            selectedKey={selectedModule}
            onSelect={setSelectedModule}
            executionSelectedKeys={executionModuleKeys}
            onExecutionSelectionChange={setExecutionModuleKeys}
          />
        ) : undefined
      }
    />
  );
};

export default DesignFlow;
