import React, { useEffect, useState } from 'react';
import { ConfigProvider, Layout, theme, Button, Card } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import CommonFlow from './flows/CommonFlow';
import DesignFlow from './flows/DesignFlow';
import VerificationFlow from './flows/VerificationFlow';
import TaskStepper from './components/wizard/TaskStepper';
import Welcome from './components/Welcome';
import useWizardStore from './store/wizardStore';
import vscode from './utils/vscode';

const { Content } = Layout;

/** Detect VS Code color theme from body class list */
function detectVscodeTheme(): 'dark' | 'light' | 'hc' {
  const body = document.body;
  if (body.classList.contains('vscode-light')) return 'light';
  if (body.classList.contains('vscode-high-contrast')) return 'hc';
  return 'dark';
}

const App: React.FC = () => {
  const { flowContext, setFlowContext, reset } = useWizardStore();
  const [vscTheme, setVscTheme] = useState<'dark' | 'light' | 'hc'>(detectVscodeTheme);

  // Listen for VS Code theme changes (body class mutation)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setVscTheme(detectVscodeTheme());
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const isDark = vscTheme === 'dark' || vscTheme === 'hc';

  // Ant Design token overrides that harmonize with VS Code
  const antdTheme = {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#4f8ef7',
      borderRadius: 8,
      // Use transparent backgrounds so VS Code background shows through
      colorBgContainer: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      colorBgElevated: isDark ? '#252526' : '#ffffff',
      colorBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)',
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, sans-serif",
    },
  };

  const cardStyle: React.CSSProperties = {
    boxShadow: isDark
      ? '0 8px 32px rgba(0,0,0,0.4)'
      : '0 4px 24px rgba(0,0,0,0.08)',
    borderRadius: 12,
    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
  };

  const titleGradient: React.CSSProperties = {
    marginBottom: 0,
    textAlign: 'center' as const,
    background: isDark
      ? 'linear-gradient(90deg, #4f8ef7, #a855f7)'
      : 'linear-gradient(90deg, #1677ff, #722ed1)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: 0.5,
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
    if (vscode) {
      vscode.postMessage({ command: 'webviewReady' });
    }

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.command === 'loadFlow') {
        setFlowContext({ category: msg.category });
        reset();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setFlowContext, reset]);

  return (
    <ConfigProvider theme={antdTheme}>
      <Layout
        style={{
          minHeight: '100vh',
          background: 'transparent',
          padding: '32px 20px',
        }}
      >
        <Content
          style={{
            maxWidth: 1080,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {!flowContext ? (
            <Welcome isDark={isDark} />
          ) : (
            <Card
              bordered={false}
              style={cardStyle}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Button
                    type="text"
                    icon={<HomeOutlined />}
                    onClick={() => setFlowContext(null)}
                    size="small"
                    style={{ color: 'inherit' }}
                  />
                  {/* key={vscTheme} 强制 webkit 重绘渐变文字 */}
                  <span
                    key={vscTheme}
                    style={titleGradient}
                  >
                    {flowContext.category} 工作流配置
                  </span>
                </div>
              }
            >
              <div style={{ padding: '8px 0' }}>
                {renderFlowContent(flowContext.category)}
              </div>
            </Card>
          )}
        </Content>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
