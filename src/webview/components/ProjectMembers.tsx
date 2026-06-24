import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  Dropdown,
  Avatar,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  GitlabOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  addProjectMember,
  canManageProjectMembers,
  deleteProjectMember,
  DftProject,
  fetchUsers,
  fetchSingleUser,
  fetchProjectMembers,
  UserInfo,
  ProjectMember,
  ProjectMemberRole,
  updateProjectMember,
} from '../services/projectService';
import dayjs from 'dayjs';
import {openExternalUrl} from '../utils/ipc';
import {getGitlabHost} from '../../services/gitlabService';

const { Text, Title } = Typography;

interface Props {
  project: DftProject;
  isDark?: boolean;
}

type MemberFormValue = {
  employeeIds: string[];
  role: ProjectMemberRole;
  ctmp: boolean;
};

const roleOptions: Array<{ label: string; value: ProjectMemberRole }> = [
  { label: 'DFTM', value: 'DFTM' },
  { label: 'Member', value: 'Member' },
];

const ProjectMembers: React.FC<Props> = ({ project, isDark = true }) => {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [canManage, setCanManage] = useState(canManageProjectMembers(project));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<ProjectMember | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<MemberFormValue>();

  const cardBorder = 'var(--vscode-panel-border, rgba(127,127,127,0.22))';
  const panelBg = isDark
    ? 'color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 96%, white)'
    : 'color-mix(in srgb, var(--vscode-editor-background, #fff) 92%, transparent)';

  const loadUsers = async () => {
    const data = await fetchUsers();
    const users = data.filter(user =>
      /^[a-z]+[0-9]+$/.test(user.username)
    );
    setUsers(users);
  };

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data = await fetchProjectMembers(project.id);
      setMembers(data.members);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '成员列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, [project.id]);

  const openAddModal = () => {
    loadUsers();
    setEditingMember(null);
    form.setFieldsValue({ employeeIds: [], role: 'Member', ctmp: false });
    setModalOpen(true);
  };

  const openEditModal = (member: ProjectMember) => {
    setEditingMember(member);
    form.setFieldsValue({
      employeeIds: [member.employeeId],
      role: member.role,
      ctmp: member.ctmp,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingMember(null);
    form.resetFields();
  };

  const handleChange = async (values: string[]) => {
    values = values.filter(value => value.trim());
    form.setFieldValue('employeeIds', values);
    if (!values || values.length === 0) return;

    const lastNotInUsers = values.slice().reverse().find(value => {
      return !users.some(user => user.username.toLowerCase() === value.toLowerCase());
    });
    if (lastNotInUsers) {
      const user = await fetchSingleUser(lastNotInUsers);
      if (user) {
        if (user.locked) {
          message.warning(`Gitlab 用户 ${lastNotInUsers} 已被锁定, 请联系管理员进行解锁`);
        } else if (user.state !== 'active') {
          if(user.state === 'deactivated'){
            message.warning(
              <span>
                Gitlab 用户 {lastNotInUsers} 的状态为 {user.state}(已停用), 可能是长时间未登录导致.<br />
                请用户登录个人主页{' '}
                <a href={user.web_url} target="_blank" rel="noopener noreferrer">
                  {user.web_url}
                </a>{' '}
                后重试或联系管理员进行恢复
              </span>
            );
          }else{
            message.warning(`Gitlab 用户 ${lastNotInUsers} 的状态为 ${user.state}, 请联系管理员进行恢复`);
          }
        } else {
          setUsers((items) => [...items, user]);
        }
      } else {
        const webUrl = getGitlabHost();
        message.error(
          <span>
            Gitlab 用户 {lastNotInUsers} 不存在.
            请用户登录 Gitlab 网址{' '}
            <a href={webUrl} target="_blank" rel="noopener noreferrer">
              {webUrl}
            </a>{' '}
            后重试或联系管理员进行添加
          </span>
        );
        form.setFieldValue('employeeIds', values.filter(value => value !== lastNotInUsers));
      }
    }
  };

  const validateEmployeeIds = async (values: string[]) => {
    values = values.filter(value => value.trim());
    if (!values || values.length === 0) {
      return Promise.reject('请选择工号');
    }

    const validPattern = /^[a-z0-9_-]+$/;
    const isValid = values.every(value => { return validPattern.test(value) });
    if (!isValid) {
      return Promise.reject('工号只能包含小写字母、数字、下划线或短横线');
    }

    return Promise.resolve();
  }

  const saveMember = async () => {
    const value = await form.validateFields();
    setSaving(true);
    try {
      if (editingMember) {
        const updated = await updateProjectMember(project.id, editingMember.employeeId, {
          ...editingMember,
          role: value.role,
          ctmp: value.ctmp,
        });
        setMembers((items) => items.map((item) => item.employeeId === editingMember.employeeId ? updated : item));
        message.success('成员已更新');
      } else {
        let count = 0;
        for (const employeeId of value.employeeIds) {
          const isExists = members.some(member => member.employeeId === employeeId.trim());
          if (isExists) {
            message.info(`成员 ${employeeId} 已存在`);
          } else {
            const created = await addProjectMember(project.id, {
              employeeId: employeeId.trim(),
              role: value.role,
              ctmp: value.ctmp,
            });
            setMembers((items) => [...items, created]);
            count += 1;
          }
          form.setFieldValue('employeeIds', value.employeeIds.filter(id => id !== employeeId));
        }
        if (count > 0) {
          message.success('成员已添加');
        }
      }
      closeModal();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '成员保存失败');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (member: ProjectMember) => {
    try {
      await deleteProjectMember(project.id, member.employeeId);
      setMembers((items) => items.filter((item) => item.employeeId !== member.employeeId));
      message.success('成员已删除');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '成员删除失败');
    }
  };

  const openGitlabMemberPage = async (webUrl: string | undefined) => {
    if (webUrl) {
      const result = await openExternalUrl(`${webUrl}/-/project_members`);
      if (!result.success) {
        message.error(result.error ?? '无法打开浏览器, 请检查系统默认设置');
      }
    } else {
      message.error('Gitlab 成员管理页面地址为空');
    }
  }

  const columns = useMemo<ColumnsType<ProjectMember>>(() => [
    {
      title: '工号',
      dataIndex: 'employeeId',
      key: 'employeeId',
      width: 180,
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          {record.name && <Text type="secondary" style={{ fontSize: 12 }}>{record.name}</Text>}
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 140,
      render: (role: ProjectMemberRole) => (
        <Tag color={role === 'DFTM' ? 'blue' : 'default'}>{role}</Tag>
      ),
    },
    {
      title: 'CTMP',
      dataIndex: 'ctmp',
      key: 'ctmp',
      width: 120,
      render: (ctmp: boolean) => <Tag color={ctmp ? 'green' : 'default'}>{ctmp ? '是' : '否'}</Tag>,
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
        const deleteDisabled = !canManage || record.ctmp;
        return (
          <Space size={8}>
            <Tooltip title={canManage ? '修改成员' : '无成员管理权限'}>
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={!canManage}
                onClick={() => openEditModal(record)}
              />
            </Tooltip>
            <Tooltip title={record.ctmp ? 'CTMP 成员不能删除' : canManage ? '删除成员' : '无成员管理权限'}>
              <span>
                <Popconfirm
                  title="删除成员"
                  description={`确认删除 ${record.employeeId} 吗？`}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  disabled={deleteDisabled}
                  onConfirm={() => removeMember(record)}
                >
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    disabled={deleteDisabled}
                  />
                </Popconfirm>
              </span>
            </Tooltip>
          </Space>
        );
      },
    },
  ], [canManage]);

  return (
    <Card
      title={
        <Space>
          <TeamOutlined />
          <span>管理成员</span>
        </Space>
      }
      extra={
        <Space wrap>
          <Dropdown
            menu={{
              items: project.repos?.map(repo => ({
                label: repo.key,
                key: repo.key,
                onClick: () => openGitlabMemberPage(repo.web_url)
              })) || []
            }}
            disabled={!canManage}
          >
            <Tooltip title="打开 Gitlab 成员管理页面">
              <Button icon={<GitlabOutlined />} />
            </Tooltip>
          </Dropdown>
          <Button icon={<ReloadOutlined />} onClick={loadMembers} loading={loading}>
            刷新
          </Button>
          <Tooltip title={canManage ? '增加成员' : '当前项目不是 DFTM 角色，不能管理成员'}>
            <Button type="primary" icon={<PlusOutlined />} disabled={!canManage} onClick={openAddModal}>
              增加成员
            </Button>
          </Tooltip>
        </Space>
      }
      style={{ borderRadius: 8, border: `1px solid ${cardBorder}`, background: panelBg }}
      styles={{body: {padding: 16}}}

    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{project.name}</Title>
          <Space wrap style={{ marginTop: 8 }}>
            <Tag color="processing">当前角色：{project.role}</Tag>
            <Tag color={canManage ? 'green' : 'default'}>{canManage ? '可管理成员' : '无管理权限'}</Tag>
          </Space>
        </div>

        {!canManage && (
          <Alert
            type="info"
            showIcon
            message="当前用户没有成员管理权限"
            description="只有当前项目角色为 DFTM 的用户可以增加、删除或修改成员。"
          />
        )}

        {error && (
          <Alert
            type="warning"
            showIcon
            message="成员服务暂不可用"
            description={error}
          />
        )}

        <Table<ProjectMember>
          rowKey="employeeId"
          loading={loading}
          columns={columns}
          dataSource={members}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ x: 760 }}
        />
      </Space>

      <Modal
        title={editingMember ? '修改成员' : '增加成员'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={saveMember}
        okText={editingMember ? '保存' : '添加'}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={true}>
          <Form.Item
            label="工号"
            name="employeeIds"
            rules={[
              {
                validator: (_, value) => {
                  return validateEmployeeIds(value);
                },
              }
            ]}
          >
            <Select
              mode="tags"
              disabled={Boolean(editingMember)}
              placeholder="Search or Input "
              options={users.map(user => ({
                label: (
                  <>
                    <Avatar
                      size="small"
                      src={user.avatar_url}
                      style={{
                        width: 20,
                        height: 20,
                        marginRight: 8
                      }}
                    >
                      {user.name.charAt(0)}
                    </Avatar>
                    {user.name}
                  </>
                ),
                value: user.username
              }))}
              onChange={handleChange}
            />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item label="CTMP" name="ctmp" rules={[{ required: true, message: '请选择 CTMP 标识' }]}>
            <Select
              options={[
                { label: '是', value: true },
                { label: '否', value: false },
              ]}
              disabled
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ProjectMembers;
