import React from 'react';

/**
 * Bussola metabolica — base vuota per un futuro modello vettoriale.
 */
export default function MetabolicCompass() {
  return (
    <div
      className="metabolic-compass-root"
      style={{
        width: '100%',
        maxWidth: 420,
        margin: '0 auto',
        padding: 'clamp(1rem, 4vw, 1.5rem)',
        boxSizing: 'border-box',
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 650, color: '#e8f4ff' }}>
          Metabolic Compass
        </h1>
      </header>
      <main style={{ marginTop: 16, color: 'rgba(200, 210, 220, 0.9)', fontSize: '0.9rem', lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}>Contenuto bussola in costruzione.</p>
      </main>
    </div>
  );
}
