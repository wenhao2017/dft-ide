import React from 'react';
import { Steps, Typography } from 'antd';

const { Text, Title } = Typography;

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
}

const FlowShell: React.FC<FlowShellProps> = ({
  accent,
  eyebrow,
  title,
  description,
  steps,
  current,
  onStepChange,
}) => {
  const activeStep = steps[current];

  return (
    <div>
      <div
        style={{
          border: `1px solid ${accent}33`,
          borderRadius: 8,
          padding: '18px 20px',
          marginBottom: 20,
          background: `linear-gradient(135deg, ${accent}1f, transparent 62%)`,
        }}
      >
        <Text
          style={{
            color: accent,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0,
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </Text>
        <Title level={3} style={{ margin: '6px 0 4px', fontSize: 22 }}>
          {title}
        </Title>
        <Text type="secondary" style={{ lineHeight: 1.7 }}>
          {description}
        </Text>
      </div>

      <Steps
        current={current}
        onChange={onStepChange}
        responsive
        items={steps.map((step) => ({
          title: step.title,
          description: step.description,
        }))}
        style={{ marginBottom: 24 }}
      />

      <div
        style={{
          minHeight: 400,
          borderRadius: 8,
          border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
          padding: 20,
          background: 'var(--vscode-editor-background)',
        }}
      >
        {activeStep.content}
      </div>
    </div>
  );
};

export default FlowShell;
