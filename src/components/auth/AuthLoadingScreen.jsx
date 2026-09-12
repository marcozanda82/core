import React from 'react';

/** Sotto-splash scuro mentre Firebase determina lo stato auth (emblema = KentuBootSplash). */
export default function AuthLoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background: '#0b0f19',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-busy
      aria-label="Verifica accesso KentuOS"
    />
  );
}
