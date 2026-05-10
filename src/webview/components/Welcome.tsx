import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, List, Progress, Row, Space, Spin, Tag, Tooltip, Typography, message } from 'antd';
import {
  CheckCircleOutlined,
  CloudSyncOutlined,
  ExperimentOutlined,
  FileProtectOutlined,
  FolderOpenOutlined,
  LineChartOutlined,
  RocketOutlined,
  SaveOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  getLocalConfigInfo,
  openProjectWorkspace,
  prepareProjectWorkspace,
  selectPath,
  setLocalConfigPath,
  type LocalConfigInfo,
} from '../utils/ipc';
import useWizardStore from '../store/wizardStore';
import {
  DftProject,
  canManageProjectMembers,
  fetchProjectDashboard,
  ProjectDashboard,
  ProjectRepoStatus,
  selectProject,
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
    label: 'Common',
    title: '公共配置',
    desc: '项目级路径、Design Tree、Git、OBS 和公共数据配置。',
    icon: <SettingOutlined />,
    accent: '#2563eb',
    status: 'Ready',
  },
  {
    key: 'Design',
    label: 'Design',
    title: '设计流程',
    desc: '按模块管理工具版本、执行参数、资源配置和设计结果。',
    icon: <RocketOutlined />,
    accent: '#7c3aed',
    status: 'Ready',
  },
  {
    key: 'Verification',
    label: 'Verification',
    title: '验证流程',
    desc: '按模块管理仿真配置、任务提交、日志和覆盖率结果。',
    icon: <CheckCircleOutlined />,
    accent: '#059669',
    status: 'Ready',
  },
  {
    key: 'Formal',
    label: 'Formal',
    title: '形式验证',
    desc: '形式化工具链配置、任务执行与结果归档。',
    icon: <ExperimentOutlined />,
    accent: '#d97706',
    status: 'Planned',
    disabled: true,
  },
  {
    key: 'STA',
    label: 'STA',
    title: '静态时序',
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

const Welcome: React.FC<Props> = ({ isDark = true, onNavigate, onManageMembers }) => {
  const { setFlowContext, setActiveProject } = useWizardStore();
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [workingProjectId, setWorkingProjectId] = useState<string | null>(null);
  const [initializingProjectId, setInitializingProjectId] = useState<string | null>(null);
  const [initializingProgress, setInitializingProgress] = useState(0);
  const [projectKeyword, setProjectKeyword] = useState('');
  const [localRootInfo, setLocalRootInfo] = useState<LocalConfigInfo | null>(null);
  const [localProjectsRoot, setLocalProjectsRoot] = useState('');
  const [savingLocalProjectsRoot, setSavingLocalProjectsRoot] = useState(false);

  const cardBorder = 'var(--vscode-panel-border, rgba(127,127,127,0.18))';
  const panelBg = isDark
    ? 'color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 96%, white)'
    : 'color-mix(in srgb, var(--vscode-editor-background, #fff) 92%, transparent)';

  const currentProject = useMemo(() => {
    if (!dashboard?.currentProjectId) return null;
    return dashboard.projects.find((item) => item.id === dashboard.currentProjectId) ?? null;
  }, [dashboard]);

  const filteredProjects = useMemo(() => {
    const keyword = projectKeyword.trim().toLowerCase();
    const projects = dashboard?.projects ?? [];
    if (!keyword) return projects;
    return projects.filter((project) =>
      [project.name, project.id, project.owner, project.role].some((text) => text.toLowerCase().includes(keyword))
    );
  }, [dashboard, projectKeyword]);

  useEffect(() => {
    let disposed = false;

    fetchProjectDashboard()
      .then((data) => {
        if (disposed) return;
        setDashboard(data);
        setProjectError(null);
      })
      .catch((error) => {
        if (disposed) return;
        setProjectError(error instanceof Error ? error.message : '项目列表加载失败');
      })
      .finally(() => {
        if (!disposed) {
          setLoadingProjects(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    getLocalConfigInfo()
      .then((info) => {
        if (disposed) return;
        setLocalRootInfo(info);
        setLocalProjectsRoot(info.configuredPath);
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
      const selected = await selectProject(project.id);
      const targetRoot = rootPath ?? selected.rootPath;
      const openResult = await openProjectWorkspace(targetRoot);
      if (!openResult.success) {
        message.error(openResult.error ?? '项目工作区打开失败');
        return;
      }
      setActiveProject({
        id: selected.id,
        name: selected.name,
        rootPath: targetRoot,
      });
      setDashboard((prev) => prev ? { ...prev, currentProjectId: selected.id } : prev);
      if (onNavigate) {
        onNavigate('Common');
      } else {
        setFlowContext({ category: 'Common', projectId: selected.id });
      }
    } finally {
      setWorkingProjectId(null);
    }
  };

  const isProjectInitialized = (project: DftProject) =>
    project.repos.every((repo) => repo.status === 'ready');

  const initializeProject = async (project: DftProject) => {
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

  const chooseLocalProjectsRoot = async () => {
    const selected = await selectPath('folder');
    if (selected) {
      setLocalProjectsRoot(selected);
    }
  };

  const saveLocalProjectsRoot = async (nextPath = localProjectsRoot) => {
    setSavingLocalProjectsRoot(true);
    try {
      const result = await setLocalConfigPath(nextPath.trim());
      if (result.success) {
        setLocalRootInfo(result);
        setLocalProjectsRoot(result.configuredPath);
        message.success(result.configuredPath ? '本地项目托管目录已保存' : '已清空本地项目托管目录');
      } else {
        message.error(result.error ?? '本地项目托管目录保存失败');
      }
    } finally {
      setSavingLocalProjectsRoot(false);
    }
  };

  return (
    <div>
      <div
        className="welcome-hero-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 7fr) minmax(340px, 5fr)',
          alignItems: 'stretch',
          gap: 18,
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
                style={{ margin: '12px 0 0', maxWidth: 760, fontSize: 15, lineHeight: 1.8 }}
              >
                从项目列表进入本地 DFT 工作区。每个项目对应 GitLab 三个仓库：
                <Text code>项目名_data</Text>、<Text code>项目名_design</Text>、
                <Text code>项目名_verification</Text>，本地目录固定为
                <Text code>data/design/verification</Text>。
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
                {dashboard?.currentUser ?? 'w00445630'}
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
            </Space>
          </Space>
        </div>

        <Card
          title="本地项目托管目录"
          style={{ borderRadius: 8, border: `1px solid ${cardBorder}`, background: panelBg }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.7 }}>
              选择一个空间充足的本地目录，项目会默认准备到该目录下。页面状态始终保存到项目根目录的
              <Text code>.dft-ide/local-state</Text>。
            </Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={localProjectsRoot}
                onChange={(event) => setLocalProjectsRoot(event.target.value)}
                placeholder="例如 D:/dft/projects"
                allowClear
              />
              <Button icon={<FolderOpenOutlined />} onClick={chooseLocalProjectsRoot}>
                选择
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingLocalProjectsRoot}
                onClick={() => saveLocalProjectsRoot()}
              >
                保存
              </Button>
            </Space.Compact>
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前项目状态目录：{localRootInfo?.effectivePath ?? '打开项目后自动生成'}
            </Text>
          </Space>
        </Card>
      </div>

      <div
        className="welcome-content-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 7fr) minmax(340px, 5fr)',
          alignItems: 'stretch',
          gap: 18,
          marginBottom: 18,
        }}
      >
        <Card
          title="我的项目"
          extra={currentProject ? <Tag color="blue">上次：{currentProject.name}</Tag> : null}
          style={{ height: '100%', borderRadius: 8, border: `1px solid ${cardBorder}`, background: panelBg }}
          bodyStyle={{ padding: 0 }}
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
                const canManageMembers = canManageProjectMembers(project);
                return (
                <List.Item
                  actions={[
                    <Button
                      key="initialize"
                      type="primary"
                      disabled={isProjectInitialized(project)}
                      loading={initializingProjectId === project.id}
                      onClick={() => initializeProject(project)}
                    >
                      初始化
                    </Button>,
                    <Tooltip key="members" title={canManageMembers ? '管理项目成员' : '当前项目不是 DFTM 角色，不能管理成员'}>
                      <span>
                        <Button
                          icon={<TeamOutlined />}
                          disabled={!canManageMembers}
                          onClick={() => onManageMembers?.(project)}
                        >
                          管理成员
                        </Button>
                      </span>
                    </Tooltip>,
                    <Button
                      key="enter"
                      loading={workingProjectId === project.id}
                      onClick={() => enterProject(project)}
                    >
                      进入
                    </Button>,
                  ]}
                  style={{ padding: '14px 18px' }}
                >
                  <List.Item.Meta
                    avatar={<FileProtectOutlined style={{ color: 'var(--vscode-focusBorder, #2563eb)', fontSize: 22 }} />}
                    title={
                      <Space wrap>
                        <Text strong>{project.name}</Text>
                        <Tag>{project.role}</Tag>
                        <Tag color="processing">Stage {project.stage}</Tag>
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
          title="项目准入模型"
          style={{ height: '100%', borderRadius: 8, border: `1px solid ${cardBorder}`, background: panelBg }}
        >
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {[
              ['项目平台', '首页按当前用户展示可参与项目、角色和项目阶段。'],
              ['GitLab', '每个项目固定映射 data、design、verification 三个仓库。'],
              ['Local Root', '用户选择本地托管目录后，项目克隆到该目录下的独立 project root。'],
              ['Local State', '配置状态默认跟随 project root，统一保存在 .dft-ide/local-state。'],
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
              bodyStyle={{ padding: 18, height: '100%' }}
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
