import { createPortal } from 'react-dom';

/**
 * Snackbar globale: conferma assegnazione Inbox + azione Annulla.
 */
export default function InboxUndoToast({
  message = '',
  undoLabel = 'Annulla',
  onUndo = null,
  onDismiss = null,
}) {
  if (!message || typeof document === 'undefined') return null;

  return createPortal(
    <div className="inbox-undo-toast" role="status" aria-live="polite">
      <span className="inbox-undo-toast__msg">{message}</span>
      <button
        type="button"
        className="inbox-undo-toast__undo"
        onClick={() => onUndo?.()}
      >
        {undoLabel}
      </button>
      <button
        type="button"
        className="inbox-undo-toast__close"
        onClick={() => onDismiss?.()}
        aria-label="Chiudi"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
