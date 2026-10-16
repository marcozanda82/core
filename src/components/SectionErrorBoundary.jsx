import React from 'react';

/**
 * Error boundary di sezione — isola crash di rendering senza smontare SalaComandi.
 * Riprova resetta lo stato; Chiudi (opzionale) invoca onClose del genitore.
 */
export default class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const label = String(this.props.label || 'section');
    console.error(`[SectionErrorBoundary:${label}]`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleClose = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onClose === 'function') {
      this.props.onClose();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const label = String(this.props.label || 'questa sezione');
    const canClose = typeof this.props.onClose === 'function';

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-[12rem] w-full flex-1 flex-col items-center justify-center gap-4 bg-zinc-950/95 px-6 py-10 text-center text-zinc-100"
      >
        <p className="m-0 text-sm font-semibold text-zinc-100">
          Qualcosa è andato storto in {label}
        </p>
        <p className="m-0 max-w-xs text-xs leading-relaxed text-zinc-500">
          Il resto dell&apos;app resta disponibile. Puoi riprovare o chiudere questa superficie.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-xl border border-cyan-400/45 bg-cyan-400/15 px-4 py-2.5 text-sm font-semibold text-cyan-100"
          >
            Riprova
          </button>
          {canClose ? (
            <button
              type="button"
              onClick={this.handleClose}
              className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-zinc-200"
            >
              Chiudi
            </button>
          ) : null}
        </div>
      </div>
    );
  }
}
