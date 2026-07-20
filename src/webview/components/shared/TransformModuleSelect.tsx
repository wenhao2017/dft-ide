import React, { useMemo, useState } from 'react';
import { Button, Divider, Select, Space } from 'antd';
import { CheckSquareOutlined } from '@ant-design/icons';

export interface TransformModuleOption {
  label: string;
  value: string;
}

interface ModuleSelectProps {
  options: TransformModuleOption[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  placeholder?: string;
}

const TransformModuleSelect: React.FC<ModuleSelectProps> = ({
  options,
  selectedValues,
  onSelectionChange,
  placeholder = '请选择 module',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const filteredOptions = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(keyword));
  }, [options, searchTerm]);

  const filteredValues = filteredOptions.map((option) => option.value);
  const allFilteredSelected = filteredValues.length > 0
    && filteredValues.every((value) => selectedValues.includes(value));

  const toggleFiltered = () => {
    if (allFilteredSelected) {
      onSelectionChange(selectedValues.filter((value) => !filteredValues.includes(value)));
      return;
    }
    onSelectionChange([...new Set([...selectedValues, ...filteredValues])]);
  };

  return (
    <Select
      mode="multiple"
      allowClear
      showSearch
      optionFilterProp="label"
      options={filteredOptions}
      value={selectedValues}
      onChange={onSelectionChange}
      onSearch={setSearchTerm}
      onOpenChange={(open) => {
        if (!open) setSearchTerm('');
      }}
      placeholder={placeholder}
      maxTagCount="responsive"
      style={{ width: '100%' }}
      dropdownRender={(menu) => (
        <>
          <Space style={{ padding: '4px 8px' }}>
            <Button
              type="text"
              size="small"
              icon={<CheckSquareOutlined />}
              disabled={filteredValues.length === 0}
              onClick={toggleFiltered}
            >
              {allFilteredSelected ? '取消当前筛选' : '选择当前筛选'}
            </Button>
          </Space>
          <Divider style={{ margin: '4px 0' }} />
          {menu}
        </>
      )}
    />
  );
};

export default TransformModuleSelect;
