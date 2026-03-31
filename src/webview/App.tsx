import React from 'react';
import { ConfigProvider, Layout, Typography, theme } from 'antd';
import TaskStepper from './components/wizard/TaskStepper';

const { Content } = Layout;
const { Title } = Typography;

const App: React.FC = () => {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
        },
      }}
    >
      <Layout
        style={{
          minHeight: '100vh',
          background: 'transparent',
          padding: '24px',
        }}
      >
        <Content
          style={{
            maxWidth: 960,
            margin: '0 auto',
            width: '100%',
          }}
        >
          <Title level={3} style={{ marginBottom: 32 }}>
            🛠 DFT IDE — 任务提交向导
          </Title>
          <TaskStepper />
        </Content>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
