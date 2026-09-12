import React from 'react';

function formatErrorMessage(error) {
  if (error == null) return 'Errore sconosciuto';
  if (typeof error === 'string') return error;
  const name = error?.name ? String(error.name) : 'Error';
  const message = error?.message ? String(error.message) : error.toString();
  return `${name}: ${message}`;
}

/**
 * Root error boundary — evita schermate bianche su crash React (requisito store).
 * I dettagli tecnici sono temporanei per diagnosticare il crash Chat al primo avvio del giorno.
 */
export default class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
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
      const { error, errorInfo } = this.state;
      const details = [
        formatErrorMessage(error),
        error?.stack ? `\n\n— stack —\n${error.stack}` : '',
        errorInfo?.componentStack ? `\n\n— componentStack —\n${errorInfo.componentStack}` : '',
      ].join('');

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
          <details
            open
            style={{
              marginTop: 22,
              width: '100%',
              maxWidth: 560,
              textAlign: 'left',
              borderRadius: 12,
              border: '1px solid rgba(248, 113, 113, 0.35)',
              background: 'rgba(15, 23, 42, 0.85)',
              padding: '10px 12px',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                color: '#fda4af',
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Dettagli tecnici (debug temporaneo)
            </summary>
            <pre
              style={{
                margin: '10px 0 0',
                maxHeight: '40vh',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.68rem',
                lineHeight: 1.45,
                color: '#fecaca',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              }}
            >
              {details.trim() || 'Nessuno stack disponibile'}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
