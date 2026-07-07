import React, { useState, useRef } from 'react';
import { Select, Divider, Input, Button, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const CustomSelect = () => {
  const [options, setOptions] = useState([
    { label: 'DFT', value: 'dft' },
    { label: 'PR', value: 'pr' },
  ]);
  const [addValue, setAddValue] = useState('');
  const [extendValue, setExtendValue] = useState('');

  // 处理新增选项
  const handleAddOption = () => {
    if (addValue.trim() !== '') {
      const newOption = { label: addValue, value: addValue };
      setOptions([...options, newOption]);
      setAddValue('');
    }
  };

  return (
    <Select
      style={{ width: '100%' }}
      placeholder="请选择stage"
      options={options}
      dropdownRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: '8px 0' }} />
          {/* 使用 onMouseDown 阻止点击自定义内容时关闭浮层 */}
          <Space style={{ padding: '0 8px 4px' }}>
            <Input
              placeholder="添加stage"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              onPressEnter={handleAddOption}
            />

            继承于
            <Input
              placeholder="添加stage"
              value={extendValue}
              onChange={(e) => setExtendValue(e.target.value)}
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

export default CustomSelect;