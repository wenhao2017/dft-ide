import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Empty, Input, List, Row, Space, Spin, Tag, Typography } from 'antd';
import {
  ApiOutlined,
  BellOutlined,
  CheckCircleOutlined,
  CloudSyncOutlined,
  CodeOutlined,
  CopyOutlined,
  ExperimentOutlined,
  FileProtectOutlined,
  LineChartOutlined,
  PlusOutlined,
  RocketOutlined,
  SettingOutlined,
  SlidersOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import vscode from '../utils/vscode';
import { runVscodeDemo } from '../utils/ipc';
import useWizardStore from '../store/wizardStore';
import {
  DftProject,
  fetchProjectDashboard,
  ProjectDashboard,
  selectProject,
} from '../services/projectService';

const { Paragraph, Text, Title } = Typography;

interface Props {
  isDark?: boolean;
}

const flows = [
  {
    key: 'COMMON',
    label: 'COMMON',
    title: '公共配置',
    desc: '统一管理 Git 分支、项目路径、归一化表格和 OBS 公共数据。',
    icon: <SettingOutlined />,
    accent: '#2563eb',
    status: 'Ready',
  },
  {
    key: 'Design',
    label: 'Design',
    title: '设计流程',
    desc: '覆盖工具版本、集群资源、执行脚本和设计结果查看。',
    icon: <RocketOutlined />,
    accent: '#7c3aed',
    status: 'Ready',
  },
  {
    key: 'Verification',
    label: 'Verification',
    title: '验证流程',
    desc: '组织验证环境、用例执行、日志定位和报告分析。',
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

const vscodeDemos = [
  { key: 'notification', label: '通知', icon: <BellOutlined /> },
  { key: 'quickPick', label: '快速选择', icon: <ThunderboltOutlined /> },
  { key: 'clipboard', label: '剪贴板', icon: <CopyOutlined /> },
  { key: 'terminal', label: '终端', icon: <CodeOutlined /> },
  { key: 'settings', label: '设置页', icon: <SlidersOutlined /> },
  { key: 'external', label: '外部链接', icon: <ApiOutlined /> },
];

const Welcome: React.FC<Props> = ({ isDark = true }) => {
  const { setFlowContext, setActiveProject } = useWizardStore();
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [selectingProjectId, setSelectingProjectId] = useState<string | null>(null);
  const [projectKeyword, setProjectKeyword] = useState('');

  const cardBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)';
  const panelBg = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.92)';

  const currentProject = useMemo(() => {
    if (!dashboard?.currentProjectId) return null;
    return dashboard.projects.find((item) => item.id === dashboard.currentProjectId) ?? null;
  }, [dashboard]);

  const filteredProjects = useMemo(() => {
    const keyword = projectKeyword.trim().toLowerCase();
    const projects = dashboard?.projects ?? [];
    if (!keyword) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(keyword));
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

  const activateProject = async (project: DftProject) => {
    setSelectingProjectId(project.id);
    try {
      const selected = await selectProject(project.id);
      setActiveProject({
        id: selected.id,
        name: selected.name,
        rootPath: selected.rootPath,
      });
      setDashboard((prev) => prev ? { ...prev, currentProjectId: selected.id } : prev);
      setFlowContext({ category: 'COMMON', projectId: selected.id });
    } finally {
      setSelectingProjectId(null);
    }
  };

  const openFlow = (category: string) => {
    setFlowContext({ category, projectId: dashboard?.currentProjectId ?? undefined });
  };

  return (
    <div>
      <div
        className="welcome-hero-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(340px, 0.85fr)',
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
              ? 'linear-gradient(135deg, rgba(37,99,235,0.20), rgba(5,150,105,0.10) 48%, rgba(255,255,255,0.04))'
              : 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(5,150,105,0.08) 48%, #ffffff)',
            boxShadow: isDark
              ? '0 18px 52px rgba(0,0,0,0.34)'
              : '0 18px 44px rgba(15,23,42,0.10)',
          }}
        >
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Tag color="blue" icon={<ApiOutlined />}>
              DFT Project Console
            </Tag>
            <div>
              <Title level={1} style={{ margin: 0, fontSize: 42, lineHeight: 1.12 }}>
                DFT IDE
              </Title>
              <Paragraph
                type="secondary"
                style={{ margin: '12px 0 0', maxWidth: 680, fontSize: 15, lineHeight: 1.8 }}
              >
                面向 Design-for-Testability 的本地工作台：选择项目后，公共配置、设计流程和验证流程会按项目加载对应上下文。
              </Paragraph>
            </div>
            <Space size={12} wrap>
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => vscode.postMessage({ command: 'createProject' })}
              >
                新建项目
              </Button>
              {currentProject && (
                <Button
                  size="large"
                  icon={<CloudSyncOutlined />}
                  onClick={() => activateProject(currentProject)}
                  loading={selectingProjectId === currentProject.id}
                >
                  进入上次项目
                </Button>
              )}
            </Space>
          </Space>
        </div>

        <div
          style={{
            borderRadius: 8,
            padding: 18,
            border: `1px solid ${cardBorder}`,
            background: panelBg,
          }}
        >
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Text strong>VS Code 能力示例</Text>
            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.7 }}>
              这些能力由扩展宿主执行，可用于项目提醒、环境选择、脚本调试和配置入口。
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {vscodeDemos.map((item) => (
                <Button
                  key={item.key}
                  icon={item.icon}
                  onClick={() => runVscodeDemo(item.key)}
                  style={{ justifyContent: 'flex-start' }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </Space>
        </div>
      </div>

      <Row gutter={[14, 14]} style={{ marginBottom: 18 }}>
        <Col xs={24} lg={14}>
          <Card
            title="项目列表"
            extra={currentProject ? <Tag color="blue">上次：{currentProject.name}</Tag> : null}
            style={{ height: '100%', borderRadius: 8, border: `1px solid ${cardBorder}`, background: panelBg }}
            bodyStyle={{ padding: 0 }}
          >
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${cardBorder}` }}>
              <Input.Search
                allowClear
                placeholder="搜索项目"
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
                renderItem={(project) => (
                  <List.Item
                    actions={[
                      <Button
                        key="select"
                        type={project.id === dashboard?.currentProjectId ? 'primary' : 'default'}
                        loading={selectingProjectId === project.id}
                        onClick={() => activateProject(project)}
                      >
                        选择项目
                      </Button>,
                    ]}
                    style={{ padding: '14px 18px' }}
                  >
                    <List.Item.Meta
                      avatar={<FileProtectOutlined style={{ color: '#2563eb', fontSize: 22 }} />}
                      title={
                        <Space wrap>
                          <Text strong>{project.name}</Text>
                          {project.id === dashboard?.currentProjectId && <Tag color="green">上次项目</Tag>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description={projectKeyword ? '未找到匹配项目' : '暂无项目'} style={{ padding: 36 }} />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="当前能力"
            style={{ height: '100%', borderRadius: 8, border: `1px solid ${cardBorder}`, background: panelBg }}
          >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              {[
                ['Project', '项目列表、上次项目和项目选择入口', <FileProtectOutlined key="project" />],
                ['Flow', '公共、设计、验证三条流程入口', <CloudSyncOutlined key="flow" />],
                ['Roadmap', 'Formal / STA 工作流规划中', <ExperimentOutlined key="roadmap" />],
              ].map(([name, desc, icon]) => (
                <div
                  key={String(name)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr',
                    gap: 10,
                    alignItems: 'center',
                    padding: '10px 0',
                    borderTop: `1px solid ${cardBorder}`,
                  }}
                >
                  <span style={{ color: '#2563eb', fontSize: 20 }}>{icon}</span>
                  <div>
                    <Text strong>{name}</Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {desc}
                      </Text>
                    </div>
                  </div>
                </div>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[14, 14]}>
        {flows.map((flow) => (
          <Col
            key={flow.key}
            xs={24}
            sm={12}
            lg={flow.disabled ? 12 : 8}
            style={{ display: 'flex' }}
          >
            <div style={{ width: '100%', height: '100%' }}>
              <Badge.Ribbon
                text={flow.status}
                color={flow.disabled ? 'default' : flow.accent}
                style={{ display: flow.disabled ? 'block' : 'none' }}
              >
                <Card
                  hoverable={!flow.disabled}
                  onClick={flow.disabled ? undefined : () => openFlow(flow.key)}
                  style={{
                    height: '100%',
                    minHeight: 220,
                    width: '100%',
                    borderRadius: 8,
                    border: `1px solid ${flow.disabled ? cardBorder : `${flow.accent}45`}`,
                    background: panelBg,
                    opacity: flow.disabled ? 0.66 : 1,
                    cursor: flow.disabled ? 'not-allowed' : 'pointer',
                  }}
                  bodyStyle={{ padding: 18, height: '100%' }}
                >
                  <Space
                    direction="vertical"
                    size={12}
                    style={{ width: '100%', height: '100%', justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ color: flow.accent, fontSize: 28 }}>{flow.icon}</span>
                      {!flow.disabled && <Tag color={flow.accent}>{flow.status}</Tag>}
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
              </Badge.Ribbon>
            </div>
          </Col>
        ))}
      </Row>
      <style>{`
        @media (max-width: 760px) {
          .welcome-hero-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Welcome;
