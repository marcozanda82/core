import React from 'react';

const OlioEvoCruetIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M16 29C9 29 7 25 7 19C7 13 13 9 13 5H19C19 9 25 13 25 19C25 25 23 29 16 29Z"
      fill="#FBBF24"
      stroke="#B45309"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M8 22C8.5 26 11 28 16 28C21 28 23.5 26 24 22H8Z" fill="#65A30D" opacity="0.6" />
    <rect x="12" y="14" width="8" height="9" rx="1.5" fill="#FAFAF9" stroke="#D1D5DB" strokeWidth="0.5" />
    <path d="M14 16.5C14 15 17 15 17 17.5C17 19 14 19 14 16.5Z" fill="#4D7C0F" />
    <rect x="13.5" y="3" width="5" height="2" rx="0.5" fill="#374151" />
    <path
      d="M16 3V1.5C16 0.5 14 0.5 13 1L10.5 1.5"
      fill="none"
      stroke="#D1D5DB"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M10.5 2.5C10.5 2.5 9 4 9 5C9 5.8 9.7 6.5 10.5 6.5C11.3 6.5 12 5.8 12 5C12 4 10.5 2.5 10.5 2.5Z"
      fill="#FBBF24"
    />
    <path
      d="M10 18C10 15 11 12 12.5 9"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="1.5"
      strokeLinecap="round"
      opacity="0.8"
    />
  </svg>
);

export default function MacroPlateVisualizer({ mealMacros = {}, targetMacros = {} }) {
  // Calcola la scala visiva: 0 se vuoto, 1 se target raggiunto, max 2.5 per l'eccesso
  const getScale = (current, target) => {
    if (!target || target === 0) return current > 0 ? 1 : 0;
    const ratio = current / target;
    return Math.min(ratio, 2.5); // Tetto massimo per non rompere la UI
  };

  /** Semaforo testo grammi: verde ≤ target, arancione entro +10%, rosso oltre. */
  const getMacroTextColor = (current, target) => {
    const cur = Number(current) || 0;
    const tgt = Number(target) || 0;
    if (tgt === 0) {
      if (cur > 0) return '#ef4444';
      return '#10b981';
    }
    if (cur <= tgt) return '#10b981';
    if (cur <= tgt * 1.1) return '#f59e0b';
    return '#ef4444';
  };

  // Definizione dei 4 spicchi
  const quadrants = [
    { id: 'pro', label: 'Proteine', icon: '🥩', current: mealMacros.pro || 0, target: targetMacros.pro || 0, color: '#ef4444', 
      pos: { top: '25%', left: '25%' }, align: 'left' },
    { id: 'carbo', label: 'Carboidrati', icon: '🍝', current: mealMacros.carbo || 0, target: targetMacros.carbo || 0, color: '#3b82f6', 
      pos: { top: '25%', left: '75%' }, align: 'right' },
    { id: 'fat', label: 'Grassi', icon: null, current: mealMacros.fat || 0, target: targetMacros.fat || 0, color: '#f59e0b', 
      pos: { top: '75%', left: '25%' }, align: 'left' },
    { id: 'fiber', label: 'Fibre/Verd.', icon: '🥦', current: mealMacros.fiber ?? 0, target: targetMacros.fiber ?? 15, color: '#10b981', 
      pos: { top: '75%', left: '75%' }, align: 'right' },
  ];

  const visualHarmonizer = {
    '🥩': 1.3, // Fattore correttivo per la bistecca (più grande del 30%)
    '🍝': 1.0,
    fat: 1.2, // Ampolla EVO SVG
    '🥦': 1.0
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', maxWidth: '320px', gap: '20px', marginBottom: '20px' }}>
        {/* Etichette Superiori */}
        <div style={{ textAlign: 'center' }}>
           <div style={{ fontSize: '12px', fontWeight: 'bold', color: quadrants[0].color }}>{quadrants[0].label}</div>
           <div style={{ color: getMacroTextColor(quadrants[0].current, quadrants[0].target), fontWeight: '600' }}>
             {Math.round(quadrants[0].current)} / {Math.round(quadrants[0].target)}g
           </div>
        </div>
        <div style={{ textAlign: 'center' }}>
           <div style={{ fontSize: '12px', fontWeight: 'bold', color: quadrants[1].color }}>{quadrants[1].label}</div>
           <div style={{ color: getMacroTextColor(quadrants[1].current, quadrants[1].target), fontWeight: '600' }}>
             {Math.round(quadrants[1].current)} / {Math.round(quadrants[1].target)}g
           </div>
        </div>
      </div>

      {/* PIATTO CENTRALE */}
      <div style={{
        position: 'relative', width: '180px', height: '180px', 
        borderRadius: '50%', border: '4px solid #334155', backgroundColor: '#0f172a',
        boxShadow: '0 8px 16px rgba(0,0,0,0.3)', overflow: 'visible'
      }}>
        {/* Croce Divisoria Interna */}
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', backgroundColor: '#1e293b', transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', backgroundColor: '#1e293b', transform: 'translateX(-50%)' }} />

        {/* Render Icone con Animazione di Scala */}
        {quadrants.map((q) => {
          const scaleVal = getScale(q.current, q.target);
          const iconHarmony = visualHarmonizer[q.id] ?? visualHarmonizer[q.icon] ?? 1;
          const currentGrams = Number(q.current) || 0;
          const iconVisible = currentGrams > 0.1;
          return (
            <div key={q.id} style={{
              position: 'absolute', ...q.pos,
              transform: `translate(-50%, -50%) scale(${scaleVal * iconHarmony})`,
              transition: 'opacity 0.3s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              fontSize: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: iconVisible ? 1 : 0,
              zIndex: scaleVal > 1 ? 10 : 1 // Se supera 1, va sopra gli altri
            }}>
              {q.id === 'fat' ? <OlioEvoCruetIcon /> : q.icon}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', maxWidth: '320px', gap: '20px', marginTop: '20px' }}>
        {/* Etichette Inferiori */}
        <div style={{ textAlign: 'center' }}>
           <div style={{ fontSize: '12px', fontWeight: 'bold', color: quadrants[2].color }}>{quadrants[2].label}</div>
           <div style={{ color: getMacroTextColor(quadrants[2].current, quadrants[2].target), fontWeight: '600' }}>
             {Math.round(quadrants[2].current)} / {Math.round(quadrants[2].target)}g
           </div>
        </div>
        <div style={{ textAlign: 'center' }}>
           <div style={{ fontSize: '12px', fontWeight: 'bold', color: quadrants[3].color }}>{quadrants[3].label}</div>
           <div style={{ color: getMacroTextColor(quadrants[3].current, quadrants[3].target), fontWeight: '600' }}>
             {Math.round(quadrants[3].current)} / {Math.round(quadrants[3].target)}g
           </div>
        </div>
      </div>

    </div>
  );
}
