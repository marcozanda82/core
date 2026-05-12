import React from 'react';
import EnergyArc from './EnergyArc';
import { formatBodyBatteryValue } from '../features/salaComandi/utils/bodyMetricsUtils';

export default function BodyBatteryModal({ onClose, batteryData }) {
  if (!batteryData) return null;
  const { currentEnergy, maxCapacity, breakdown, hasNapBoost } = batteryData;
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.72)',
        zIndex: 100030,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backdropFilter: 'blur(5px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="body-battery-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(165deg, #18181b 0%, #0c0c0f 100%)',
          border: '1px solid #3f3f46',
          borderRadius: '18px',
          padding: '24px 20px 20px',
          width: '100%',
          maxWidth: '360px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 48px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '1.35rem', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '14px' }}>
          <EnergyArc percentage={currentEnergy} size="large" hasNapBoost={!!hasNapBoost} />
        </div>
        {hasNapBoost ? (
          <p style={{ margin: '0 0 8px 0', fontSize: '0.72rem', color: '#22d3ee', textAlign: 'center', fontWeight: 600 }}>
            Sonnellino attivo — recupero extra
          </p>
        ) : null}
        <p style={{ margin: '0 0 6px 0', fontSize: '0.7rem', color: '#71717a', textAlign: 'center' }}>
          Tetto teorico {maxCapacity}% · energia attuale {currentEnergy}%
        </p>
        <h3
          id="body-battery-title"
          style={{
            margin: '0 0 14px 0',
            color: '#e4e4e7',
            fontSize: '0.88rem',
            fontWeight: 700,
            textAlign: 'center',
            letterSpacing: '0.04em',
          }}
        >
          Estratto Conto Energia
        </h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(breakdown || []).map((row, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 0',
                borderBottom: i < (breakdown || []).length - 1 ? '1px solid #27272a' : 'none',
              }}
            >
              <span style={{ color: '#d4d4d8', fontSize: '0.8rem', lineHeight: 1.35 }}>{row.label}</span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                  color:
                    row.type === 'positive' ? '#22d3ee' : row.type === 'negative' ? '#f97316' : '#a1a1aa',
                }}
              >
                {formatBodyBatteryValue(row.value)}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: '20px',
            padding: '12px',
            background: '#3f3f46',
            color: '#fafafa',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '0.88rem',
            cursor: 'pointer',
          }}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}
