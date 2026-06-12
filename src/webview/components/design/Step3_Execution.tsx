import React from 'react';
import { Button, Divider, Space } from 'antd';
import { LeftOutlined, RightOutlined, SaveOutlined } from '@ant-design/icons';
import PipelineExecutionOverview from '../shared/PipelineExecutionOverview';
import ToolConfig from './ToolConfig';

interface Props {
  onNext: () => void;
  onPrev: () => void;
  category?: string;
  moduleKey?: string;
  moduleKeys?: string[];
}

const Step3Execution: React.FC<Props> = ({ onNext, onPrev, category, moduleKeys = ['top_abc'], moduleKey}) => {
  const repo = category?.toLowerCase() === 'sailor' ? 'sailor' : 'hibist';
  const flowLabel = repo === 'sailor' ? 'Sailor' : 'DFTM';

  return (
    <div>
      <ToolConfig
        moduleKey={moduleKey || ''}
        category={category || ''}
      />
      <PipelineExecutionOverview
        flowKey={repo}
        flowLabel={flowLabel}
        moduleKeys={moduleKeys}
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
};

export default Step3Execution;
