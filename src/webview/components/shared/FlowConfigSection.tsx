import { useState, type ReactNode } from 'react'
import { DownOutlined } from '@ant-design/icons'
import { Card, ConfigProvider, Space, Typography, theme } from 'antd'

const { Text, Title } = Typography

interface Props {
  index: string
  icon: ReactNode
  title: string
  description: string
  accent?: string
  defaultExpanded?: boolean
  children: ReactNode
}

export default function FlowConfigSection({
  index,
  icon,
  title,
  description,
  accent,
  defaultExpanded = true,
  children,
}: Props) {
  const { token } = theme.useToken()
  const sectionAccent = accent ?? token.colorPrimary
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <ConfigProvider theme={{ token: { colorPrimary: sectionAccent } }}>
      <Card
        className="dft-flow-config-section"
        style={{ width: '100%', borderColor: token.colorBorderSecondary, overflow: 'hidden' }}
        styles={{ body: { padding: 0 } }}
      >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 18px',
          color: token.colorText,
          textAlign: 'left',
          border: 0,
          borderBottom: expanded ? `1px solid ${token.colorBorderSecondary}` : '1px solid transparent',
          background: `linear-gradient(135deg, color-mix(in srgb, ${sectionAccent} 10%, ${token.colorBgContainer}) 0%, ${token.colorBgContainer} 72%)`,
          cursor: 'pointer',
          transition: 'border-color 180ms ease',
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
            <Title level={5} style={{ margin: '2px 0 2px', fontSize: 16 }}>{title}</Title>
            <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.55 }}>{description}</Text>
          </div>
        </Space>
        <DownOutlined
          style={{
            flex: '0 0 auto',
            color: sectionAccent,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 220ms cubic-bezier(.22, 1, .36, 1)',
          }}
        />
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 240ms cubic-bezier(.22, 1, .36, 1)',
        }}
      >
        <div style={{
          minHeight: 0,
          overflow: 'hidden',
          visibility: expanded ? 'visible' : 'hidden',
          transition: expanded ? 'visibility 0s' : 'visibility 0s 240ms',
        }}>
          <div style={{ padding: 18 }}>
            {children}
          </div>
        </div>
      </div>
      </Card>
    </ConfigProvider>
  )
}
