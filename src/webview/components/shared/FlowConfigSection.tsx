import type { ReactNode } from 'react'
import { Card, Space, Typography, theme } from 'antd'

const { Text, Title } = Typography

interface Props {
  index: string
  icon: ReactNode
  title: string
  description: string
  meta: string
  accent?: string
  children: ReactNode
}

export default function FlowConfigSection({
  index,
  icon,
  title,
  description,
  meta,
  accent,
  children,
}: Props) {
  const { token } = theme.useToken()
  const sectionAccent = accent ?? token.colorPrimary

  return (
    <Card
      className="dft-flow-config-section"
      style={{ width: '100%', height: '100%', borderColor: token.colorBorderSecondary, overflow: 'hidden' }}
      styles={{ body: { height: '100%', padding: 0, display: 'flex', flexDirection: 'column' } }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px 18px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${sectionAccent} 10%, ${token.colorBgContainer}) 0%, ${token.colorBgContainer} 72%)`,
        }}
      >
        <Space align="start" size={12} style={{ minWidth: 0 }}>
          <div
            style={{
              width: 38,
              height: 38,
              flex: '0 0 38px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 10,
              color: sectionAccent,
              background: `color-mix(in srgb, ${sectionAccent} 13%, ${token.colorBgContainer})`,
              border: `1px solid color-mix(in srgb, ${sectionAccent} 24%, ${token.colorBorderSecondary})`,
              fontSize: 18,
            }}
          >
            {icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <Space size={8} wrap>
              <Text
                style={{
                  color: sectionAccent,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                }}
              >
                配置项 {index}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{meta}</Text>
            </Space>
            <Title level={5} style={{ margin: '2px 0 2px', fontSize: 16 }}>{title}</Title>
            <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.55 }}>{description}</Text>
          </div>
        </Space>
      </div>
      <div style={{ padding: 18, flex: 1 }}>
        {children}
      </div>
    </Card>
  )
}
