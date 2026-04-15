import React from 'react';

export default function MetabolicPhaseCompact({
  stateLabel,
  stateColor,
  glycemiaValue,
  digestionValue,
  style,
}) {
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '8px',
        border: `1px solid ${stateColor}40`,
        boxSizing: 'border-box',
        minWidth: 0,
        ...style,
      }}
    >
      <span style={{ fontSize: '0.7rem', color: '#888', whiteSpace: 'nowrap' }}>Radar metabolico:</span>
      <span
        style={{
          fontSize: '0.8rem',
          fontWeight: 'bold',
          color: stateColor,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
        title={stateLabel}
      >
        {stateLabel}
      </span>
      <span style={{ fontSize: '0.65rem', color: '#666', whiteSpace: 'nowrap' }}>
        🩸 {Math.round(Number(glycemiaValue) || 0)} · ⚙️ {Math.round(Number(digestionValue) || 0)}%
      </span>
    </div>
  );
}
