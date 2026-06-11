import type React from 'react';

export const pageStyle: React.CSSProperties = {
  padding: 4,
  color: 'var(--vscode-foreground)',
};

export const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
  background: 'var(--vscode-editor-background)',
};

export const mutedTextStyle: React.CSSProperties = {
  color: 'var(--vscode-descriptionForeground)',
};

export const accentPanelStyle: React.CSSProperties = {
  border: '1px solid var(--vscode-focusBorder, rgba(22,119,255,0.45))',
  background:
    'linear-gradient(135deg, rgba(22,119,255,0.18), rgba(82,196,26,0.08)), var(--vscode-editor-background)',
};

export const warmPanelStyle: React.CSSProperties = {
  border: '1px solid rgba(250, 173, 20, 0.38)',
  background:
    'linear-gradient(135deg, rgba(250,173,20,0.16), rgba(22,119,255,0.06)), var(--vscode-editor-background)',
};

export const greenPanelStyle: React.CSSProperties = {
  border: '1px solid rgba(82, 196, 26, 0.34)',
  background:
    'linear-gradient(135deg, rgba(82,196,26,0.14), rgba(22,119,255,0.05)), var(--vscode-editor-background)',
};

export const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  marginBottom: 14,
};

export const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

export const stepBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: '50%',
  fontSize: 12,
  fontWeight: 600,
  background: 'var(--vscode-badge-background, rgba(22, 119, 255, 0.16))',
  color: 'var(--vscode-badge-foreground, #ffffff)',
};

export const directionNodeStyle: React.CSSProperties = {
  flex: '1 1 220px',
  minWidth: 220,
  borderRadius: 12,
  border: '1px solid var(--vscode-panel-border, rgba(127,127,127,0.22))',
  background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
  padding: '12px 14px',
};

export const directionArrowStyle: React.CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--vscode-focusBorder, rgba(22,119,255,0.45))',
  background: 'linear-gradient(135deg, rgba(22,119,255,0.95), rgba(82,196,26,0.85))',
  color: '#ffffff',
  boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
  fontSize: 20,
};

export const swapButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(250, 173, 20, 0.55)',
  background: 'linear-gradient(135deg, rgba(250,173,20,0.95), rgba(250,140,22,0.9))',
  color: '#1f1f1f',
  fontWeight: 600,
};

export const sourceTagStyle: React.CSSProperties = {
  border: '1px solid rgba(22,119,255,0.45)',
  background: 'rgba(22,119,255,0.16)',
  color: 'var(--vscode-foreground)',
};

export const targetTagStyle: React.CSSProperties = {
  border: '1px solid rgba(82,196,26,0.45)',
  background: 'rgba(82,196,26,0.16)',
  color: 'var(--vscode-foreground)',
};

export const activeRepoCardStyle: React.CSSProperties = {
  background:
    'color-mix(in srgb, var(--vscode-editor-background, #fff) 88%, var(--vscode-focusBorder, #1677ff))',
  color: 'var(--vscode-foreground)',
};

export const inactiveRepoCardStyle: React.CSSProperties = {
  background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
  color: 'var(--vscode-foreground)',
};
