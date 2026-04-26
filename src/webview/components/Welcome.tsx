import React from 'react';
import { Space, Typography, Card, Button, Row, Col, Divider } from 'antd';
import {
  PlusOutlined,
  SettingOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import vscode from '../utils/vscode';
import useWizardStore from '../store/wizardStore';

const { Title, Text, Paragraph } = Typography;

interface Props {
  isDark?: boolean;
}

const Welcome: React.FC<Props> = ({ isDark = true }) => {
  const { setFlowContext } = useWizardStore();

  const handleCreateWorkspace = () => {
    vscode.postMessage({ command: 'createWorkspace' });
  };

  const openFlow = (category: string) => {
    setFlowContext({ category });
  };

  const cardBase: React.CSSProperties = {
    borderRadius: 12,
    height: '100%',
    transition: 'all 0.25s ease',
    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
    background: isDark
      ? 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))'
      : 'linear-gradient(145deg, #ffffff, #f8f9ff)',
  };

  const flowCards = [
    {
      key: 'COMMON',
      label: 'COMMON',
      desc: 'Git 分支 / 路径 / OBS 公共数据配置',
      icon: <SettingOutlined style={{ fontSize: 36, color: '#4f8ef7' }} />,
      color: '#4f8ef7',
    },
    {
      key: 'Design',
      label: 'Design',
      desc: '设计工具配置、执行流程与结果分析',
      icon: <RocketOutlined style={{ fontSize: 36, color: '#a855f7' }} />,
      color: '#a855f7',
    },
    {
      key: 'Verification',
      label: 'Verification',
      desc: '验证工具配置、仿真执行与报告查看',
      icon: <CheckCircleOutlined style={{ fontSize: 36, color: '#22c55e' }} />,
      color: '#22c55e',
    },
    {
      key: 'Formal',
      label: 'Formal',
      desc: '形式化验证工具链配置（即将推出）',
      icon: <ExperimentOutlined style={{ fontSize: 36, color: '#f59e0b' }} />,
      color: '#f59e0b',
      disabled: true,
    },
    {
      key: 'STA',
      label: 'STA',
      desc: '静态时序分析配置（即将推出）',
      icon: <LineChartOutlined style={{ fontSize: 36, color: '#ef4444' }} />,
      color: '#ef4444',
      disabled: true,
    },
  ];

  return (
    <div style={{ animation: 'fadeInUp 0.45s ease-out', padding: '8px 0' }}>
      {/* Hero Section */}
      <Row justify="center" style={{ marginBottom: 32 }}>
        <Col span={24} style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 16 }}>
            <svg
              width="64"
              height="64"
              viewBox="0 0 100 100"
              style={{ filter: isDark ? 'drop-shadow(0 0 12px rgba(79,142,247,0.5))' : 'drop-shadow(0 2px 8px rgba(79,142,247,0.3))' }}
            >
              <rect x="18" y="18" width="64" height="64" rx="8" fill="none" stroke="#4f8ef7" strokeWidth="5"/>
              <line x1="34" y1="18" x2="34" y2="6" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="50" y1="18" x2="50" y2="6" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="66" y1="18" x2="66" y2="6" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="34" y1="82" x2="34" y2="94" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="50" y1="82" x2="50" y2="94" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="66" y1="82" x2="66" y2="94" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="18" y1="34" x2="6" y2="34" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="18" y1="50" x2="6" y2="50" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="18" y1="66" x2="6" y2="66" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="82" y1="34" x2="94" y2="34" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="82" y1="50" x2="94" y2="50" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <line x1="82" y1="66" x2="94" y2="66" stroke="#4f8ef7" strokeWidth="5" strokeLinecap="round"/>
              <rect x="36" y="36" width="28" height="28" rx="4" fill="#4f8ef7" opacity="0.15"/>
              <line x1="38" y1="40" x2="56" y2="40" stroke="#4f8ef7" strokeWidth="3.5" strokeLinecap="round"/>
              <line x1="38" y1="40" x2="38" y2="60" stroke="#4f8ef7" strokeWidth="3.5" strokeLinecap="round"/>
              <line x1="38" y1="60" x2="56" y2="60" stroke="#4f8ef7" strokeWidth="3.5" strokeLinecap="round"/>
              <polyline points="56,40 62,44 62,56 56,60" fill="none" stroke="#4f8ef7" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <Title
            key={String(isDark)}
            level={1}
            style={{
              fontSize: 42,
              marginBottom: 8,
              lineHeight: 1.2,
              background: isDark
                ? 'linear-gradient(90deg, #4f8ef7, #a855f7, #22c55e)'
                : 'linear-gradient(90deg, #1677ff, #722ed1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              display: 'inline-block',
            }}
          >
            DFT IDE
          </Title>
          <Paragraph
            type="secondary"
            style={{ fontSize: 15, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}
          >
            专业的 Design-for-Testability 智能编排环境，覆盖设计、验证、形式化与时序分析全流程。
          </Paragraph>
        </Col>
      </Row>

      {/* Create Workspace CTA */}
      <Row justify="center" style={{ marginBottom: 32 }}>
        <Col xs={24} sm={16} md={12}>
          <Card
            hoverable
            onClick={handleCreateWorkspace}
            style={{
              ...cardBase,
              background: isDark
                ? 'linear-gradient(135deg, rgba(79,142,247,0.15), rgba(168,85,247,0.1))'
                : 'linear-gradient(135deg, rgba(79,142,247,0.08), rgba(168,85,247,0.06))',
              border: '1px solid rgba(79,142,247,0.3)',
              cursor: 'pointer',
            }}
            bodyStyle={{ padding: '24px 20px' }}
          >
            <Space direction="vertical" size={8} style={{ width: '100%', textAlign: 'center' }}>
              <PlusOutlined style={{ fontSize: 40, color: '#4f8ef7' }} />
              <Title level={4} style={{ margin: 0 }}>新建工程</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                创建本地 DFT IDE 工作区，自动生成标准目录结构与配置文件
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>

      <Divider plain style={{ margin: '0 0 24px 0' }}>
        <Text type="secondary" style={{ fontSize: 13 }}>快速进入工作流</Text>
      </Divider>

      {/* Flow Cards Grid */}
      <Row gutter={[16, 16]}>
        {flowCards.map((fc) => (
          <Col key={fc.key} xs={24} sm={12} md={8} lg={fc.disabled ? 12 : 8}
               style={{ display: 'flex' }}>
            <Card
              hoverable={!fc.disabled}
              onClick={fc.disabled ? undefined : () => openFlow(fc.key)}
              style={{
                ...cardBase,
                width: '100%',
                opacity: fc.disabled ? 0.55 : 1,
                cursor: fc.disabled ? 'not-allowed' : 'pointer',
                borderColor: fc.disabled ? undefined : `${fc.color}33`,
              }}
              bodyStyle={{ padding: '20px 16px' }}
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {fc.icon}
                  <div>
                    <Title level={5} style={{ margin: 0, color: fc.color }}>
                      {fc.label}
                    </Title>
                    {fc.disabled && (
                      <Text style={{ fontSize: 11, color: '#f59e0b' }}>即将推出</Text>
                    )}
                  </div>
                </div>
                <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {fc.desc}
                </Text>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Welcome;
