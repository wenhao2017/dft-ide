import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Col, Input, Progress, Row, Spin, Tag, Tooltip, message, Form, Modal } from "antd";
import Card from "antd/es/card";
import Empty from "antd/es/empty";
import List from "antd/es/list";
import Space from "antd/es/space";
import Typography from "antd/es/typography";

import {
  CheckCircleOutlined,
  CloudSyncOutlined,
  FolderAddOutlined,
  ExperimentOutlined,
  FileProtectOutlined,
  FolderOpenOutlined,
  LineChartOutlined,
  RocketOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  getCurrentUser,
  getLocalConfigInfo,
  openProjectWorkspace,
  prepareProjectWorkspace,
  selectPath,
  enterProjectWorkspace,
  LocalConfigInfo,
} from '../utils/ipc';
import useWizardStore from '../store/wizardStore';
import {
  DftProject,
  fetchProjectDashboard,
  createProject,
  initProject,
  ProjectDashboard,
  ProjectRepoStatus,
  updateProjectRootPath,
} from '../services/projectService';

const { Paragraph, Text, Title } = Typography;

interface Props {
  isDark?: boolean;
  onNavigate?: (category: string) => void;
  onManageMembers?: (project: DftProject) => void;
}

const flows = [
  {
    key: 'Common',
    label: '公共配置',
    title: '公共基础配置',
    desc: '管理工作区路径、Design Tree 结构、Git 协同及本地状态。',
    icon: <SettingOutlined />,
    accent: '#2563eb',
    status: 'Ready',
  },
  {
    key: 'Hibist',
    label: '设计流程 (Hibist)',
    title: 'DFT 设计 (Hibist)',
    desc: '按模块管理工具版本、集群资源选择、执行参数配置和设计结果。',
    icon: <RocketOutlined />,
    accent: '#7c3aed',
    status: 'Ready',
  },
  {
    key: 'Sailor',
    label: '设计流程 (Sailor)',
    title: 'DFT 设计 (Sailor)',
    desc: '按模块管理工具版本、集群资源选择、执行参数配置和设计结果。',
    icon: <ThunderboltOutlined />,
    accent: '#0ea5e9',
    status: 'Ready',
  },
  {
    key: 'Verification',
    label: '仿真验证 (Lander)',
    title: '仿真与验证 (Lander)',
    desc: '按模块管理仿真套件、自动化测试用例运行、日志与覆盖率结果。',
    icon: <CheckCircleOutlined />,
    accent: '#059669',
    status: 'Ready',
  },
  {
    key: 'Formal',
    label: '形式验证',
    title: '形式验证 (规划中)',
    desc: '形式化等价性检查工具链配置、任务执行与结果归档。',
    icon: <ExperimentOutlined />,
    accent: '#d97706',
    status: 'Planned',
    disabled: true,
  },
  {
    key: 'STA',
    label: '静态时序',
    title: '静态时序 (规划中)',
    desc: '静态时序分析配置、检查执行与报告归档。',
    icon: <LineChartOutlined />,
    accent: '#dc2626',
    status: 'Planned',
    disabled: true,
  },
];

function repoTagColor(status: ProjectRepoStatus['status']): string {
  if (status === 'ready') return 'green';
  if (status === 'missing') return 'orange';
  return 'default';
}

type ProjectFormValue = {
  name: string;
  description: string;
};

const Welcome: React.FC<Props> = ({ isDark = true, onNavigate, onManageMembers }) => {
  const {setFlowContext, setActiveProject, currentUser, setCurrentUser} = useWizardStore();
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null);
  const [projects, setProjects] = useState<DftProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [workingProjectId, setWorkingProjectId] = useState<string | null>(null);
  const [initializingProjectId, setInitializingProjectId] = useState<string | null>(null);
  const [initializingProgress, setInitializingProgress] = useState(0);
  const [projectKeyword, setProjectKeyword] = useState('');
  const [localRootInfo, setLocalRootInfo] = useState<LocalConfigInfo | null>(null);
  const [projectId, setProjectId] = useState('');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectForm] = Form.useForm<ProjectFormValue>();
  const [projectSaving, setProjectSaving] = useState(false);

  const cardBorder = 'var(--vscode-panel-border, rgba(127,127,127,0.18))';
  const panelBg = isDark
    ? 'color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 96%, white)'
    : 'color-mix(in srgb, var(--vscode-editor-background, #fff) 92%, transparent)';

  const currentProject = useMemo(() => {
    if (!dashboard) return null;
    dashboard.currentProjectId = projectId;
    return dashboard.projects.find((item) => item.id === projectId) ?? null;
  }, [projectId, dashboard]);

  const filteredProjects = useMemo(() => {
    const keyword = projectKeyword.trim().toLowerCase();
    if (!keyword) return projects;
    return projects?.filter((project) =>
      [project.name, project.id, project.owner, project.role].some((text) => text.toLowerCase().includes(keyword))
    );
  }, [dashboard, projects, projectKeyword]);

  const fetchProjectData = async () => {
    setLoadingProjects(true);
    try {
      const data = await fetchProjectDashboard(currentUser);
      setDashboard(data);
      setProjects(data.projects);
      setProjectError(null);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : '项目列表加载失败');
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    let disposed = false;

    fetchProjectData();

    return () => {
      disposed = true;
    };
  }, [currentUser]);

  useEffect(() => {
    let disposed = false;

    getCurrentUser()
      .then((user) => {
        if (disposed) return;
        setCurrentUser(user);
      })
      .catch((error) => {
        if (!disposed) {
          message.warning(error instanceof Error ? error.message : '当前用户读取失败');
        }
      });

    getLocalConfigInfo()
      .then((info) => {
        if (disposed) return;
        setLocalRootInfo(info);
        setProjectId(info.lastSelectedProject??'');
      })
      .catch((error) => {
        if (!disposed) {
          message.warning(error instanceof Error ? error.message : '本地托管目录读取失败');
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  const enterProject = async (project: DftProject, rootPath?: string) => {
    setWorkingProjectId(project.id);
    try {
      if(!project.rootPath && !rootPath) {
        chooseProjectsRoot(project, true);
        return;
      }
      const result = await enterProjectWorkspace(project);
      if (result.success && result.projectPath) {
        const openResult = await openProjectWorkspace(result.projectPath);
        if (!openResult.success) {
          message.error(openResult.error ?? '项目工作区打开失败');
          return;
        }
        setActiveProject({
          id: project.id,
          name: project.name,
          rootPath: result.projectPath,
          role: project.role,
          canManageMembers: project.canManageMembers,
        });
        setDashboard((prev) => prev ? { ...prev, currentProjectId: project.id } : prev);
        if (onNavigate) {
          onNavigate('Common');
        } else {
          setFlowContext({ category: 'Common', projectId: project.id });
        }
        message.success('进入项目成功');
      } else {
        message.error(result.error ?? '进入项目失败');
      }

    } finally {
      setWorkingProjectId(null);
    }
  };

  const setProjectRoot = async (project: DftProject, porjectRootPath: string) => {
    setProjects(projects?.map(item =>
      (item.id === project.id && item.ctmp_id === project.ctmp_id) ? { ...item, rootPath: porjectRootPath } : item
    ));
    // 请求后端保存项目目录数据
    try {
      await updateProjectRootPath(project.id, currentUser ,porjectRootPath);
      return { success: true };
    } catch (err) {
      message.error(err instanceof Error ? err.message : '项目目录保存失败');
      return { success: false };
    }
  };

  const isProjectInitialized = (project: DftProject) =>
    project.repos.length > 0 && project.repos.every((repo) => repo.status === 'ready');

  const isProjectInitializeDisable = (project: DftProject) =>
    isProjectInitialized(project) || project.role !== 'DFTM';

  const isMemberManageDisable = (project: DftProject) =>
    !isProjectInitialized(project) || project.role !== 'DFTM';

  const isProjectEnterDisable = (project: DftProject) =>
    !isProjectInitialized(project);

  const projectInitializeTooltipTitle = (project: DftProject) => {
    if (isProjectInitialized(project)) return '当前项目已初始化'
    if (project.role !== 'DFTM') return '不是 DFTM 角色，不能初始化项目'
    return '远程初始化，创建Gitlab项目'
  }

  const memberManageTooltipTitle = (project: DftProject) => {
    if (!isProjectInitialized(project)) return '当前项目未初始化，不能管理成员'
    if (project.role !== 'DFTM') return '不是 DFTM 角色，不能管理成员'
    return '管理项目成员'
  }

  const projectEnterTooltipTitle = (project: DftProject) => {
    if (!isProjectInitialized(project)) return '当前项目未初始化，不能进入项目'
    return '进入项目，首次本地初始化'
  }

  const initializeProject = async (project: DftProject) => {
    setInitializingProjectId(project.ctmp_id?.toString() ?? '');
    try {
      await initProject(project);
      fetchProjectData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '项目初始化失败');
    } finally {
      setInitializingProjectId(null);
    }
  }

  const initializeProject2 = async (project: DftProject) => {
    if (isProjectInitialized(project)) return;

    setInitializingProjectId(project.id);
    setInitializingProgress(8);
    const timer = window.setInterval(() => {
      setInitializingProgress((value) => Math.min(value + 9, 88));
    }, 180);

    try {
      const result = await prepareProjectWorkspace(project.name, project.id);
      if (!result.success || !result.rootPath) {
        message.error(result.error ?? '项目准备失败');
        return;
      }
      setInitializingProgress(100);
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          projects: prev.projects.map((item) =>
            item.id === project.id
              ? {
                  ...item,
                  rootPath: result.rootPath ?? item.rootPath,
                  repos: item.repos.map((repo) => ({ ...repo, status: 'ready' as const })),
                }
              : item
          ),
        };
      });
      message.success('项目初始化完成');
    } finally {
      window.clearInterval(timer);
      window.setTimeout(() => {
        setInitializingProjectId(null);
        setInitializingProgress(0);
      }, 450);
    }
  };

  const openLocalProject = async () => {
    const selected = await selectPath('folder');
    if (!selected) return;
    const openResult = await openProjectWorkspace(selected);
    if (!openResult.success) {
      message.error(openResult.error ?? '本地项目打开失败');
    }
  };

  const openFlow = (category: string) => {
    if (onNavigate) {
      onNavigate(category);
    } else {
      setFlowContext({ category, projectId: dashboard?.currentProjectId ?? undefined });
    }
  };

  const chooseProjectsRoot = async (project: DftProject, doEnter=false) => {
    const selected = await selectPath('folder');
    if (selected) {
      const result = await setProjectRoot(project, selected);
      if (doEnter && result.success) {
        enterProject( {...project, rootPath: selected}, selected);
      }
    }
  };

  const openProjectModal = () => {
    projectForm.setFieldsValue({ name: '', description: '' });
    setProjectModalOpen(true);
  };

  const closeProjectModal = () => {
    setProjectModalOpen(false);
    projectForm.resetFields();
  };

  const saveProject = async () => {
    const value = await projectForm.validateFields();
    setProjectSaving(true);
    try {
      await createProject(currentUser, {
        name: value.name.trim(),
        description: value.description.trim(),
      });
      message.success('创建自定义项目成功');
      closeProjectModal();
      fetchProjectData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建自定义项目失败');
    } finally {
      setProjectSaving(false);
    }
  };

  return (
    <div>
      <div
        className="welcome-hero-grid"
        style={{
          marginBottom: 18,
        }}
      >
        <div
          style={{
            borderRadius: 8,
            padding: '28px 28px 24px',
            border: `1px solid ${cardBorder}`,
            background: isDark
              ? `linear-gradient(135deg,
                  color-mix(in srgb, #f97316 18%, transparent),
                  color-mix(in srgb, var(--vscode-focusBorder, #2563eb) 12%, transparent) 48%,
                  rgba(255,255,255,0.04))`
              : `linear-gradient(135deg,
                  color-mix(in srgb, #f97316 14%, transparent),
                  color-mix(in srgb, var(--vscode-focusBorder, #2563eb) 8%, transparent) 48%,
                  var(--vscode-editor-background, #fff))`,
            boxShadow: isDark
              ? '0 18px 52px rgba(0,0,0,0.34)'
              : '0 18px 44px rgba(15,23,42,0.10)',
          }}
        >
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color="orange">Project Hub</Tag>
            </Space>
            <div>
              <Title level={1} style={{ margin: 0, fontSize: 40, lineHeight: 1.12 }}>
                DFT IDE
              </Title>
              <Paragraph
                type="secondary"
                style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.8 }}
              >
                从项目列表进入本地 DFT 工作区。每个项目对应 GitLab 四个仓库：
                <Text code>项目名_data</Text>、<Text code>项目名_hibist</Text>、
                <Text code>项目名_sailor</Text>、<Text code>项目名_verification</Text>，本地目录固定为
                <Text code>data/hibist/sailor/verification</Text>。
              </Paragraph>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                width: 'fit-content',
                minWidth: 0,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid color-mix(in srgb, #f97316 34%, transparent)',
                background: isDark
                  ? 'color-mix(in srgb, #f97316 10%, var(--vscode-editor-background, #1e1e1e))'
                  : 'color-mix(in srgb, #fff7ed 56%, var(--vscode-editor-background, #fff))',
              }}
            >
              <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.2 }}>
                当前用户
              </Text>
              <Text strong style={{ fontSize: 16, lineHeight: 1.2, color: '#ea580c', letterSpacing: 0 }}>
                {currentUser}
              </Text>
            </div>
            <Space size={12} wrap>
              <Button type="primary" size="large" icon={<FolderOpenOutlined />} onClick={openLocalProject}>
                打开本地项目
              </Button>
              {currentProject && (
                <Button
                  size="large"
                  icon={<CloudSyncOutlined />}
                  onClick={() => enterProject(currentProject)}
                  loading={workingProjectId === currentProject.id}
                >
                  进入上次项目
                </Button>
              )}
              <Button
                size="large"
                icon={<FolderAddOutlined />}
                onClick={() => openProjectModal()}
                style={{
                  color: ' #f97316',
                  borderColor: ' #f97316'
                }}
              >
                创建自定义项目
              </Button>
            </Space>
          </Space>
        </div>
      </div>

      <Modal
        title="创建自定义项目"
        open={projectModalOpen}
        onCancel={closeProjectModal}
        onOk={saveProject}
        okText="创建"
        confirmLoading={projectSaving}
        destroyOnHidden
      >
        <Form form={projectForm} layout="vertical" preserve={true}>
          <Form.Item
            label="项目名称"
            name="name"
            rules={[
              { required: true, message: '请输入项目名称' },
            ]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>

          <Form.Item
            label="项目描述"
            name="description"
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <div
        className="welcome-content-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 9fr) minmax(340px, 3fr)',
          alignItems: 'stretch',
          gap: 18,
          marginBottom: 18,
        }}
      >
        <Card
          title="我的项目"
          extra={currentProject ? <Tag color="blue">上次：{currentProject.name}</Tag> : null}
          style={{ height: '100%', borderRadius: 8, border: `1px solid ${cardBorder}`, background: panelBg }}
          styles={{body: {padding: 0}}}
        >
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${cardBorder}` }}>
            <Input.Search
              allowClear
              placeholder="搜索项目、角色或负责人"
              value={projectKeyword}
              onChange={(event) => setProjectKeyword(event.target.value)}
            />
          </div>
          {projectError && (
            <Alert
              type="warning"
              showIcon
              message="项目服务暂不可用"
              description={projectError}
              style={{ margin: 16 }}
            />
          )}
          {loadingProjects ? (
            <div style={{ padding: 36, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : filteredProjects.length ? (
            <List
              dataSource={filteredProjects}
              renderItem={(project) => {
                return (
                <List.Item
                  actions={[
                    <div style={{ minWidth: 300}}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 12 }}>
                        <Tooltip key="initialize" title={projectInitializeTooltipTitle(project)}>
                          <span>
                            <Button
                              type="primary"
                              disabled={isProjectInitializeDisable(project)}
                              loading={initializingProjectId === project.ctmp_id?.toString()}
                              onClick={() => initializeProject(project)}
                              style={{ flex: 1 }}
                            >
                              初始化
                            </Button>
                          </span>
                        </Tooltip>
                        <Tooltip key="members" title={memberManageTooltipTitle(project)}>
                          <span>
                            <Button
                              icon={<TeamOutlined />}
                              disabled={isMemberManageDisable(project)}
                              onClick={() => onManageMembers?.(project)}
                              style={{ flex: 1}}
                            >
                              管理成员
                            </Button>
                          </span>
                        </Tooltip>
                        <Tooltip key="enter" title={projectEnterTooltipTitle(project)}>
                          <span>
                            <Button
                              disabled={isProjectEnterDisable(project)}
                              loading={workingProjectId === project.id}
                              onClick={() => enterProject(project)}
                              style={{ flex: 1 }}
                            >
                              进入
                            </Button>
                          </span>
                        </Tooltip>
                      </div>
                      <Form layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                        <Form.Item label="项目目录" style={{ marginBottom: 16 }}>
                          <Input
                            value={project.rootPath}
                            onChange={(event) => setProjectRoot(project, event.target.value)}
                            placeholder="例如 data/DFT/projects"
                            suffix={<FolderOpenOutlined onClick={() => chooseProjectsRoot(project)}/>}
                            allowClear
                          />
                        </Form.Item>
                      </Form>
                    </div>
                    ]}
                  style={{ padding: '14px 18px' }}
                >
                  <List.Item.Meta
                    avatar={<FileProtectOutlined style={{ color: 'var(--vscode-focusBorder, #2563eb)', fontSize: 22 }} />}
                    title={
                      <Space wrap>
                        <Text strong>{project.name}</Text>
                        <Tag>{project.ctmp_id ? "CTMP" : "自定义"}</Tag>
                        <Tag>{project.role}</Tag>
                        {project.id === dashboard?.currentProjectId && <Tag color="green">上次项目</Tag>}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={6}>
                        <Text type="secondary">{project.description}</Text>
                        <Space wrap>
                          {project.repos.map((repo) => (
                            <Tag key={repo.key} color={repoTagColor(repo.status)}>
                              {repo.gitlabProjectName}
                            </Tag>
                          ))}
                        </Space>
                        {initializingProjectId === project.id && (
                          <Progress percent={initializingProgress} size="small" status="active" style={{ maxWidth: 420 }} />
                        )}
                      </Space>
                    }
                  />
                </List.Item>
                );
              }}
            />
          ) : (
            <Empty description={projectKeyword ? '未找到匹配项目' : '暂无项目'} style={{ padding: 36 }} />
          )}
        </Card>

        <Card
          title="项目准入与工作模式"
          style={{ height: '100%', borderRadius: 8, border: `1px solid ${cardBorder}`, background: panelBg }}
        >
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {[
              ['项目平台', '按当前用户展示可参与的 DFT 项目与角色，支持本地托管路径配置及项目一键初始化。'],
              ['多仓映射', '每个项目对应 GitLab 的 data 公共仓与 hibist/sailor/verification 三个执行仓，在本地呈子目录组织。'],
              ['工作区结构', '项目初始化时，IDE 将自动拉取四仓并生成多文件夹工作区文件（.code-workspace）以进行统一管理。'],
              ['状态托管', '本地页面配置与 Design Tree 数据默认托管于工作区下的 .dft-ide/local-state 目录中并自动被 Git 忽略。'],
            ].map(([name, desc]) => (
              <div
                key={name}
                style={{
                  padding: '10px 0',
                  borderTop: `1px solid ${cardBorder}`,
                }}
              >
                <Text strong>{name}</Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.7 }}>
                    {desc}
                  </Text>
                </div>
              </div>
            ))}
          </Space>
        </Card>
      </div>

      <Row gutter={[14, 14]}>
        {flows.map((flow) => (
          <Col key={flow.key} xs={24} sm={12} lg={8} style={{ display: 'flex' }}>
            <Card
              hoverable={!flow.disabled}
              onClick={flow.disabled ? undefined : () => openFlow(flow.key)}
              style={{
                height: '100%',
                minHeight: 188,
                width: '100%',
                borderRadius: 8,
                border: `1px solid ${flow.disabled ? cardBorder : `${flow.accent}45`}`,
                background: panelBg,
                opacity: flow.disabled ? 0.66 : 1,
                cursor: flow.disabled ? 'not-allowed' : 'pointer',
              }}
              styles={{body: {padding: 18, height: '100%'}}}

            >
              <Space direction="vertical" size={12} style={{ width: '100%', height: '100%', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: flow.accent, fontSize: 28 }}>{flow.icon}</span>
                  <Tag color={flow.disabled ? 'default' : flow.accent}>{flow.status}</Tag>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {flow.label}
                  </Text>
                  <Title level={4} style={{ margin: '2px 0 6px', fontSize: 18 }}>
                    {flow.title}
                  </Title>
                  <Text type="secondary" style={{ lineHeight: 1.7 }}>
                    {flow.desc}
                  </Text>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
      <style>{`
        @media (max-width: 760px) {
          .welcome-hero-grid,
          .welcome-content-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Welcome;
