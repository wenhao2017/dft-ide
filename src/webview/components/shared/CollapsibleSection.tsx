import React, { useState } from 'react';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

interface CollapsibleSectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = true,
  style,
  bodyStyle,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <section style={{ margin: '18px 0 14px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'} ${String(title)}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            border: 0,
            padding: 0,
            margin: 0,
            background: 'transparent',
            color: hovered || focused ? 'var(--vscode-focusBorder, #2563eb)' : 'var(--vscode-foreground)',
            cursor: 'pointer',
            lineHeight: 1.2,
            outline: 'none',
            borderRadius: 3,
            transition: 'color 120ms ease',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              borderRadius: 4,
              color: hovered || focused
                ? 'var(--vscode-focusBorder, #2563eb)'
                : 'var(--vscode-descriptionForeground, rgba(127,127,127,0.85))',
              background: hovered
                ? 'var(--vscode-toolbar-hoverBackground, rgba(127,127,127,0.12))'
                : 'transparent',
              fontSize: 10,
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            {open ? <DownOutlined /> : <RightOutlined />}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0 }}>
            {title}
          </span>
        </button>
        <div
          style={{
            flex: 1,
            height: 1,
            background: 'linear-gradient(90deg, var(--vscode-panel-border, rgba(127,127,127,0.24)), transparent)',
          }}
        />
      </div>
      {open && <div style={{ marginTop: 14, ...bodyStyle }}>{children}</div>}
    </section>
  );
};

export default CollapsibleSection;
