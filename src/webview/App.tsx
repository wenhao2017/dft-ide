import React, { useCallback, useEffect, useState } from 'react';
import { Button, ConfigProvider, Layout, Modal, Space, Tag, Tooltip, theme, Typography } from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  CompressOutlined,
  ExclamationCircleOutlined,
  ExpandOutlined,
  ExperimentOutlined,
  HomeOutlined,
  LineChartOutlined,
  RocketOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import CommonFlow from './flows/CommonFlow';
import DesignFlow from './flows/DesignFlow';
import VerificationFlow from './flows/VerificationFlow';
import TaskStepper from './components/wizard/TaskStepper';
import Welcome from './components/Welcome';
import useWizardStore from './store/wizardStore';
import vscode from './utils/vscode';
import { toggleZenMode as ipcToggleZenMode } from './utils/ipc';

const { Content } = Layout;
const { Text, Title } = Typography;

type InitialView = { command: 'showWelcome' } | { command: 'loadFlow'; category: string };

function detectVscodeTheme(): 'dark' | 'light' | 'hc' {
  const body = document.body;
  if (body.classList.contains('vscode-light')) return 'light';
  if (body.classList.contains('vscode-high-contrast')) return 'hc';
  return 'dark';
}

const flowMeta: Record<string, { title: string; subtitle: string; accent: string }> = {
  COMMON: {
    title: '公共配置中心',
    subtitle: '维护设计、验证与共享数据都会复用的基础路径和同步动作。',
    accent: '#2563eb',
  },
  Design: {
    title: 'Design 工作流配置',
    subtitle: '把设计任务从环境准备、工具配置、执行到结果查看串成稳定闭环。',
    accent: '#7c3aed',
  },
  Verification: {
    title: 'Verification 工作流配置',
    subtitle: '围绕验证工具链、用例执行和报告分析沉淀标准化验证流程。',
    accent: '#059669',
  },
};

// 优化6：内部 Tab 导航配置
const flowTabs: Array<{ key: string; label: string; icon: React.ReactNode }> = [
  { key: 'HOME', label: '首页', icon: <HomeOutlined /> },
  { key: 'COMMON', label: 'COMMON', icon: <SettingOutlined /> },
  { key: 'Design', label: 'Design', icon: <RocketOutlined /> },
  { key: 'Verification', label: 'Verification', icon: <CheckCircleOutlined /> },
  { key: 'Formal', label: 'Formal', icon: <ExperimentOutlined /> },
  { key: 'STA', label: 'STA', icon: <LineChartOutlined /> },
];

const disabledTabs = new Set(['Formal', 'STA']);

const App: React.FC = () => {
  const { flowContext, activeProject, dirtyFlows, setFlowContext, zenMode, toggleZenMode, reset } = useWizardStore();
  const [vscTheme, setVscTheme] = useState<'dark' | 'light' | 'hc'>(detectVscodeTheme);
  const isDirty = useWizardStore((s) => s.isDirty);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setVscTheme(detectVscodeTheme());
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const isDark = vscTheme === 'dark' || vscTheme === 'hc';
  const activeMeta = flowContext ? flowMeta[flowContext.category] : undefined;
  const currentCategory = flowContext?.category ?? 'HOME';

  // 优化7：使用 CSS 变量构建主题
  const antdTheme = {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#2563eb',
      borderRadius: 8,
      colorBgLayout: 'transparent',
      colorBgContainer: isDark ? 'rgba(255,255,255,0.045)' : '#ffffff',
      colorBgElevated: isDark ? '#1f1f22' : '#ffffff',
      colorBorder: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)',
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, sans-serif",
    },
    components: {
      Card: { borderRadiusLG: 8 },
      Button: { borderRadius: 7, controlHeight: 32, paddingInline: 10 },
      Form: { itemMarginBottom: 12 },
      Input: { controlHeight: 32 },
      Select: { controlHeight: 32 },
      Steps: { colorPrimary: activeMeta?.accent ?? '#2563eb' },
      Tabs: { horizontalMargin: '0 0 10px 0' },
    },
  };

  // 优化1：切换 flow 前检查未保存变更
  const navigateToFlow = useCallback((category: string) => {
    const currentFlow = flowContext?.category;

    const doNavigate = () => {
      if (category === 'HOME') {
        setFlowContext(null);
      } else {
        setFlowContext({ category });
      }
      reset();
    };

    // 如果当前 flow 有脏数据，弹出确认
    if (currentFlow && dirtyFlows.has(currentFlow)) {
      Modal.confirm({
        title: '存在未保存的更改',
        icon: <ExclamationCircleOutlined />,
        content: `当前 ${currentFlow} 页面有尚未保存的配置变更。离开后未保存的数据将丢失。`,
        okText: '不保存，直接离开',
        cancelText: '留在当前页',
        okButtonProps: { danger: true },
        onOk: () => {
          // 清除脏标记后导航
          const clearDirty = useWizardStore.getState().clearDirty;
          clearDirty(currentFlow);
          doNavigate();
        },
      });
    } else {
      doNavigate();
    }
  }, [flowContext, dirtyFlows, setFlowContext, reset]);

  // 优化5：专注模式切换
  const handleZenToggle = useCallback(async () => {
    const nextState = !zenMode;
    try {
      await ipcToggleZenMode(nextState);
      toggleZenMode();
    } catch {
      // 切换失败则不更新本地状态
    }
  }, [zenMode, toggleZenMode]);

  const renderFlowContent = (category: string) => {
    switch (category) {
      case 'COMMON':
        return <CommonFlow />;
      case 'Design':
        return <DesignFlow />;
      case 'Verification':
        return <VerificationFlow />;
      default:
        return <TaskStepper />;
    }
  };

  useEffect(() => {
    const applyViewMessage = (msg: InitialView) => {
      if (msg.command === 'loadFlow') {
        setFlowContext({ category: msg.category });
        reset();
      }
      if (msg.command === 'showWelcome') {
        setFlowContext(null);
        reset();
      }
    };

    const initialView = (window as unknown as { DFT_IDE_INITIAL_VIEW?: InitialView }).DFT_IDE_INITIAL_VIEW;
    if (initialView) {
      applyViewMessage(initialView);
    }

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data as InitialView;
      applyViewMessage(msg);
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ command: 'webviewReady' });
    return () => window.removeEventListener('message', handleMessage);
  }, [setFlowContext, reset]);

  return (
    <ConfigProvider theme={antdTheme}>
      <style>
        {`
          .dft-top-tabs {
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: thin;
          }

          .dft-top-tabs .ant-space-item {
            flex: 0 0 auto;
          }

          .dft-flow-shell {
            display: flex;
            align-items: stretch;
            gap: 12px;
            min-width: 0;
          }

          .dft-flow-sidebar {
            flex: 0 0 auto;
            display: flex;
            flex-direction: column;
          }

          .dft-flow-main {
            min-width: 0;
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
          }

          .dft-stepbar {
            overflow-x: auto;
            overflow-y: hidden;
            padding: 0 0 2px;
            margin-bottom: 10px;
            scrollbar-width: thin;
          }

          .dft-stepbar .ant-steps {
            min-width: 620px;
          }

          .dft-stepbar .ant-steps-item-title {
            font-size: 14px;
            line-height: 22px;
            white-space: nowrap;
          }

          .dft-stepbar .ant-steps-item-description {
            font-size: 12px;
            line-height: 18px;
            max-width: 9em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .dft-flow-card {
            flex: 1;
            min-width: 0;
            min-height: 360px;
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.22));
            padding: 14px;
            background: var(--vscode-editor-background);
            overflow-x: hidden;
          }

          .dft-flow-card .ant-form-item {
            margin-bottom: 12px;
          }

          .dft-flow-card .ant-form-item-label {
            overflow: visible;
            white-space: normal;
          }

          .dft-flow-card .ant-form-item-label > label {
            min-height: 32px;
            white-space: normal;
            word-break: break-word;
          }

          .dft-flow-card .ant-divider-horizontal {
            margin: 14px 0;
          }

          .dft-flow-card .ant-card-small > .ant-card-body {
            padding: 12px;
          }

          .dft-flow-card .ant-tabs-nav {
            margin-bottom: 10px;
          }

          .dft-path-input .ant-input {
            text-overflow: ellipsis;
          }

          .dft-action-row {
            display: flex;
            justify-content: center;
            gap: 10px;
            flex-wrap: wrap;
          }

          @media (max-width: 980px) {
            .dft-flow-shell {
              flex-direction: column;
            }

            .dft-flow-sidebar {
              flex: 0 0 auto;
              max-height: 260px;
              overflow: auto;
            }
          }

          @media (max-width: 760px) {
            .dft-shell-header {
              padding: 10px 12px !important;
            }

            .dft-shell-title {
              font-size: 18px !important;
              margin-top: 4px !important;
            }

            .dft-shell-subtitle {
              display: none;
            }

            .dft-shell-body {
              padding: 10px !important;
            }

            .dft-flow-card {
              padding: 10px;
            }

            .dft-flow-card .ant-form-horizontal .ant-form-item {
              display: block;
            }

            .dft-flow-card .ant-form-horizontal .ant-form-item-label,
            .dft-flow-card .ant-form-horizontal .ant-form-item-control {
              flex: none !important;
              max-width: 100% !important;
            }

            .dft-flow-card .ant-form-item-label {
              padding-bottom: 3px;
              text-align: left;
            }
          }
        `}
      </style>
      <Layout
        style={{
          minHeight: '100vh',
          padding: '0',
          background: 'var(--vscode-editor-background, #1e1e1e)',
        }}
      >
        {/* 优化6：顶部 Tab 导航栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            height: 44,
            borderBottom: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
            background: isDark
              ? 'rgba(255,255,255,0.03)'
              : 'rgba(0,0,0,0.02)',
            flexShrink: 0,
          }}
        >
          <Space size={0} className="dft-top-tabs">
            {flowTabs.map((tab) => {
              const isActive = currentCategory === tab.key;
              const isDisabled = disabledTabs.has(tab.key);
              const flowDirty = dirtyFlows.has(tab.key);
              return (
                <Tooltip
                  key={tab.key}
                  title={isDisabled ? 'Coming Soon' : undefined}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={tab.icon}
                    disabled={isDisabled}
                    onClick={() => navigateToFlow(tab.key)}
                    style={{
                      borderRadius: 0,
                      height: 44,
                      padding: '0 10px',
                      borderBottom: isActive
                        ? `2px solid ${activeMeta?.accent ?? '#2563eb'}`
                        : '2px solid transparent',
                      color: isActive
                        ? 'var(--vscode-foreground, #ccc)'
                        : 'var(--vscode-descriptionForeground, #888)',
                      fontWeight: isActive ? 600 : 400,
                      opacity: isDisabled ? 0.4 : 1,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {tab.label}
                    {/* 脏数据指示点 */}
                    {flowDirty && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#faad14',
                          marginLeft: 6,
                          verticalAlign: 'middle',
                        }}
                      />
                    )}
                  </Button>
                </Tooltip>
              );
            })}
          </Space>

          <Space size={8}>
            {/* 优化5：专注模式切换按钮 */}
            <Tooltip title={zenMode ? '退出专注模式' : '进入专注模式'}>
              <Button
                type="text"
                size="small"
                icon={zenMode ? <CompressOutlined /> : <ExpandOutlined />}
                onClick={handleZenToggle}
                style={{
                  color: 'var(--vscode-descriptionForeground, #888)',
                }}
              />
            </Tooltip>
            {activeProject && (
              <Tag
                color="blue"
                style={{ margin: 0 }}
              >
                {activeProject.name}
              </Tag>
            )}
          </Space>
        </div>

        {/* 主内容区域 */}
        <Content
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            width: '100%',
            padding: '12px',
            // 优化7：使用 CSS 变量的渐变
            background: isDark
              ? `linear-gradient(180deg, color-mix(in srgb, var(--vscode-focusBorder, #2563eb) 8%, transparent), transparent 220px)`
              : `linear-gradient(180deg, color-mix(in srgb, var(--vscode-focusBorder, #2563eb) 7%, transparent), transparent 240px)`,
          }}
        >
          {!flowContext ? (
            <Welcome isDark={isDark} onNavigate={navigateToFlow} />
          ) : (
            <div
              style={{
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.24))',
                background: isDark
                  ? 'color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 72%, transparent)'
                  : 'color-mix(in srgb, var(--vscode-editor-background, #fff) 88%, transparent)',
                boxShadow: isDark
                  ? '0 18px 48px rgba(0,0,0,0.36)'
                  : '0 18px 42px rgba(15,23,42,0.10)',
              }}
            >
              <div
                className="dft-shell-header"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.18))',
                  background: activeMeta
                    ? `linear-gradient(135deg, ${activeMeta.accent}1f, transparent 58%)`
                    : undefined,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Tag color={activeMeta?.accent ?? 'blue'} icon={<ThunderboltOutlined />}>
                    DFT IDE
                  </Tag>
                  {activeProject && (
                    <Tag color="green" style={{ marginLeft: 8 }}>
                      {activeProject.name}
                    </Tag>
                  )}
                  {/* 优化1：未保存变更提示 */}
                  {dirtyFlows.has(flowContext.category) && (
                    <Tag color="warning" style={{ marginLeft: 8 }}>
                      ● 有未保存的更改
                    </Tag>
                  )}
                  <Title className="dft-shell-title" level={2} style={{ margin: '6px 0 0', fontSize: 21 }}>
                    {activeMeta?.title ?? `${flowContext.category} 工作流配置`}
                  </Title>
                  <Text className="dft-shell-subtitle" type="secondary">{activeMeta?.subtitle}</Text>
                </div>
                <Button
                  icon={<HomeOutlined />}
                  onClick={() => navigateToFlow('HOME')}
                  style={{ flex: '0 0 auto' }}
                >
                  返回首页
                </Button>
              </div>
              <div className="dft-shell-body" style={{ padding: 12 }}>{renderFlowContent(flowContext.category)}</div>
            </div>
          )}
        </Content>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
