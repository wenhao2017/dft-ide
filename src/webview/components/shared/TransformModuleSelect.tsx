import React, { useState, useMemo } from 'react';
import { Select, Input, Divider, Button } from 'antd';
import { SearchOutlined, CheckSquareOutlined } from '@ant-design/icons';

interface ModuleSelectProps {
  options: any[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  placeholder?: string;
}

const ModuleSelect: React.FC<ModuleSelectProps> = ({
  options,
  selectedValues,
  onSelectionChange,
  placeholder = "请选择...",
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    return options.filter(opt =>
      opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

  const handleSelect = (value: string) => {
    if (selectedValues.includes(value)) {
      onSelectionChange(selectedValues.filter(v => v !== value));
    } else {
      onSelectionChange([...selectedValues, value]);
    }
  };

  const handleSelectAll = () => {
    const filteredValues = filteredOptions.map(opt => opt.value);
    const isAllSelected = filteredValues.every(val => selectedValues.includes(val));

    if (isAllSelected) {
      onSelectionChange(selectedValues.filter(v => !filteredValues.includes(v)));
    } else {
      const newValues = [...new Set([...selectedValues, ...filteredValues])];
      onSelectionChange(newValues);
    }
  };

  const isAllFilteredSelected = useMemo(() => {
    if (filteredOptions.length === 0) return false;
    return filteredOptions.every(opt => selectedValues.includes(opt.value));
  }, [filteredOptions, selectedValues]);

  const selectedLabels = options
    .filter(opt => selectedValues.includes(opt.value))
    .map(opt => opt.label);

  return (
    <Select
      style={{ width: '100%' }}
      placeholder={placeholder}
      open={isOpen}
      onOpenChange={(visible) => setIsOpen(visible)}
      value={selectedValues.length > 0 ? selectedLabels.join(', ') : undefined}
      popupRender={() => (
        <div
          style={{
            backgroundColor: 'var(--ant-color-bg-container, var(--vscode-dropdown-background))',
            borderRadius: '4px'
          }}
        >
          <div style={{ padding: '8px', display: 'flex', gap: '8px' }} onMouseDown={(e) => e.preventDefault()}>
            <Input
              placeholder="输入关键字查询..."
              prefix={<SearchOutlined style={{ color: 'var(--vscode-descriptionForeground)' }} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ borderRadius: '4px', flex: 1 }}
            />
            <Button
              icon={<CheckSquareOutlined />}
              onClick={handleSelectAll}
              style={{ borderRadius: '4px' }}
            >
              {isAllFilteredSelected ? '取消全选' : '全选'}
            </Button>
          </div>

          <Divider style={{ margin: '0 0 8px 0' }} />

          <div 
            style={{ 
              maxHeight: '200px',
              overflowY: 'auto',
              display: 'grid',     
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '4px',                  
              padding: '0 4px'
            }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                  <div
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    onMouseDown={(e) => e.preventDefault()}
                    style={{
                      padding: '5px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: '4px',
                      margin: '0 4px',
                      backgroundColor: isSelected
                        ? 'var(--ant-color-primary-bg, var(--vscode-list-activeSelectionBackground))'
                        : 'transparent',
                      color: isSelected
                        ? 'var(--ant-color-primary-text, var(--vscode-list-activeSelectionForeground))'
                        : 'var(--vscode-foreground)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = isSelected
                        ? 'var(--ant-color-primary-bg, var(--vscode-list-activeSelectionBackground))'
                        : 'transparent';
                    }}
                  >
                    <div
                      style={{
                        width: '14px',
                        height: '14px',
                        marginRight: '8px',
                        border: `1px solid ${isSelected ? 'var(--ant-color-primary)' : 'var(--vscode-checkbox-border)'}`,
                        backgroundColor: isSelected ? 'var(--ant-color-primary)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '2px',
                        fontSize: '10px',
                        color: '#fff',
                        transition: 'all 0.2s'
                      }}
                    >
                      {isSelected && '✓'}
                    </div>
                    <span>{option.label}</span>
                  </div>
                );
              })
            ) : (
                <div style={{ padding: '8px', color: 'var(--vscode-descriptionForeground)', textAlign: 'center', fontSize: '12px' }}>
                  无匹配结果
                </div>
              )}
          </div>
        </div>
      )}
    />
  );
};

export default ModuleSelect;