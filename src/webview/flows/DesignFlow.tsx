import React, { useState } from 'react';
import Step1CommonConfig from '../components/design/Step1_CommonConfig';
import Step2ToolConfig from '../components/design/Step2_ToolConfig';
import Step4Result from '../components/design/Step4_Result';
import Step5Cloud from '../components/design/Step5_Cloud';
import FlowShell from '../components/shared/FlowShell';
import DesignTreePanel from '../components/shared/DesignTreePanel';
import usePipelineRuntimeStore from '../store/pipelineRuntimeStore';

interface Props {
  category: string;
}

const DesignFlow: React.FC<Props> = ({ category }) => {
  const repo = category.toLowerCase() === 'sailor' ? 'sailor' : 'hibist';
  const accent = repo === 'sailor' ? '#0ea5e9' : '#7c3aed';
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedModule, setSelectedModule] = useState('');
  const [executionModuleKeys, setExecutionModuleKeys] = useState<string[]>([]);
  const [moduleWorkDirs, setModuleWorkDirs] = useState<Record<string, string>>({});
  const startRuntime = usePipelineRuntimeStore((state) => state.startRuntime);
  const stopRuntime = usePipelineRuntimeStore((state) => state.stopRuntime);
  const runtimeLabel = repo === 'sailor' ? 'Sailor' : 'Hibist';
  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const handleTreeRun = (keys: string[], selectedTaskIds?: string[]) => {
    const taskIds = selectedTaskIds?.length ? selectedTaskIds : undefined;
    keys.filter(Boolean).forEach((moduleKey) => {
      startRuntime(
        repo,
        moduleKey,
        runtimeLabel,
        taskIds,
        moduleWorkDirs[moduleKey],
      );
    });
    if (keys.length === 1) {
      setSelectedModule(keys[0]);
    }
  };

  const handleTreeStop = (keys: string[]) => {
    keys.filter(Boolean).forEach((moduleKey) => {
      stopRuntime(
        repo,
        moduleKey,
        runtimeLabel,
      );
    });
  };

  const steps = [
    {
      title: '环境配置',
      description: '路径与模块',
      content: <Step1CommonConfig onNext={nextStep} category={category} />,
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
          category={category}
          moduleKeys={executionModuleKeys}
          moduleWorkDirs={moduleWorkDirs}
        />
      ),
    },
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
            enableRun={currentStep === 1}
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

export default DesignFlow;
