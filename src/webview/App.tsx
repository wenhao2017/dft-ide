import React, { useEffect, useState } from 'react';
import { Button, ConfigProvider, Layout, Tag, theme, Typography } from 'antd';
import { HomeOutlined, ThunderboltOutlined } from '@ant-design/icons';
import CommonFlow from './flows/CommonFlow';
import DesignFlow from './flows/DesignFlow';
import VerificationFlow from './flows/VerificationFlow';
import TaskStepper from './components/wizard/TaskStepper';
import Welcome from './components/Welcome';
import useWizardStore from './store/wizardStore';
import vscode from './utils/vscode';

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

const App: React.FC = () => {
  const { flowContext, activeProject, setFlowContext, reset } = useWizardStore();
  const [vscTheme, setVscTheme] = useState<'dark' | 'light' | 'hc'>(detectVscodeTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setVscTheme(detectVscodeTheme());
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const isDark = vscTheme === 'dark' || vscTheme === 'hc';
  const activeMeta = flowContext ? flowMeta[flowContext.category] : undefined;

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
      Button: { borderRadius: 7, controlHeight: 34 },
      Steps: { colorPrimary: activeMeta?.accent ?? '#2563eb' },
    },
  };

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
      <Layout
        style={{
          minHeight: '100vh',
          padding: '24px 18px',
          background: isDark
            ? 'linear-gradient(180deg, rgba(37,99,235,0.08), transparent 220px)'
            : 'linear-gradient(180deg, rgba(37,99,235,0.07), transparent 240px)',
        }}
      >
        <Content style={{ maxWidth: 1180, margin: '0 auto', width: '100%' }}>
          {!flowContext ? (
            <Welcome isDark={isDark} />
          ) : (
            <div
              style={{
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.24))',
                background: isDark ? 'rgba(18,18,20,0.72)' : 'rgba(255,255,255,0.88)',
                boxShadow: isDark
                  ? '0 18px 48px rgba(0,0,0,0.36)'
                  : '0 18px 42px rgba(15,23,42,0.10)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  padding: '18px 20px',
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
                  <Title level={2} style={{ margin: '8px 0 2px', fontSize: 24 }}>
                    {activeMeta?.title ?? `${flowContext.category} 工作流配置`}
                  </Title>
                  <Text type="secondary">{activeMeta?.subtitle}</Text>
                </div>
                <Button
                  icon={<HomeOutlined />}
                  onClick={() => setFlowContext(null)}
                  style={{ flex: '0 0 auto' }}
                >
                  返回首页
                </Button>
              </div>
              <div style={{ padding: 20 }}>{renderFlowContent(flowContext.category)}</div>
            </div>
          )}
        </Content>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
