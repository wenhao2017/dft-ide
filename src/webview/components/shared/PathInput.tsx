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
import { PathSelectTarget, PathSource, VscodePathState } from '../../hooks/useVscodePath';
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
  pathSources?: PathSource[];
  size?: 'small' | 'middle' | 'large';
  showValidation?: boolean;
}

const openButtonWidth = {
  small: 30,
  middle: 34,
  large: 38,
} as const;

const selectButtonWidth = {
  small: 36,
  middle: 40,
  large: 44,
} as const;

const defaultPathSources: PathSource[] = ['local', 'obs'];

const PathInput: React.FC<PathInputProps> = ({
  state,
  placeholder = '请输入路径',
  disabled = false,
  showOpen = false,
  showSelect = false,
  showSelectFolder = false,
  showSelectFile = false,
  pathSources = defaultPathSources,
  size = 'middle',
  showValidation = true,
}) => {
  const [obsTarget, setObsTarget] = useState<ObsSelectTarget | null>(null);
  const activeProject = useWizardStore((store) => store.activeProject);
  const obsSpaceName = activeProject?.name ?? 'dft-ide-workspace';
  const canSelectFolder = showSelect || showSelectFolder;
  const canSelectFile = showSelect || showSelectFile;
  const enabledSources: PathSource[] = pathSources.length > 0 ? pathSources : defaultPathSources;
  const openTarget: PathSelectTarget = canSelectFile ? 'file' : 'folder';
  const handleOpenClick = () => {
    if (!state.value.trim() && enabledSources.length === 1 && enabledSources[0] === 'obs') {
      setObsTarget(openTarget);
      return;
    }
    void state.handleOpen({ targetType: openTarget, sources: enabledSources });
  };

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

  const makeSelectButton = (target: ObsSelectTarget) => {
    const isFolder = target === 'folder';
    const title = isFolder ? '选择目录' : '选择文件';
    const icon = isFolder ? <FolderOutlined /> : <FileOutlined />;
    const onlyOneSource = enabledSources.length === 1;
    const selectFromSource = (source: PathSource) => {
      if (source === 'local') {
        void state.handleSelect(target);
      } else {
        setObsTarget(target);
      }
    };
    const button = (
      <Tooltip title={state.selecting ? '选择中...' : title}>
        <Button
          aria-label={title}
          loading={state.selecting}
          disabled={disabled}
          size={size}
          onClick={onlyOneSource ? () => selectFromSource(enabledSources[0]) : undefined}
          style={{ flex: '0 0 auto', width: selectButtonWidth[size], paddingInline: 4 }}
        >
          {!state.selecting && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                width: '100%',
              }}
            >
              {icon}
              {!onlyOneSource && <DownOutlined style={{ fontSize: 9 }} />}
            </span>
          )}
        </Button>
      </Tooltip>
    );

    if (onlyOneSource) {
      return button;
    }

    return (
      <Dropdown
        disabled={disabled}
        trigger={['click']}
        menu={{
          items: enabledSources.map((source) => ({
            key: source,
            icon: source === 'local' ? icon : <CloudOutlined />,
            label: source === 'local'
              ? (isFolder ? '本地目录' : '本地文件')
              : (isFolder ? 'OBS目录' : 'OBS文件'),
          })),
          onClick: ({ key }) => selectFromSource(key as PathSource),
        }}
      >
        {button}
      </Dropdown>
    );
  };

  return (
    <>
      <Space.Compact className="dft-path-input" style={{ width: '100%' }}>
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
          <Tooltip title={state.value ? '打开路径' : '选择并打开'}>
            <Button
              aria-label="打开"
              icon={<FolderOpenOutlined />}
              loading={state.loading}
              disabled={disabled}
              size={size}
              onClick={handleOpenClick}
              style={{ flex: '0 0 auto', width: openButtonWidth[size], paddingInline: 4 }}
            />
          </Tooltip>
        )}
      </Space.Compact>
      <ObsViewer
        open={obsTarget !== null}
        spaceName={obsSpaceName}
        selectTarget={obsTarget ?? undefined}
        onCancel={() => setObsTarget(null)}
        onSelect={(path) => {
          state.setValue(path);
          setObsTarget(null);
        }}
      />
    </>
  );
};

export default PathInput;
