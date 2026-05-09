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
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 16 }}>
        {sidebar && (
          <aside style={{ flex: '0 0 300px', minWidth: 280 }}>
            {sidebar}
          </aside>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ overflow: 'hidden', paddingBottom: 4, marginBottom: 20 }}>
            <Steps
              current={current}
              onChange={onStepChange}
              responsive
              items={steps.map((step) => ({
                title: step.title,
                description: step.description,
              }))}
              style={{ width: '100%' }}
            />
          </div>

          <div
            style={{
              minHeight: 400,
              minWidth: 0,
              borderRadius: 8,
              border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
              padding: 20,
              background: 'var(--vscode-editor-background)',
              overflowX: 'hidden',
            }}
          >
            <div style={{ width: '100%', minWidth: 0 }}>{activeStep.content}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowShell;
