import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

interface ErrorBoundaryState {
  error: Error | null;
}

class WebviewErrorBoundary extends React.Component<
  React.PropsWithChildren<unknown>,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[HiSalad] Webview render failed', error, info);
  }

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main
        style={{
          boxSizing: 'border-box',
          minHeight: '100vh',
          padding: 24,
          color: 'var(--vscode-foreground, #cccccc)',
          background: 'var(--vscode-editor-background, #1e1e1e)',
          fontFamily: 'var(--vscode-font-family, sans-serif)',
        }}
      >
        <h2>HiSalad failed to load</h2>
        <p>
          Reload this view. If the problem continues, open Developer Tools and
          inspect the console error.
        </p>
        <pre
          style={{
            overflow: 'auto',
            padding: 12,
            border: '1px solid var(--vscode-panel-border, #555)',
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {this.state.error.message}
        </pre>
        <button type={'button'} onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
    },
  });

  root.render(
    <React.StrictMode>
      <WebviewErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </WebviewErrorBoundary>
    </React.StrictMode>
  );
}
