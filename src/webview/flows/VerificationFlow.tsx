import React, { useRef, useState } from 'react';
import Step1CommonConfig from '../components/verification/Step1_CommonConfig';
import Step2ToolConfig from '../components/verification/Step2_ToolConfig';
import Step3Execution, { PipelineExecutionRef } from '../components/verification/Step3_Execution';
import Step4Result from '../components/verification/Step4_Result';
import Step5Cloud from '../components/verification/Step5_Cloud';
import FlowShell from '../components/shared/FlowShell';
import DesignTreePanel from '../components/shared/DesignTreePanel';

const VerificationFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedModule, setSelectedModule] = useState('');
  const [executionModuleKeys, setExecutionModuleKeys] = useState<string[]>([]);
  const executionRef = useRef<PipelineExecutionRef>(null);

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const handleTreeRun = (keys: string[]) => {
    executionRef.current?.handleExternalRun(keys);
  };

  const handleTreeStop = (keys: string[]) => {
    executionRef.current?.handleExternalStop(keys);
  };

  const steps = [
    { title: 'Common Config', description: 'Environment and output', content: <Step1CommonConfig onNext={nextStep} /> },
    { title: 'Tool Config', description: 'Simulation toolchain', content: <Step2ToolConfig moduleKey={selectedModule} onNext={nextStep} onPrev={prevStep} /> },
    {
      title: 'Execution',
      description: 'Cases and commands',
      content: (
        <Step3Execution
          ref={executionRef}
          moduleKeys={executionModuleKeys}
          activeModuleKey={selectedModule}
          onNext={nextStep}
          onPrev={prevStep}
        />
      ),
    },
    { title: 'Results', description: 'Logs and reports', content: <Step4Result onNext={nextStep} onPrev={prevStep} /> },
    { title: 'Cloud Sync', description: 'Share and reuse', content: <Step5Cloud onPrev={prevStep} /> },
  ];

  return (
    <FlowShell
      accent="#059669"
      eyebrow="Verification Flow"
      title="Verification Task Loop"
      description="A stable workflow for verification environment setup, tool configuration, simulation execution, and report review."
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
            executionSelectedKeys={executionModuleKeys}
            onExecutionSelectionChange={setExecutionModuleKeys}
            onRun={handleTreeRun}
            onStop={handleTreeStop}
          />
        ) : undefined
      }
    />
  );
};

export default VerificationFlow;
