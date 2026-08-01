import { ApartmentOutlined } from '@ant-design/icons'
import { Space, Tag, Typography, theme } from 'antd'

const { Text } = Typography

interface Props {
  scope: 'Module' | 'Mode'
  accent: string
}

export default function ExecutionContextBridge({ scope, accent }: Props) {
  const { token } = theme.useToken()

  return (
    <>
      <style>{`
        @keyframes dft-execution-view-enter {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dft-execution-view {
          animation: dft-execution-view-enter 220ms cubic-bezier(.22, 1, .36, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .dft-execution-view { animation: none; }
        }
      `}</style>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        marginBottom: 14,
        padding: '11px 14px',
        border: `1px solid color-mix(in srgb, ${accent} 30%, ${token.colorBorderSecondary})`,
        borderRadius: 10,
        background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 10%, ${token.colorBgContainer}), ${token.colorBgContainer})`,
      }}>
      <Space size={10} align="start">
        <ApartmentOutlined style={{ color: accent, marginTop: 3 }} />
        <div>
          <Text strong>已进入 {scope} 级执行配置</Text>
          <div>
            <Text type="secondary">
              从左侧选择 {scope}，在右侧配置并运行；工具与 Donau 策略沿用当前流程配置。
            </Text>
          </div>
        </div>
      </Space>
      <Tag color="processing" bordered={false} style={{ margin: 0, flex: '0 0 auto' }}>
        执行上下文
      </Tag>
      </div>
    </>
  )
}
