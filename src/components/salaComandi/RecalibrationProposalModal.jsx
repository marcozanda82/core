/**
 * Modale proposta ricalibrazione target dopo nuova pesata.
 */

import { useEffect, useState } from 'react';

export default function RecalibrationProposalModal({
  recalibrationProposal = null,
  onDismiss = null,
  onApply = null,
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!recalibrationProposal?.show) setShowDetails(false);
  }, [recalibrationProposal?.show]);

  if (!recalibrationProposal?.show || !recalibrationProposal?.analysis) return null;

  const ra = recalibrationProposal.analysis;
  const showRecalApply =
    ra.diagnosisType === 'tdee_mismatch'
    && ra.confidence === 'high'
    && ra.suggestion?.type !== 'no_change'
    && Number.isFinite(Number(ra.suggestion?.kcalAdjustment))
    && Number(ra.suggestion?.kcalAdjustment) !== 0;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.86)',
        zIndex: 100060,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '18px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#161616',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          padding: 18,
          color: '#f8fafc',
        }}
      >
        <h3 style={{ margin: '0 0 12px', color: '#00e5ff', fontSize: '1rem' }}>
          Nuova pesata registrata
        </h3>
        <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '0.8rem' }}>
          Analisi sugli ultimi {ra.daysWindow} giorni
        </p>
        <div
          style={{
            background: 'rgba(0, 229, 255, 0.12)',
            border: '1px solid rgba(0, 229, 255, 0.28)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 12,
            fontSize: '0.92rem',
            lineHeight: 1.5,
            color: '#f1f5f9',
            fontWeight: 600,
          }}
        >
          {ra.diagnosisMessage || ra.suggestion?.explanation}
        </div>
        {showDetails && (
          <div
            style={{
              marginBottom: 12,
              background: '#0f172a',
              border: '1px solid rgba(148,163,184,0.25)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: '0.78rem',
              color: '#cbd5e1',
              lineHeight: 1.45,
            }}
          >
            <div>Bilancio medio: {Math.round(Number(ra.avgKcalBalance) || 0)} kcal/giorno</div>
            <div>
              Variazione peso: {(Number(ra.weightDelta) >= 0 ? '+' : '')}
              {(Number(ra.weightDelta) || 0).toFixed(2)} kg
            </div>
            <div>
              Variazione attesa: {(Number(ra.expectedWeightDelta) >= 0 ? '+' : '')}
              {(Number(ra.expectedWeightDelta) || 0).toFixed(2)} kg
            </div>
            <div>
              Scostamento: {(Number(ra.discrepancy) >= 0 ? '+' : '')}
              {(Number(ra.discrepancy) || 0).toFixed(2)} kg
            </div>
            <div>Affidabilita: {String(ra.confidence || 'n/a')}</div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <button
            type="button"
            onClick={() => onDismiss?.()}
            style={{
              padding: '11px 12px',
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'transparent',
              color: '#cbd5e1',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Mantieni target attuali
          </button>
          {showRecalApply ? (
            <button
              type="button"
              onClick={() => onApply?.()}
              style={{
                padding: '11px 12px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #00e5ff, #38bdf8)',
                color: '#052236',
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              Applica correzione ({Number(ra.suggestion?.kcalAdjustment) >= 0 ? '+' : ''}{Math.round(Number(ra.suggestion?.kcalAdjustment) || 0)} kcal)
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            style={{
              padding: '9px 10px',
              borderRadius: 10,
              border: '1px dashed rgba(148,163,184,0.45)',
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.78rem',
            }}
          >
            {showDetails ? 'Nascondi dettagli' : 'Vedi dettagli'}
          </button>
        </div>
      </div>
    </div>
  );
}
