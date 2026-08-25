/**
 * Popup informativo carico SNC / overtraining.
 */

export default function SncStressPopup({
  open = false,
  sncStressLevel = 0,
  onClose = null,
}) {
  if (!open) return null;

  const level = Number(sncStressLevel) || 0;
  const isAlarm = level >= 85;

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }}
      onClick={() => onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="snc-popup-title"
        style={{
          background: '#1a1a1c',
          padding: '24px',
          borderRadius: '16px',
          border: isAlarm ? '1px solid #f44336' : '1px solid #ff9800',
          width: '90%',
          maxWidth: '350px',
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>{isAlarm ? '⚠️' : '⚡'}</div>
        <h3 id="snc-popup-title" style={{ color: '#fff', marginTop: 0 }}>
          {isAlarm ? 'Allarme Overtraining' : 'Affaticamento SNC'}
        </h3>
        <p style={{ color: '#b0b0b0', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '20px' }}>
          Sistema Nervoso Centrale saturo al <strong>{Math.round(level)}%</strong>.<br /><br />
          {isAlarm
            ? "Si consigliano 3-5 giorni di scarico attivo (niente allenamenti pesanti) per resettare l'energia massima ed evitare lo stallo metabolico."
            : 'Il carico allostatico sta aumentando. Presta attenzione al recupero nei prossimi giorni.'}
        </p>
        <button
          type="button"
          onClick={() => onClose?.()}
          style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
        >
          Ho capito
        </button>
      </div>
    </div>
  );
}
