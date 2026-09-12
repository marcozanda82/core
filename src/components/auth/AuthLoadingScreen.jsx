import React from 'react';

/** Sotto-splash nero mentre Firebase determina lo stato auth. */
export default function AuthLoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-busy
      aria-label="Verifica accesso KentuOS"
    />
  );
}
