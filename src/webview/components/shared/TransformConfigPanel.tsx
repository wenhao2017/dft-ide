import React from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import {
  BranchesOutlined,
  FileSyncOutlined,
  HistoryOutlined,
  RightOutlined,
  SaveOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface Props {
  accent: string;
  flowLabel: string;
  branch: string;
  description: string;
  scopeLabel: string;
  saving: boolean;
  generating: boolean;
  onSave: () => void;
  onGenerate: () => void;
  onHistory: () => void;
  onNext?: () => void;
  children: React.ReactNode;
}

const TransformConfigPanel: React.FC<Props> = ({
  accent,
  flowLabel,
  branch,
  description,
  scopeLabel,
  saving,
  generating,
  onSave,
  onGenerate,
  onHistory,
  onNext,
  children,
}) => {
  const border = 'var(--vscode-panel-border, rgba(127,127,127,0.22))';
  const subtleBackground = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';

  return (
    <div
      style={{
        maxWidth: 980,
        margin: '0 auto',
        border: `1px solid ${border}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--vscode-editor-background)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          padding: '20px 22px',
          borderBottom: `1px solid color-mix(in srgb, ${accent} 28%, ${border})`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 14%, var(--vscode-editor-background)) 0%, var(--vscode-editor-background) 72%)`,
        }}
      >
        <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
          <div
            style={{
              width: 44,
              height: 44,
              flex: '0 0 44px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 10,
              color: '#fff',
              background: accent,
              boxShadow: `0 8px 18px color-mix(in srgb, ${accent} 30%, transparent)`,
              fontSize: 21,
            }}
          >
            <FileSyncOutlined />
          </div>
          <div style={{ minWidth: 0 }}>
            <Text
              strong
              style={{ color: accent, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}
            >
              {flowLabel} · Config Generator
            </Text>
            <Title level={4} style={{ margin: '2px 0 4px', fontSize: 20 }}>
              归一化表格转 CFG
            </Title>
            <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
              {description}
            </Text>
          </div>
        </div>

        <Tag
          icon={<BranchesOutlined />}
          style={{
            flex: '0 0 auto',
            margin: 0,
            padding: '4px 10px',
            borderRadius: 999,
            color: 'var(--vscode-foreground)',
            borderColor: `color-mix(in srgb, ${accent} 36%, ${border})`,
            background: `color-mix(in srgb, ${accent} 9%, var(--vscode-editor-background))`,
          }}
        >
          {branch || '获取分支中...'}
        </Tag>
      </div>

      <div style={{ padding: '18px 22px 4px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 20,
          }}
        >
          {['准备项目环境', scopeLabel, '生成 CFG'].map((label, index) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                minWidth: 0,
                padding: '9px 11px',
                border: `1px solid ${index === 2 ? `color-mix(in srgb, ${accent} 42%, ${border})` : border}`,
                borderRadius: 8,
                background: index === 2
                  ? `color-mix(in srgb, ${accent} 8%, var(--vscode-editor-background))`
                  : subtleBackground,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  flex: '0 0 22px',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 6,
                  color: index === 2 ? '#fff' : accent,
                  background: index === 2
                    ? accent
                    : `color-mix(in srgb, ${accent} 13%, var(--vscode-editor-background))`,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <Text strong ellipsis style={{ fontSize: 12 }}>
                {label}
              </Text>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '18px 18px 4px',
            border: `1px solid ${border}`,
            borderRadius: 10,
            background: subtleBackground,
          }}
        >
          {children}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '14px 22px 18px',
        }}
      >
        <Space wrap>
          <Button icon={<SaveOutlined />} loading={saving} onClick={onSave}>
            保存配置
          </Button>
          <Button icon={<HistoryOutlined />} onClick={onHistory}>
            转换历史
          </Button>
        </Space>
        <Space wrap>
          <Button
            type="primary"
            loading={generating}
            onClick={onGenerate}
            icon={<FileSyncOutlined />}
            style={{ minWidth: 148, background: accent, borderColor: accent }}
          >
            生成 CFG
          </Button>
          <Button onClick={onNext}>
            下一页 <RightOutlined />
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default TransformConfigPanel;
