import { createPortal } from 'react-dom';
import MealTrashSection from './MealTrashSection';

/**
 * Pannello dedicato del cestino pasti (portal sopra il menu Pasti).
 */
export default function MealTrashSheet({
  open = false,
  items = [],
  onRestore = null,
  onPurge = null,
  onClose = null,
}) {
  if (!open || typeof document === 'undefined') return null;
  const list = Array.isArray(items) ? items : [];

  return createPortal(
    <div
      className="meal-trash-sheet-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-trash-sheet-title"
        className="meal-trash-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="inbox-triage-sheet__handle" aria-hidden />
        <h2 id="meal-trash-sheet-title" className="inbox-triage-sheet__title">
          Cestino
        </h2>
        <p className="meal-trash__hint">Ogni pasto scade 24 ore dopo l’eliminazione.</p>
        {list.length === 0 ? (
          <p className="meal-trash__empty">Nessun pasto nel cestino.</p>
        ) : (
          <MealTrashSection
            compact
            hideHeader
            items={list}
            onRestore={onRestore}
            onPurge={onPurge}
          />
        )}
        <button
          type="button"
          className="inbox-triage-sheet__btn inbox-triage-sheet__btn--ghost"
          onClick={() => onClose?.()}
        >
          Chiudi
        </button>
      </div>
    </div>,
    document.body,
  );
}
