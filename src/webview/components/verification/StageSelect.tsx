import React, { useEffect, useState } from 'react';
import { Select, Divider, Input, Button, Space, message, Modal, Popconfirm, PopconfirmProps } from 'antd';
import { ExclamationCircleOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';

interface Option {
  label: string;
  value: string;
}

interface StageSelectProps {
  initStage: (addStage: string, extendStage: string) => Promise<{ success: boolean; error?: string }>;
  deleteStage: (stage: string) => Promise<{ success: boolean; error?: string }>;
  getStages: () => Promise<{ success: boolean; stages: string[]; error?: string }>;
}

const StageSelect: React.FC<StageSelectProps> = ({ initStage, deleteStage, getStages }) => {
  const [options, setOptions] = useState<Option[]>([]);
  const [currentStage, setCurrentStage] = useState('');
  const [delStage, setDelStage] = useState('');
  const [addStage, setAddStage] = useState('');
  const [extendStage, setExtendStage] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    getStages().then((res) => {
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
    if (addStage.trim() !== '') {
      const newOption: Option = { label: addStage, value: addStage };
      const result = await initStage(addStage, extendStage);
      if (result.success) {
        setOptions([...options, newOption]);
        setAddStage('');
        setExtendStage('');
        message.success(`添加stage成功`);
      }else {
        message.error(result.error ?? '添加stage失败');
      }
    }
  };

  const handleDeleteStage: PopconfirmProps['onConfirm'] = async (e) => {
    const result = await deleteStage(delStage);
    if (result.success) {
      setOptions(options => options.filter(option => option.value !== delStage));
      setCurrentStage('');
      message.success(`删除stage ${delStage}成功`);
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
                    onClick={() => { setDelStage(opt.label) }}
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
              value={addStage}
              onChange={(e) => setAddStage(e.target.value)}
              onPressEnter={handleAddOption}
            />
            继承于
            <Select
              style={{ minWidth: 200 }}
              options={options}
              value={extendStage}
              onChange={value => setExtendStage(value)}
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
