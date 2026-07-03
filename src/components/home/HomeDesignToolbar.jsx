import React from 'react';

const btnBase = {
  padding: '10px 14px',
  borderRadius: 10,
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  border: 'none',
  whiteSpace: 'nowrap',
};

export default function HomeDesignToolbar({ isEditMode, onToggleEditMode, onExport, onReset }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={onToggleEditMode}
        style={{
          ...btnBase,
          border: isEditMode ? '1px solid #fbbf24' : '1px solid rgba(148, 163, 184, 0.45)',
          background: isEditMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(15, 23, 42, 0.92)',
          color: isEditMode ? '#fbbf24' : '#e2e8f0',
        }}
      >
        {isEditMode ? 'Blocca Layout' : 'Sblocca Layout'}
      </button>
      {isEditMode ? (
        <>
          <button
            type="button"
            onClick={onExport}
            style={{
              ...btnBase,
              border: '1px solid rgba(0, 229, 255, 0.45)',
              background: 'rgba(0, 229, 255, 0.12)',
              color: '#00e5ff',
            }}
          >
            Esporta Layout JSON
          </button>
          <button
            type="button"
            onClick={onReset}
            style={{
              ...btnBase,
              border: '1px solid rgba(248, 113, 113, 0.45)',
              background: 'rgba(248, 113, 113, 0.12)',
              color: '#fca5a5',
            }}
          >
            Reset Layout
          </button>
        </>
      ) : null}
    </div>
  );
}
