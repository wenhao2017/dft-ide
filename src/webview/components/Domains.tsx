import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import {
  addDomain,
  deleteDomain,
  fetchDomains,
  ProjectDomain,
  updateDomain,
} from '../services/projectService';
import dayjs from 'dayjs';

const { Text } = Typography;

interface Props {
  isDark?: boolean;
}

type DomainFormValue = {
  key: string;
  name: string;
};

const Domains: React.FC<Props> = ({ isDark = true }) => {
  const [domains, setDomains] = useState<ProjectDomain[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingDomain, setEditingDomain] = useState<ProjectDomain | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<DomainFormValue>();
  const queryClient = useQueryClient();
  const {
    data: domainsData,
    error: domainsError,
    isFetching: domainsFetching,
    refetch: refetchDomains,
  } = useQuery({
    queryKey: ['projectDomains', 0],
    queryFn: () => fetchDomains(),
  });

  const cardBorder = 'var(--vscode-panel-border, rgba(127,127,127,0.22))';
  const panelBg = isDark
    ? 'color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 96%, white)'
    : 'color-mix(in srgb, var(--vscode-editor-background, #fff) 92%, transparent)';

  const loadDomains = async () => {
    setLoading(true);
    try {
      const result = await refetchDomains();
      if (result.error) {
        throw result.error;
      }
      const data = result.data;
      if (!data) {
        return;
      }
      setDomains(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '领域列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!domainsData) return;
    setDomains(domainsData);
    setError(null);
  }, [domainsData]);

  useEffect(() => {
    if (!domainsError) return;
    setError(domainsError instanceof Error ? domainsError.message : '领域列表加载失败');
  }, [domainsError]);

  useEffect(() => {
    setLoading(domainsFetching);
  }, [domainsFetching]);

  const openAddModal = () => {
    setEditingDomain(null);
    form.setFieldsValue({ key: '', name: '' });
    setModalOpen(true);
  };

  const openEditModal = (domain: ProjectDomain) => {
    setEditingDomain(domain);
    form.setFieldsValue({
      key: domain.key,
      name: domain.name,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingDomain(null);
    form.resetFields();
  };

  const saveDomain = async () => {
    const value = await form.validateFields();
    setSaving(true);
    try {
      if (editingDomain) {
        const updated = await updateDomain(editingDomain.key, {
          ...editingDomain,
          key: value.key.trim(),
          name: value.name.trim(),
        });
        setDomains((items) => items.map((item) => item.key === editingDomain.key ? updated : item));
        message.success('领域已更新');
      } else {
        const created = await addDomain({
          key: value.key.trim(),
          name: value.name.trim(),
        });
        setDomains((items) => [...items, created]);
        message.success('领域已添加');
      }
      closeModal();
      void queryClient.invalidateQueries({ queryKey: ['projectDomains', ''] });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '领域保存失败');
    } finally {
      setSaving(false);
    }
  };

  const removeDomain = async (domain: ProjectDomain) => {
    try {
      await deleteDomain(domain.key);
      setDomains((items) => items.filter((item) => item.key !== domain.key));
      void queryClient.invalidateQueries({ queryKey: ['projectDomains', ''] });
      message.success('领域已删除');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '领域删除失败');
    }
  };

  const columns = useMemo<ColumnsType<ProjectDomain>>(() => [
    {
      title: '编码',
      dataIndex: 'key',
      key: 'key',
      width: 180,
      render: (value: string) => (
        <Tag color={'blue'}>{value}</Tag>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (value: string, record) => (
        <Text strong>{value}</Text>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      ellipsis: true,
      render: (value?: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss') || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      align: 'right',
      render: (_, record) => {
        return (
          <Space size={8}>
            <Tooltip title={'修改领域'}>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditModal(record)}
              />
            </Tooltip>
            <Tooltip title={'删除领域'}>
              <span>
                <Popconfirm
                  title="删除领域"
                  description={`确认删除 ${record.name} 吗？`}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => removeDomain(record)}
                >
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                  />
                </Popconfirm>
              </span>
            </Tooltip>
          </Space>
        );
      },
    },
  ], []);

  return (
    <Card
      title={
        <Space>
          <PartitionOutlined />
          <span>管理领域</span>
        </Space>
      }
      extra={
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadDomains} loading={loading}>
            刷新
          </Button>
          <Tooltip title={'增加领域'}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
              增加领域
            </Button>
          </Tooltip>
        </Space>
      }
      style={{ borderRadius: 8, border: `1px solid ${cardBorder}`, background: panelBg }}
      styles={{body: {padding: 16}}}
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        {error && (
          <Alert
            type="warning"
            showIcon
            message="领域服务暂不可用"
            description={error}
          />
        )}

        <Table<ProjectDomain>
          rowKey="key"
          loading={loading}
          columns={columns}
          dataSource={domains}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ x: 760 }}
        />
      </Space>

      <Modal
        title={editingDomain ? '修改领域' : '增加领域'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={saveDomain}
        okText={editingDomain ? '保存' : '添加'}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={true}>
          <Form.Item label="编码" name="key" rules={[{ required: true, message: '请输入领域编码' }]}>
            <Input disabled={Boolean(editingDomain)} />
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入领域名称' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Domains;
