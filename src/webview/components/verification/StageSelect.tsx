import React, { useEffect, useState } from 'react';
import { Select, Divider, Input, Button, Space, message, Modal, Popconfirm, PopconfirmProps } from 'antd';
import { ExclamationCircleOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';

interface Option {
  label: string;
  value: string;
}

interface StageSelectProps {
  currentStage: string;
  setCurrentStage: (stage: string) => void;
  appendStage: (addValue: string, extendValue: string) => Promise<{ success: boolean; error?: string }>;
  removeStage: (removeValue: string) => Promise<{ success: boolean; error?: string }>;
  listStages: () => Promise<{ success: boolean; stages: string[]; error?: string }>;
}

const StageSelect: React.FC<StageSelectProps> = ( {currentStage, setCurrentStage, appendStage, removeStage, listStages }) => {
  const [options, setOptions] = useState<Option[]>([]);
  const [removeValue, setRemoveValue] = useState('');
  const [addValue, setAddValue] = useState('');
  const [extendValue, setExtendValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    listStages().then((res) => {
      if (res && res.stages) {
        setOptions(res.stages.map(item => {
          return {label: item, value: item} as Option;
        }));
      } else {
        setOptions([]);
      }
    })
    .catch(() => setOptions([]));
  }, []);

  const handleAddOption = async () => {
    if (addValue.trim() !== '') {
      const newOption: Option = { label: addValue, value: addValue };
      const result = await appendStage(addValue, extendValue);
      if (result.success) {
        setOptions([...options, newOption]);
        setAddValue('');
        setExtendValue('');
        message.success(`添加stage成功`);
      }else {
        message.error(result.error ?? '添加stage失败');
      }
    }
  };

  const handleDeleteStage: PopconfirmProps['onConfirm'] = async (e) => {
    const result = await removeStage(removeValue);
    if (result.success) {
      setOptions(options => options.filter(option => option.value !== removeValue));
      setCurrentStage('');
      message.success(`删除stage ${removeValue}成功`);
    }else {
      message.error(result.error ?? '删除stage ${delStage}失败');
    }
  };

  const preventDefault = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Select
      style={{ width: '100%' }}
      placeholder="请选择stage"
      options={options}
      value={currentStage}
      open={isOpen}
      onDropdownVisibleChange={(visible) => setIsOpen(visible)}
      dropdownRender={() => (
        <>
          <div>
            {options.map((opt) => (
              <div
                onMouseDown={preventDefault}
                key={opt.value}
                style={{
                  padding: '0 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  borderRadius: 4,
                  color: 'var(--vscode-foreground)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Space style={{width: '98%'}} onClick={() => { setCurrentStage(opt.label); setIsOpen(false) }}>{opt.label}</Space>

                <Popconfirm
                  title="删除stage"
                  description={`确认删除${opt.value}吗？`}
                  onConfirm={handleDeleteStage}
                  okText="确定"
                  cancelText="取消"
                  placement="topRight"
                >
                  <Button
                    type="text"
                    danger
                    icon={<MinusCircleOutlined />}
                    onClick={() => { setRemoveValue(opt.label) }}
                    style={{ flex: '0 0 auto', width: '2%' }}
                  />
                </Popconfirm>
              </div>
            ))}
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <Space style={{ padding: '0 8px 4px' }}>
            <Input
              placeholder="添加stage"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              onPressEnter={handleAddOption}
            />
            继承于
            <Select
              style={{ minWidth: 200 }}
              options={options}
              value={extendValue}
              onChange={value => setExtendValue(value)}
              onMouseDown={preventDefault}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddOption}>
              新增
            </Button>
          </Space>
        </>
      )}
    />
  );
};

export default StageSelect;
