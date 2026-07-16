import React from 'react';
import { Steps } from 'antd';

export interface FlowStep {
  title: string;
  description?: string;
  content: React.ReactNode;
}

interface FlowShellProps {
  accent: string;
  eyebrow: string;
  title: string;
  description: string;
  steps: FlowStep[];
  current: number;
  onStepChange: (step: number) => void;
  sidebar?: React.ReactNode;
}

const FlowShell: React.FC<FlowShellProps> = ({
  steps,
  current,
  onStepChange,
  sidebar,
}) => {
  const activeStep = steps[current];

  return (
    <div className="dft-flow-shell">
      <div className="dft-flow-main">
        <div className="dft-stepbar">
          <Steps
            current={current}
            onChange={onStepChange}
            responsive
            size="small"
            items={steps.map((step) => ({
              title: step.title,
              description: step.description,
            }))}
          />
        </div>

        <div className="dft-flow-card">
          {sidebar && (
            <aside className="dft-flow-sidebar">
              {sidebar}
            </aside>
          )}

          <div className="dft-flow-content">
            {activeStep.content}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowShell;
