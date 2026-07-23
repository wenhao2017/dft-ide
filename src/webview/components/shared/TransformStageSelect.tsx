import React, { useEffect, useState } from 'react';
import { Button, Divider, Input, Popconfirm, Select, Space, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';

interface StageSelectProps {
  currentStage: string;
  setCurrentStage: (stage: string) => void;
  appendStage: (addValue: string, extendValue: string) => Promise<{ success: boolean; error?: string }>;
  removeStage: (removeValue: string) => Promise<{ success: boolean; error?: string }>;
  listStages: () => Promise<{ success: boolean; stages: string[]; error?: string }>;
  placeholder?: string;
}

interface StageOption {
  label: string;
  value: string;
}

const TransformStageSelect: React.FC<StageSelectProps> = ({
  currentStage,
  setCurrentStage,
  appendStage,
  removeStage,
  listStages,
  placeholder = '请选择 stage',
}) => {
  const [options, setOptions] = useState<StageOption[]>([]);
  const [addValue, setAddValue] = useState('');
  const [extendValue, setExtendValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    void listStages()
      .then((result) => {
        setOptions(result.success ? result.stages.map((stage) => ({ label: stage, value: stage })) : []);
      })
      .catch(() => setOptions([]));
    // The callbacks are adapters over stable IPC helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddOption = async () => {
    const stageName = addValue.trim();
    if (!stageName) {
      message.warning('请输入 stage 名称');
      return;
    }
    if (options.some((option) => option.value === stageName)) {
      message.warning(`stage ${stageName} 已存在`);
      return;
    }
    const result = await appendStage(stageName, extendValue);
    if (!result.success) {
      message.error(result.error ?? '添加 stage 失败');
      return;
    }
    setOptions((current) => [...current, { label: stageName, value: stageName }]);
    setCurrentStage(stageName);
    setAddValue('');
    setExtendValue('');
    message.success('添加 stage 成功');
  };

  const handleDeleteStage = async (stageName: string) => {
    const result = await removeStage(stageName);
    if (!result.success) {
      message.error(result.error ?? `删除 stage ${stageName} 失败`);
      return;
    }
    setOptions((current) => current.filter((option) => option.value !== stageName));
    if (currentStage === stageName) {
      setCurrentStage('');
    }
    message.success(`删除 stage ${stageName} 成功`);
  };

  return (
    <Select
      style={{ width: '100%' }}
      placeholder={placeholder}
      options={options}
      value={currentStage || undefined}
      open={isOpen}
      onOpenChange={setIsOpen}
      onChange={(value) => setCurrentStage(value)}
      optionRender={(option) => (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>{option.label}</span>
          <Popconfirm
            title="删除 stage"
            description={`确认删除 ${String(option.value)} 吗？`}
            onConfirm={() => handleDeleteStage(String(option.value))}
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<MinusCircleOutlined />}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      )}
      popupRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: '8px 0' }} />
          <Space style={{ padding: '0 8px 8px', width: '100%' }} align="start">
            <Input
              placeholder="新增 stage"
              value={addValue}
              onChange={(event) => setAddValue(event.target.value)}
              onPressEnter={() => void handleAddOption()}
            />
            <Select
              allowClear
              placeholder="继承自"
              style={{ minWidth: 180 }}
              options={options}
              value={extendValue || undefined}
              onChange={(value) => setExtendValue(value ?? '')}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void handleAddOption()}>
              新增
            </Button>
          </Space>
        </>
      )}
    />
  );
};

export default TransformStageSelect;
