import React, { useMemo, useState } from 'react';
import { Breadcrumb, Button, Divider, Input, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd';
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

const { Text, Title } = Typography;

export type ObsSelectTarget = 'file' | 'folder';

interface ObsViewerProps {
  open: boolean;
  spaceName: string;
  selectTarget?: ObsSelectTarget;
  onCancel: () => void;
  onSelect?: (path: string) => void;
}

interface MockObsFile {
  key: string;
  name: string;
  type: ObsSelectTarget;
  size: string;
  updatedAt: string;
  owner: string;
  status: string;
}

const mockObsFiles: MockObsFile[] = [
  {
    key: '1',
    name: 'common-data',
    type: 'folder',
    size: '-',
    updatedAt: '2026-05-09 22:15',
    owner: 'DFT Platform',
    status: 'Synced',
  },
  {
    key: '2',
    name: 'design-tree',
    type: 'folder',
    size: '-',
    updatedAt: '2026-05-09 21:42',
    owner: 'Design Team',
    status: 'Synced',
  },
  {
    key: '3',
    name: 'normalized-table.json',
    type: 'file',
    size: '128 KB',
    updatedAt: '2026-05-08 19:10',
    owner: 'DFT Platform',
    status: 'Ready',
  },
  {
    key: '4',
    name: 'verification-template.tar.gz',
    type: 'file',
    size: '24.8 MB',
    updatedAt: '2026-05-07 17:36',
    owner: 'Verification Team',
    status: 'Ready',
  },
];

const folders = ['Root', 'common-data', 'design-tree', 'verification', 'reports'];

const ObsViewer: React.FC<ObsViewerProps> = ({
  open,
  spaceName,
  selectTarget,
  onCancel,
  onSelect,
}) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const selectedItem = useMemo(
    () => mockObsFiles.find((item) => item.key === selectedRowKeys[0]),
    [selectedRowKeys]
  );

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

  return (
    <Modal
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
      width="min(1100px, 94vw)"
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ background: 'var(--vscode-editor-background)', minHeight: 620 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '18px 22px',
            borderBottom: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
          }}
        >
          <Space size={12}>
            <div
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
            <div>
              <Title level={4} style={{ margin: 0, fontSize: 18 }}>
                {title}
              </Title>
              <Text type="secondary">Space: {spaceName}</Text>
            </div>
          </Space>
          <Space wrap>
            <Tag color="blue">Mock</Tag>
            <Tag color="green">spaceToken ready</Tag>
            {selectTarget && <Tag color="purple">{selectTarget}</Tag>}
          </Space>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '220px minmax(0, 1fr)',
            minHeight: 560,
          }}
        >
          <div
            style={{
              borderRight: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
              padding: 16,
              background: 'var(--vscode-sideBar-background, rgba(127,127,127,0.04))',
            }}
          >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {folders.map((item, index) => (
                <Button
                  key={item}
                  type={index === 0 ? 'primary' : 'text'}
                  icon={index === 0 ? <HomeOutlined /> : <FolderOpenOutlined />}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  {item}
                </Button>
              ))}
            </Space>
            <Divider style={{ margin: '18px 0' }} />
            <Space direction="vertical" size={6}>
              <Text type="secondary">Bucket</Text>
              <Text strong>dft-public-data</Text>
              <Text type="secondary">Objects</Text>
              <Text strong>1,284</Text>
              <Text type="secondary">Used</Text>
              <Text strong>36.2 GB</Text>
            </Space>
          </div>

          <div style={{ padding: 18 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <Breadcrumb
                items={[
                  { title: 'OBS' },
                  { title: spaceName },
                  { title: 'root' },
                ]}
              />
              <Space wrap>
                <Input prefix={<SearchOutlined />} placeholder="Search objects" style={{ width: 220 }} />
                <Tooltip title="Refresh">
                  <Button icon={<ReloadOutlined />} />
                </Tooltip>
                <Button icon={<UploadOutlined />}>Upload</Button>
                <Button icon={<CloudDownloadOutlined />}>Download</Button>
                <Tooltip title="Delete">
                  <Button danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Space>
            </div>

            <Table<MockObsFile>
              size="middle"
              pagination={false}
              rowSelection={{
                type: 'radio',
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
                  if (!selectTarget || record.type !== selectTarget) {
                    return;
                  }
                  onSelect?.(toObsPath(spaceName, record));
                  onCancel();
                },
              })}
              dataSource={mockObsFiles}
              columns={[
                {
                  title: 'Name',
                  dataIndex: 'name',
                  render: (name: string, record) => (
                    <Space>
                      {record.type === 'folder' ? (
                        <FolderOpenOutlined style={{ color: '#2563eb' }} />
                      ) : (
                        <FileTextOutlined style={{ color: '#16a34a' }} />
                      )}
                      <Text strong={record.type === 'folder'}>{name}</Text>
                    </Space>
                  ),
                },
                { title: 'Size', dataIndex: 'size', width: 110 },
                { title: 'Updated', dataIndex: 'updatedAt', width: 170 },
                { title: 'Owner', dataIndex: 'owner', width: 150 },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  width: 100,
                  render: (status: string) => <Tag color="green">{status}</Tag>,
                },
              ]}
            />

            <div
              style={{
                marginTop: 16,
                padding: 14,
                border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
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

function toObsPath(spaceName: string, item: MockObsFile): string {
  const suffix = item.type === 'folder' ? '/' : '';
  return `obs://${spaceName}/root/${item.name}${suffix}`;
}

export default ObsViewer;
