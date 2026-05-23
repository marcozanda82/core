import React from 'react';

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
    { id: 'fat', label: 'Grassi', icon: '🥑', current: mealMacros.fat || 0, target: targetMacros.fat || 0, color: '#f59e0b', 
      pos: { top: '75%', left: '25%' }, align: 'left' },
    { id: 'fiber', label: 'Fibre/Verd.', icon: '🥦', current: mealMacros.fiber ?? 0, target: targetMacros.fiber ?? 15, color: '#10b981', 
      pos: { top: '75%', left: '75%' }, align: 'right' },
  ];

  const visualHarmonizer = {
    '🥩': 1.3, // Fattore correttivo per la bistecca (più grande del 30%)
    '🍝': 1.0,
    '🥑': 1.0,
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
          const iconHarmony = visualHarmonizer[q.icon] ?? 1;
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
              {q.icon}
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
