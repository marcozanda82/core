import React from 'react';

const BOOT_ICON_SRC = '/512.png';

/** Splash di boot mentre Firebase determina lo stato auth. */
export default function AuthLoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background: '#050a12',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}
      aria-busy
      aria-label="Verifica accesso KentuOS"
    >
      <img
        src={BOOT_ICON_SRC}
        alt=""
        width={128}
        height={128}
        decoding="async"
        style={{
          width: 128,
          height: 128,
          objectFit: 'contain',
          background: 'transparent',
        }}
      />
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
