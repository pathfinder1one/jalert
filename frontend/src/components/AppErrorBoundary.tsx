import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Something went wrong while opening this page.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('JALERT frontend error:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="page-shell">
        <section className="section">
          <div className="content-card" style={{ maxWidth: '760px', margin: '0 auto' }}>
            <span className="page-hero-badge">Page issue detected</span>
            <h1 style={{ marginTop: '16px' }}>This page could not open correctly</h1>
            <p className="body-copy">
              A frontend error interrupted this screen. Refresh once, and if it still appears,
              restart the local JALERT server.
            </p>
            <div className="stack" style={{ marginTop: '20px' }}>
              <div className="alert-card">
                <strong>Error detail</strong>
                <p className="subtle" style={{ marginTop: '8px' }}>
                  {this.state.message}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
