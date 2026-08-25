/**
 * Conferma cancellazione programmazione fantasma (singolo slot o tutta la giornata).
 */

export default function GhostProgramDeleteModal({
  open = false,
  onClose = null,
  onConfirmSingle = null,
  onConfirmAll = null,
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ghost-delete-title"
      onClick={() => onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100025,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          padding: '22px 20px',
          borderRadius: 18,
          border: '1px solid rgba(0, 229, 255, 0.22)',
          background: 'linear-gradient(155deg, rgba(28, 32, 40, 0.92) 0%, rgba(14, 16, 22, 0.88) 100%)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <h3 id="ghost-delete-title" style={{ margin: '0 0 8px 0', color: '#e8fdff', fontSize: '1.05rem', fontWeight: 800 }}>
          Programmazione Kentu
        </h3>
        <p style={{ margin: '0 0 18px 0', color: 'rgba(200, 220, 230, 0.88)', fontSize: '0.88rem', lineHeight: 1.5 }}>
          Questo slot è pianificato dall&apos;AI. Vuoi rimuovere solo questo elemento o tutta la programmazione fantasma di oggi?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => onConfirmSingle?.()}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(0, 229, 255, 0.45)',
              background: 'rgba(0, 229, 255, 0.12)',
              color: '#00e5ff',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Cancella solo questo
          </button>
          <button
            type="button"
            onClick={() => onConfirmAll?.()}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(248, 113, 113, 0.35)',
              background: 'rgba(248, 113, 113, 0.1)',
              color: '#fca5a5',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Cancella tutta la programmazione
          </button>
          <button
            type="button"
            onClick={() => onClose?.()}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: 'rgba(180, 190, 200, 0.95)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
