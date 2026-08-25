import React from 'react';

/**
 * Root error boundary — evita schermate bianche su crash React (requisito store).
 */
export default class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[GlobalErrorBoundary] React render crash', error, errorInfo);
    if (error?.stack) {
      console.error('[GlobalErrorBoundary] stack:', error.stack);
    }
    if (errorInfo?.componentStack) {
      console.error('[GlobalErrorBoundary] component stack:', errorInfo.componentStack);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: '100dvh',
            width: '100%',
            background: '#050a12',
            color: '#e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
            textAlign: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <img
            src="/EmblemaKbianca.png"
            alt="KentuOS"
            width={72}
            height={72}
            style={{ marginBottom: 24, opacity: 0.95 }}
          />
          <h1
            style={{
              margin: '0 0 12px',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#f8fafc',
            }}
          >
            Ops! Qualcosa è andato storto
          </h1>
          <p
            style={{
              margin: '0 0 28px',
              maxWidth: 320,
              fontSize: '0.9rem',
              lineHeight: 1.5,
              color: '#94a3b8',
            }}
          >
            KentuOS ha incontrato un errore imprevisto. Ricarica l&apos;app per riprendere.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              border: '1px solid rgba(34, 211, 238, 0.45)',
              background: 'rgba(34, 211, 238, 0.12)',
              color: '#cffafe',
              borderRadius: 12,
              padding: '12px 22px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ricarica App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
