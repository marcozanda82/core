import React from 'react';

/**
 * Widget home / analisi: reminder catabolismo & timing proteico (ex “Radar metabolico: Lipolisi”).
 * Le props metaboliche legacy restano accettate per compatibilità ma non sono più mostrate.
 */
export default function MetabolicPhaseCompact({
  stateLabel: _stateLabel,
  stateColor: _stateColor,
  glycemiaValue: _glycemiaValue,
  digestionValue: _digestionValue,
  style,
}) {
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 12px',
        background: 'rgba(15, 23, 42, 0.55)',
        borderRadius: '12px',
        border: '1px solid rgba(148, 163, 184, 0.28)',
        boxSizing: 'border-box',
        minWidth: 0,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: '1.35rem',
          lineHeight: 1,
          flexShrink: 0,
          filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.35))',
        }}
        aria-hidden
      >
        ⚡
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: 'rgba(226, 232, 240, 0.95)',
            textTransform: 'uppercase',
            lineHeight: 1.35,
          }}
        >
          CATABOLISMO / DIGIUNO
        </div>
        <div
          style={{
            marginTop: '6px',
            fontSize: '0.78rem',
            lineHeight: 1.45,
            color: 'rgba(203, 213, 225, 0.92)',
            fontWeight: 500,
          }}
        >
          Assumi proteine o amminoacidi prima di allenarti.
        </div>
      </div>
    </div>
  );
}
