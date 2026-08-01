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
  const hasSidebar = Boolean(sidebar);

  return (
    <div className="dft-flow-shell">
      <style>{`
        .dft-flow-card.dft-flow-card--animated-sidebar {
          gap: 0;
        }
        .dft-flow-sidebar.dft-flow-sidebar--transition {
          max-width: 0;
          margin-right: 0;
          opacity: 0;
          transform: translateX(-10px);
          pointer-events: none;
          transition:
            max-width 260ms cubic-bezier(.22, 1, .36, 1),
            margin-right 260ms cubic-bezier(.22, 1, .36, 1),
            opacity 180ms ease,
            transform 260ms cubic-bezier(.22, 1, .36, 1);
        }
        .dft-flow-card--has-sidebar .dft-flow-sidebar--transition {
          max-width: 320px;
          margin-right: 12px;
          opacity: 1;
          transform: translateX(0);
          pointer-events: auto;
        }
        @media (prefers-reduced-motion: reduce) {
          .dft-flow-sidebar.dft-flow-sidebar--transition {
            transition: none;
          }
        }
      `}</style>
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

        <div className={`dft-flow-card dft-flow-card--animated-sidebar${hasSidebar ? ' dft-flow-card--has-sidebar' : ''}`}>
          <aside
            className="dft-flow-sidebar dft-flow-sidebar--transition"
            aria-hidden={!hasSidebar}
          >
            {sidebar}
          </aside>

          <div className="dft-flow-content">
            {activeStep.content}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowShell;
