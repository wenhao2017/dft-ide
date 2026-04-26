/**
 * PathInput — 路径输入框 + 操作按钮的通用组件
 *
 * 将 useVscodePath hook 返回的 state 与 UI 结合。
 * 支持以下按钮组合：
 *   - showOpen   → "打开" 按钮（先选后开，或直接打开）
 *   - showSelect → "选择" 按钮（只填路径，不打开）
 *
 * 典型用法：
 *   <PathInput state={myPath} placeholder="请输入配置路径" showOpen showSelect />
 */
import React from 'react';
import { Input, Button, Space } from 'antd';
import { FolderOpenOutlined, FolderOutlined, FileOutlined } from '@ant-design/icons';
import { VscodePathState } from '../../hooks/useVscodePath';

interface PathInputProps {
  state: VscodePathState;
  placeholder?: string;
  disabled?: boolean;
  /** 显示"打开"按钮 */
  showOpen?: boolean;
  /** 兼容老逻辑：如果传 true，则同时显示选文件和选目录 */
  showSelect?: boolean;
  /** 专门显示选目录按钮 */
  showSelectFolder?: boolean;
  /** 专门显示选文件按钮 */
  showSelectFile?: boolean;
  size?: 'small' | 'middle' | 'large';
}

const PathInput: React.FC<PathInputProps> = ({
  state,
  placeholder = '请输入路径',
  disabled = false,
  showOpen = false,
  showSelect = false,
  showSelectFolder = false,
  showSelectFile = false,
  size = 'middle',
}) => {
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        value={state.value}
        onChange={(e) => state.setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        size={size}
        allowClear
      />
      {(showSelect || showSelectFolder) && (
        <Button
          icon={<FolderOutlined />}
          loading={state.loading}
          disabled={disabled}
          size={size}
          onClick={() => state.handleSelect('folder')}
          title="选择目录"
        >
          选目录
        </Button>
      )}
      {(showSelect || showSelectFile) && (
        <Button
          icon={<FileOutlined />}
          loading={state.loading}
          disabled={disabled}
          size={size}
          onClick={() => state.handleSelect('file')}
          title="选择文件"
        >
          选文件
        </Button>
      )}
      {showOpen && (
        <Button
          icon={<FolderOpenOutlined />}
          loading={state.loading}
          disabled={disabled}
          size={size}
          onClick={() => state.handleOpen()}
          title={state.value ? '在编辑器或资源管理器中打开' : '选择并打开'}
        >
          打开
        </Button>
      )}
    </Space.Compact>
  );
};

export default PathInput;
