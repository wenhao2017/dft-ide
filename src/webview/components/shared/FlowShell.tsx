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
    /**
     * align-items: stretch  →  sidebar and main column grow to the same height.
     * The sidebar <aside> is also a flex column so DesignTreePanel can use flex:1
     * to fill the full height.
     */
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 16 }}>
      {sidebar && (
        <aside
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {sidebar}
        </aside>
      )}

      {/* Main column: steps bar + content card */}
      <div
        style={{
          minWidth: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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

        {/* Content card grows to fill remaining height */}
        <div
          style={{
            flex: 1,
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
  );
};

export default FlowShell;
