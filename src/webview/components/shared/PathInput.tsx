import React, { useState } from 'react';
import { Button, Dropdown, Input, Space } from 'antd';
import { CloudOutlined, DownOutlined, FileOutlined, FolderOpenOutlined, FolderOutlined } from '@ant-design/icons';
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
  const [obsTarget, setObsTarget] = useState<ObsSelectTarget | null>(null);
  const activeProject = useWizardStore((store) => store.activeProject);
  const obsSpaceName = activeProject?.name ?? 'dft-ide-workspace';
  const canSelectFolder = showSelect || showSelectFolder;
  const canSelectFile = showSelect || showSelectFile;

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
        loading={state.loading}
        disabled={disabled}
        size={size}
        style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
      >
        {target === 'folder' ? '选择目录' : '选择文件'}
        <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />
      </Button>
    </Dropdown>
  );

  return (
    <>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={state.value}
          onChange={(event) => state.setValue(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          size={size}
          allowClear
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
