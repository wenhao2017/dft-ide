import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Button, Divider, Space } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import PipelineExecutionOverview, { PipelineExecutionRef as OverviewRef } from '../shared/PipelineExecutionOverview';

interface Props {
  onNext: () => void;
  onPrev: () => void;
  moduleKeys?: string[];
  activeModuleKey?: string;
}

export interface PipelineExecutionRef {
  handleExternalRun: (keys: string[]) => void;
  handleExternalStop: (keys: string[]) => void;
}

const Step3Execution = forwardRef<PipelineExecutionRef, Props>(({
  onNext,
  onPrev,
  moduleKeys = ['top_abc'],
  activeModuleKey,
}, ref) => {
  const overviewRef = useRef<OverviewRef>(null);

  useImperativeHandle(ref, () => ({
    handleExternalRun(keys: string[]) {
      overviewRef.current?.handleExternalRun(keys);
    },
    handleExternalStop(keys: string[]) {
      overviewRef.current?.handleExternalStop(keys);
    },
  }));

  return (
    <div>
      <PipelineExecutionOverview
        ref={overviewRef}
        flowKey="verification"
        flowLabel="Lander"
        moduleKeys={moduleKeys}
        activeModuleKey={activeModuleKey}
      />

      <Divider style={{ margin: '18px 0 14px' }} />
      <Space style={{ width: '100%', justifyContent: 'flex-end' }} wrap>
        <Button onClick={onPrev} icon={<LeftOutlined />}>
          上一页
        </Button>
        <Button type="primary" onClick={onNext}>
          下一页
          <RightOutlined />
        </Button>
      </Space>
    </div>
  );
});

Step3Execution.displayName = 'Step3Execution';

export default Step3Execution;
