import React, { useEffect } from 'react';
import { ConfigProvider, Layout, Typography, theme, Empty, Card } from 'antd';
import CommonFlow from './flows/CommonFlow';
import DesignFlow from './flows/DesignFlow';
import VerificationFlow from './flows/VerificationFlow';
import TaskStepper from './components/wizard/TaskStepper';
import useWizardStore from './store/wizardStore';

const { Content } = Layout;
const { Title, Text } = Typography;

const vscode = (window as any).acquireVsCodeApi ? (window as any).acquireVsCodeApi() : undefined;

const App: React.FC = () => {
  const { flowContext, setFlowContext, reset } = useWizardStore();

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
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm, // 配合 VS Code 深色模式
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          colorBgContainer: '#1e1e1e', // 适配 VS Code 编辑器背景色
        },
      }}
    >
      <Layout
        style={{
          minHeight: '100vh',
          background: 'transparent',
          padding: '40px 24px',
        }}
      >
        <Content
          style={{
            maxWidth: 1000,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {!flowContext ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Text type="secondary" style={{ fontSize: 16, letterSpacing: '0.5px' }}>
                    👈 请在左侧面板选择一个流程以开始
                  </Text>
                }
              />
            </div>
          ) : (
            <Card 
              bordered={false} 
              style={{ 
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)', 
                padding: '16px' 
              }}
            >
              <Title 
                level={2} 
                style={{ 
                  marginBottom: 32, 
                  textAlign: 'center',
                  background: 'linear-gradient(90deg, #1677ff, #722ed1)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              >
                {flowContext.category} 工作流配置
              </Title>
              
              <div style={{ padding: '0 24px' }}>
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
