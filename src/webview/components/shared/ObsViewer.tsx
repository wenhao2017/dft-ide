import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Breadcrumb, Button, Divider, Input, Modal, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import {
  CloudDownloadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { downloadObsPath, listObsChildren, type ObsChildItemDto } from '../../utils/ipc';

const { Text, Title } = Typography;
const OBS_ROOT_PATH = '/';

export type ObsSelectTarget = 'file' | 'folder';

interface ObsViewerProps {
  open: boolean;
  spaceName: string;
  selectTarget?: ObsSelectTarget;
  readOnly?: boolean;
  onCancel: () => void;
  onSelect?: (path: string) => void;
}

interface ObsFile {
  key: string;
  name: string;
  path: string;
  type: ObsSelectTarget;
  size?: string | number;
  updatedAt?: string;
  versionId?: string;
}

const ObsViewer: React.FC<ObsViewerProps> = ({
  open,
  spaceName,
  selectTarget,
  readOnly = false,
  onCancel,
  onSelect,
}) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState(OBS_ROOT_PATH);
  const [items, setItems] = useState<ObsFile[]>([]);
  const [search, setSearch] = useState('');

  const loadPath = useCallback(async (remotePath: string) => {
    setLoading(true);
    try {
      const result = await listObsChildren(spaceName, remotePath);
      if (!result.success) {
        message.error(result.error ?? 'Failed to load OBS directory');
        return;
      }
      setCurrentPath(remotePath);
      setItems(result.items.map((item: ObsChildItemDto) => ({ ...item })));
      setSelectedRowKeys([]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to load OBS directory');
    } finally {
      setLoading(false);
    }
  }, [spaceName]);

  useEffect(() => {
    if (open) {
      void loadPath(OBS_ROOT_PATH);
    }
  }, [open, loadPath]);

  const selectedItem = useMemo(
    () => items.find((item) => item.key === selectedRowKeys[0]),
    [items, selectedRowKeys]
  );
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items;
  }, [items, search]);
  const folderItems = useMemo(() => items.filter((item) => item.type === 'folder'), [items]);
  const breadcrumbItems = useMemo(() => {
    const segments = currentPath.split('/').filter(Boolean);
    return [
      { title: 'OBS' },
      { title: spaceName, onClick: () => void loadPath(OBS_ROOT_PATH) },
      ...segments.map((segment, index) => ({
        title: segment,
        onClick: () => void loadPath(`/${segments.slice(0, index + 1).join('/')}`),
      })),
    ];
  }, [currentPath, loadPath, spaceName]);

  const canSelect = Boolean(selectTarget && selectedItem?.type === selectTarget);
  const title = selectTarget
    ? `Select OBS ${selectTarget === 'folder' ? 'Folder' : 'File'}`
    : 'OBS Viewer';

  const handleSelect = () => {
    if (!selectedItem || !selectTarget || selectedItem.type !== selectTarget) {
      return;
    }
    onSelect?.(toObsPath(spaceName, selectedItem));
    onCancel();
  };

  const handleDownload = async () => {
    if (!selectedItem) return;
    setDownloading(true);
    try {
      const result = await downloadObsPath(toObsPath(spaceName, selectedItem), selectedItem.type);
      if (result.cancelled) return;
      if (!result.success) {
        message.error(result.error ?? 'OBS download failed');
        return;
      }
      const suffix = typeof result.downloadedFiles === 'number'
        ? ` (${result.downloadedFiles} files${result.failedFiles ? `, ${result.failedFiles} failed` : ''})`
        : '';
      message.success(`OBS download completed${suffix}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'OBS download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      className="dft-obs-modal"
      title={null}
      open={open}
      onCancel={onCancel}
      footer={selectTarget ? (
        <Space>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" disabled={!canSelect} onClick={handleSelect}>
            Select
          </Button>
        </Space>
      ) : null}
      width="min(1040px, 96vw)"
      styles={{ body: { padding: 0, overflow: 'hidden' } }}
    >
      <style>
        {`
          .dft-obs-viewer {
            background: var(--vscode-editor-background);
            height: min(680px, calc(92vh - 96px));
            min-height: 420px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          .dft-obs-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 14px 18px;
            border-bottom: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.22));
            flex-shrink: 0;
          }

          .dft-obs-title {
            min-width: 0;
          }

          .dft-obs-tags {
            flex: 0 0 auto;
          }

          .dft-obs-layout {
            display: grid;
            grid-template-columns: clamp(168px, 22vw, 220px) minmax(0, 1fr);
            min-height: 0;
            flex: 1;
          }

          .dft-obs-sidebar {
            border-right: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.22));
            padding: 12px;
            background: var(--vscode-sideBar-background, rgba(127,127,127,0.04));
            min-width: 0;
            overflow: auto;
          }

          .dft-obs-main {
            padding: 14px;
            min-width: 0;
            overflow: auto;
          }

          .dft-obs-toolbar {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 8px;
            margin-bottom: 12px;
          }

          .dft-obs-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            flex-wrap: nowrap;
          }

          .dft-obs-search {
            flex: 1 1 auto;
            min-width: 160px;
            max-width: 360px;
          }

          .dft-obs-actions .ant-btn,
          .dft-obs-actions .ant-input-affix-wrapper {
            height: 32px;
          }

          .dft-obs-icon-button {
            width: 34px;
            padding-inline: 0;
          }

          .dft-obs-table .ant-table {
            min-width: 720px;
          }

          .dft-obs-table .ant-table-cell {
            white-space: nowrap;
          }

          .dft-obs-name {
            min-width: 0;
            max-width: 260px;
          }

          .dft-obs-name .ant-typography {
            max-width: 220px;
          }

          .dft-obs-preview {
            margin-top: 12px;
            padding: 12px;
            border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.22));
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
          }

          @media (max-width: 900px) {
            .dft-obs-action-label {
              display: none;
            }

            .dft-obs-actions .ant-btn {
              width: 34px;
              padding-inline: 0;
            }

            .dft-obs-search {
              min-width: 140px;
            }
          }

          @media (max-width: 720px) {
            .dft-obs-viewer {
              height: min(720px, calc(94vh - 76px));
            }

            .dft-obs-header {
              padding: 10px 12px;
              align-items: flex-start;
            }

            .dft-obs-header-icon {
              display: none !important;
            }

            .dft-obs-tags {
              display: none;
            }

            .dft-obs-layout {
              display: flex;
              flex-direction: column;
            }

            .dft-obs-sidebar {
              border-right: 0;
              border-bottom: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.22));
              padding: 8px;
              flex: 0 0 auto;
            }

            .dft-obs-folder-list {
              display: flex !important;
              flex-direction: row !important;
              gap: 6px;
              overflow-x: auto;
              padding-bottom: 2px;
            }

            .dft-obs-folder-list .ant-space-item {
              flex: 0 0 auto;
            }

            .dft-obs-folder-list .ant-btn {
              width: auto !important;
            }

            .dft-obs-stats {
              display: none !important;
            }

            .dft-obs-main {
              padding: 10px;
            }

            .dft-obs-toolbar .ant-breadcrumb {
              white-space: nowrap;
              overflow-x: auto;
            }

            .dft-obs-actions {
              flex-wrap: nowrap;
              overflow-x: auto;
              padding-bottom: 2px;
            }

            .dft-obs-search {
              min-width: 150px;
              flex: 0 0 auto;
            }

            .dft-obs-preview {
              display: none;
            }
          }
        `}
      </style>
      <div className="dft-obs-viewer">
        <div
          className="dft-obs-header"
          style={{
          }}
        >
          <Space size={12}>
            <div
              className="dft-obs-header-icon"
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(37,99,235,0.14)',
                color: '#2563eb',
              }}
            >
              <DatabaseOutlined />
            </div>
            <div className="dft-obs-title">
              <Title level={4} style={{ margin: 0, fontSize: 18 }}>
                {title}
              </Title>
              <Text type="secondary" ellipsis={{ tooltip: `Space: ${spaceName}` }}>Space: {spaceName}</Text>
            </div>
          </Space>
          <Space wrap className="dft-obs-tags">
            {readOnly ? <Tag color="error">Read Only / 仅读</Tag> : <Tag color="processing">Read / Write</Tag>}
            <Tag color="green">spaceToken ready</Tag>
            {selectTarget && <Tag color="purple">{selectTarget}</Tag>}
          </Space>
        </div>

        <div
          className="dft-obs-layout"
          style={{
          }}
        >
          <div
            className="dft-obs-sidebar"
            style={{
            }}
          >
            <Space direction="vertical" size={8} className="dft-obs-folder-list" style={{ width: '100%' }}>
              <Button
                type={currentPath === OBS_ROOT_PATH ? 'primary' : 'text'}
                icon={<HomeOutlined />}
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => void loadPath(OBS_ROOT_PATH)}
              >
                Root
              </Button>
              {folderItems.map((item) => (
                <Button
                  key={item.key}
                  type="text"
                  icon={<FolderOpenOutlined />}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                  onClick={() => void loadPath(item.path)}
                >
                  {item.name}
                </Button>
              ))}
            </Space>
            <Divider className="dft-obs-stats" style={{ margin: '14px 0' }} />
            <Space className="dft-obs-stats" direction="vertical" size={4}>
              <Text type="secondary">Bucket</Text>
              <Text strong>{spaceName}</Text>
              <Text type="secondary">Objects</Text>
              <Text strong>{items.length}</Text>
            </Space>
          </div>

          <div className="dft-obs-main">
            <div
              className="dft-obs-toolbar"
            >
              <div style={{ minWidth: 0 }}>
                <Breadcrumb
                  items={breadcrumbItems}
                />
              </div>
              <div className="dft-obs-actions">
                <Input
                  className="dft-obs-search"
                  prefix={<SearchOutlined />}
                  placeholder="Search objects"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Tooltip title="Refresh">
                  <Button
                    className="dft-obs-icon-button"
                    icon={<ReloadOutlined />}
                    loading={loading}
                    onClick={() => void loadPath(currentPath)}
                  />
                </Tooltip>
                {!readOnly && (
                  <Tooltip title="Upload">
                    <Button icon={<UploadOutlined />}><span className="dft-obs-action-label">Upload</span></Button>
                  </Tooltip>
                )}
                <Tooltip title="Download">
                  <Button
                    icon={<CloudDownloadOutlined />}
                    disabled={!selectedItem}
                    loading={downloading}
                    onClick={() => void handleDownload()}
                  ><span className="dft-obs-action-label">Download</span></Button>
                </Tooltip>
                {!readOnly && (
                  <Tooltip title="Delete">
                    <Button className="dft-obs-icon-button" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                )}
              </div>
            </div>

            <Table<ObsFile>
              className="dft-obs-table"
              size="small"
              pagination={false}
              loading={loading}
              scroll={{ x: 720 }}
              rowSelection={{
                type: 'radio',
                columnWidth: 36,
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                getCheckboxProps: (record) => ({
                  disabled: Boolean(selectTarget && record.type !== selectTarget),
                }),
              }}
              onRow={(record) => ({
                onClick: () => {
                  if (!selectTarget || record.type === selectTarget) {
                    setSelectedRowKeys([record.key]);
                  }
                },
                onDoubleClick: () => {
                  if (record.type === 'folder' && selectTarget !== 'folder') {
                    void loadPath(record.path);
                    return;
                  }
                  if (!selectTarget || record.type !== selectTarget) {
                    return;
                  }
                  onSelect?.(toObsPath(spaceName, record));
                  onCancel();
                },
              })}
              dataSource={visibleItems}
              columns={[
                {
                  title: 'Name',
                  dataIndex: 'name',
                  render: (name: string, record) => (
                    <Space className="dft-obs-name" size={8}>
                      {record.type === 'folder' ? (
                        <FolderOpenOutlined style={{ color: '#2563eb' }} />
                      ) : (
                        <FileTextOutlined style={{ color: '#16a34a' }} />
                      )}
                      <Text strong={record.type === 'folder'} ellipsis={{ tooltip: name }}>{name}</Text>
                    </Space>
                  ),
                },
                { title: 'Size', dataIndex: 'size', width: 82 },
                { title: 'Updated', dataIndex: 'updatedAt', width: 150 },
                {
                  title: 'Version',
                  dataIndex: 'versionId',
                  width: 120,
                  render: (versionId?: string) => versionId ? <Tag color="green">{versionId}</Tag> : <Text type="secondary">-</Text>,
                },
              ]}
            />

            <div
              className="dft-obs-preview"
            >
              <Space direction="vertical" size={2}>
                <Text strong>Preview request</Text>
                <Text type="secondary">GET /api/obs/space-token?group=dft&name={spaceName}</Text>
              </Space>
              <Space>
                <Tag>fs-signature</Tag>
                <Tag>token</Tag>
                <Tag>w3id</Tag>
              </Space>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

function toObsPath(spaceName: string, item: ObsFile): string {
  const suffix = item.type === 'folder' ? '/' : '';
  return `obs://${spaceName}${item.path.replace(/\/+$/, '')}${suffix}`;
}

export default ObsViewer;
