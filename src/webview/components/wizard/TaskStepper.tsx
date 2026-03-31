import React from 'react';
import { Steps } from 'antd';
import useWizardStore from '../../store/wizardStore';
import Step1Context from './Step1_Context';
import Step2DataVerify from './Step2_DataVerify';
import Step3Config from './Step3_Config';
import Step4Monitor from './Step4_Monitor';

const stepItems = [
  { title: '选择上下文' },
  { title: '数据确认' },
  { title: '工具配置' },
  { title: '任务监控' },
];

const TaskStepper: React.FC = () => {
  const currentStep = useWizardStore((s) => s.currentStep);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <Step1Context />;
      case 1:
        return <Step2DataVerify />;
      case 2:
        return <Step3Config />;
      case 3:
        return <Step4Monitor />;
      default:
        return null;
    }
  };

  return (
    <div>
      <Steps current={currentStep} items={stepItems} style={{ marginBottom: 32 }} />
      <div style={{ minHeight: 360 }}>{renderStep()}</div>
    </div>
  );
};

export default TaskStepper;
