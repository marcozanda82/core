import React from 'react';

/** Spinner minimale mentre Firebase determina lo stato auth. */
export default function AuthLoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background: '#050a12',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-busy
      aria-label="Verifica accesso KentuOS"
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: '2px solid rgba(255,255,255,0.08)',
          borderTopColor: '#22d3ee',
          borderRadius: '50%',
          animation: 'kentu-auth-boot-spin 0.8s linear infinite',
        }}
      />
      <style>
        {'@keyframes kentu-auth-boot-spin { to { transform: rotate(360deg); } }'}
      </style>
    </div>
  );
}
