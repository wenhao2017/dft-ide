import React, { useEffect, useState } from 'react';
import { Button, Input, Space, Tag, Tooltip, message } from 'antd';
import { CloudOutlined } from '@ant-design/icons';
import ObsViewer from '../shared/ObsViewer';

interface TemporaryObsBrowserProps {
  defaultSpaceName?: string;
}

/**
 * Temporary manual entry for browsing and downloading OBS files.
 * Remove this file plus its single import/render in CommonFlow when no longer needed.
 */
const TemporaryObsBrowser: React.FC<TemporaryObsBrowserProps> = ({ defaultSpaceName = '' }) => {
  const [draftSpaceName, setDraftSpaceName] = useState(defaultSpaceName);
  const [activeSpaceName, setActiveSpaceName] = useState(defaultSpaceName);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDraftSpaceName((current) => current.trim() ? current : defaultSpaceName);
  }, [defaultSpaceName]);

  const openBrowser = () => {
    const spaceName = draftSpaceName.trim();
    if (!spaceName) {
      message.warning('请输入 OBS Space 名称');
      return;
    }
    setActiveSpaceName(spaceName);
    setOpen(true);
  };

  return (
    <>
      <Space.Compact>
        <Input
          value={draftSpaceName}
          onChange={(event) => setDraftSpaceName(event.target.value)}
          onPressEnter={openBrowser}
          placeholder="OBS Space"
          aria-label="OBS Space"
          style={{ width: 180 }}
        />
        <Tooltip title="临时浏览和下载 OBS 文件">
          <Button icon={<CloudOutlined />} onClick={openBrowser}>
            浏览 OBS
          </Button>
        </Tooltip>
      </Space.Compact>
      <Tag color="orange" style={{ marginInlineStart: 0 }}>临时入口</Tag>

      <ObsViewer
        open={open}
        spaceName={activeSpaceName}
        onCancel={() => setOpen(false)}
      />
    </>
  );
};

export default TemporaryObsBrowser;
