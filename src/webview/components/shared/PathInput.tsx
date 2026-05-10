import React, { useState } from 'react';
import { Button, Dropdown, Input, Space, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudOutlined,
  DownOutlined,
  FileOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { VscodePathState } from '../../hooks/useVscodePath';
import useWizardStore from '../../store/wizardStore';
import ObsViewer, { ObsSelectTarget } from './ObsViewer';

interface PathInputProps {
  state: VscodePathState;
  placeholder?: string;
  disabled?: boolean;
  showOpen?: boolean;
  showSelect?: boolean;
  showSelectFolder?: boolean;
  showSelectFile?: boolean;
  size?: 'small' | 'middle' | 'large';
  /** 是否显示路径验证状态（优化2，默认 true） */
  showValidation?: boolean;
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
  showValidation = true,
}) => {
  const [obsTarget, setObsTarget] = useState<ObsSelectTarget | null>(null);
  const activeProject = useWizardStore((store) => store.activeProject);
  const obsSpaceName = activeProject?.name ?? 'dft-ide-workspace';
  const canSelectFolder = showSelect || showSelectFolder;
  const canSelectFile = showSelect || showSelectFile;

  // 优化2：根据验证状态渲染图标
  const validationSuffix = showValidation && state.validation
    ? (() => {
        switch (state.validation.status) {
          case 'validating':
            return (
              <Tooltip title="正在验证路径...">
                <LoadingOutlined style={{ color: 'var(--vscode-input-foreground, #999)' }} />
              </Tooltip>
            );
          case 'valid':
            return (
              <Tooltip title={state.validation.message ?? '路径有效'}>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
              </Tooltip>
            );
          case 'invalid':
            return (
              <Tooltip title={state.validation.message ?? '路径无效'}>
                <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
              </Tooltip>
            );
          default:
            return null;
        }
      })()
    : null;

  const makeSelectButton = (target: ObsSelectTarget) => (
    <Dropdown
      disabled={disabled}
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'local',
            icon: target === 'folder' ? <FolderOutlined /> : <FileOutlined />,
            label: target === 'folder' ? '本地目录' : '本地文件',
          },
          {
            key: 'obs',
            icon: <CloudOutlined />,
            label: target === 'folder' ? 'OBS目录' : 'OBS文件',
          },
        ],
        onClick: ({ key }) => {
          if (key === 'local') {
            void state.handleSelect(target);
          } else {
            setObsTarget(target);
          }
        },
      }}
    >
      <Button
        icon={target === 'folder' ? <FolderOutlined /> : <FileOutlined />}
        loading={state.selecting}
        disabled={disabled}
        size={size}
        style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
      >
        {/* 优化2：选择中状态提示 */}
        {state.selecting ? '选择中…' : (target === 'folder' ? '选择目录' : '选择文件')}
        {!state.selecting && <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />}
      </Button>
    </Dropdown>
  );

  return (
    <>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={state.value}
          onChange={(event) => state.setValue(event.target.value)}
          onBlur={() => {
            if (state.value.trim() && showValidation) {
              state.handleValidate();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          size={size}
          allowClear
          suffix={validationSuffix}
          status={
            state.validation?.status === 'invalid' ? 'error'
            : state.validation?.status === 'valid' ? ''
            : undefined
          }
          style={{ minWidth: 0 }}
        />
        {canSelectFolder && makeSelectButton('folder')}
        {canSelectFile && makeSelectButton('file')}
        {showOpen && (
          <Button
            icon={<FolderOpenOutlined />}
            loading={state.loading}
            disabled={disabled}
            size={size}
            onClick={() => state.handleOpen()}
            title={state.value ? '在编辑器或资源管理器中打开' : '选择并打开'}
            style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
          >
            打开
          </Button>
        )}
      </Space.Compact>
      <ObsViewer
        open={obsTarget !== null}
        spaceName={obsSpaceName}
        selectTarget={obsTarget ?? undefined}
        onCancel={() => setObsTarget(null)}
        onSelect={(path) => state.setValue(path)}
      />
    </>
  );
};

export default PathInput;
