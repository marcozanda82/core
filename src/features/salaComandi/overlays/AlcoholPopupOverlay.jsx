import React from 'react';

export default function AlcoholPopupOverlay({
  showAlcoholPopup,
  onClose,
  alcoholForm,
  setAlcoholForm,
  manualNodes,
  getTimePositionPercent,
  getAlcoholBaseMl,
  getAlcoholGlassIcon,
  handleSaveAlcohol,
}) {
  if (!showAlcoholPopup) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#1a1a1c', padding: '24px', borderRadius: '20px', width: '90%', maxWidth: '380px', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1.8rem' }}>🍷</span>
          <h3 style={{ margin: 0, color: '#fff' }}>Aggiungi Drink</h3>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>00:00</span>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#aaa', textTransform: 'uppercase', marginBottom: '2px' }}>Orario</div>
              <div style={{ color: '#00e5ff', fontWeight: 'bold', fontSize: '1.2rem', background: '#111', padding: '4px 12px', borderRadius: '8px', border: '1px solid #333' }}>
                {alcoholForm.timeStr}
              </div>
            </div>
            <span style={{ color: '#666', fontSize: '0.8rem', fontWeight: 'bold' }}>23:59</span>
          </div>

          <div style={{ position: 'relative', height: '44px', background: '#111', borderRadius: '22px', border: '1px solid #222', display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'absolute', left: '20px', right: '20px', height: '4px', background: '#333', borderRadius: '2px' }} />

            {manualNodes.map((n) => {
              if (typeof n.time !== 'number') return null;
              const percent = getTimePositionPercent(n.time);
              return (
                <div key={n.id} style={{ position: 'absolute', left: `calc(20px + ${percent}% - ${percent * 0.4}px)`, width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', transform: 'translate(-50%, -50%)', top: '50%', pointerEvents: 'none' }} />
              );
            })}

            {(() => {
              const [h, m] = alcoholForm.timeStr.split(':').map(Number);
              const currentFloat = (h || 0) + ((m || 0) / 60);
              const currentPercent = getTimePositionPercent(currentFloat);
              const icon = alcoholForm.subtype === 'birra' ? '🍺' : alcoholForm.subtype === 'vino' ? '🍷' : '🥃';

              return (
                <>
                  <input
                    type="range"
                    min="0"
                    max="23.99"
                    step="0.25"
                    value={currentFloat}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const newH = Math.floor(val);
                      const newM = Math.round((val - newH) * 60);
                      setAlcoholForm({ ...alcoholForm, timeStr: `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}` });
                    }}
                    style={{ position: 'absolute', left: '10px', right: '10px', width: 'calc(100% - 20px)', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10, margin: 0 }}
                  />

                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: `calc(20px + ${currentPercent}% - ${currentPercent * 0.4}px)`,
                    transform: 'translate(-50%, -50%)',
                    width: '32px', height: '32px',
                    borderRadius: '50%',
                    background: '#f44336',
                    border: '2px solid #fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 12px rgba(244,67,54,0.6)',
                    pointerEvents: 'none', zIndex: 5,
                    transition: 'left 0.1s ease-out'
                  }}>
                    <span style={{ fontSize: '14px' }}>{icon}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {[
            { id: 'birra', label: 'Birra 🍺', ml: 330, abv: 5 },
            { id: 'vino', label: 'Vino 🍷', ml: 150, abv: 12 },
            { id: 'superalcolico', label: 'Shot/Cocktail 🥃', ml: 40, abv: 40 }
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setAlcoholForm({ ...alcoholForm, subtype: preset.id, ml: preset.ml, abv: preset.abv })}
              style={{
                flex: 1,
                padding: '10px 5px',
                background: alcoholForm.subtype === preset.id ? '#00e5ff' : '#2a2a2c',
                color: alcoholForm.subtype === preset.id ? '#000' : '#fff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: '0.2s'
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', padding: '15px 0', marginBottom: '10px' }}>
          {[...Array(5)].map((_, i) => {
            const baseMl = getAlcoholBaseMl(alcoholForm.subtype);
            const glassIcon = getAlcoholGlassIcon(alcoholForm.subtype);
            const mlNum = Number(alcoholForm.ml) || 0;
            const isFilled = mlNum >= baseMl * (i + 1);
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setAlcoholForm({ ...alcoholForm, ml: baseMl * (i + 1) });
                  }
                }}
                onClick={() => setAlcoholForm({ ...alcoholForm, ml: baseMl * (i + 1) })}
                style={{
                  fontSize: '2.2rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  opacity: isFilled ? 1 : 0.25,
                  filter: isFilled ? 'drop-shadow(0 0 8px rgba(255,255,255,0.2))' : 'grayscale(100%)',
                  transform: isFilled ? 'scale(1.1)' : 'scale(1)'
                }}
              >
                {glassIcon}
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#b0b0b0', marginBottom: '20px' }}>
          Tocca i bicchieri per impostare la quantità
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Quantità (ml)</label>
            <input type="number" value={alcoholForm.ml} onChange={(e) => setAlcoholForm({ ...alcoholForm, ml: e.target.value })} style={{ width: '100%', padding: '10px', background: '#111', border: '1px solid #444', borderRadius: '8px', color: '#fff' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Gradazione (%)</label>
            <input type="number" step="0.1" value={alcoholForm.abv} onChange={(e) => setAlcoholForm({ ...alcoholForm, abv: e.target.value })} style={{ width: '100%', padding: '10px', background: '#111', border: '1px solid #444', borderRadius: '8px', color: '#fff' }} />
          </div>
        </div>

        <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(244, 67, 54, 0.1)', border: '1px solid #f44336', borderRadius: '10px', fontSize: '0.85rem', color: '#ffbaba' }}>
          <div>
            Alcol puro:{' '}
            <strong>{((Number(alcoholForm.ml) * (Number(alcoholForm.abv) / 100)) * 0.8).toFixed(1)}g</strong>
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.8 }}>
            Calorie vuote stimate: {Math.round(((Number(alcoholForm.ml) * (Number(alcoholForm.abv) / 100)) * 0.8) * 7)} kcal
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#aaa', border: '1px solid #444', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Annulla</button>
          <button type="button" onClick={handleSaveAlcohol} style={{ flex: 2, padding: '12px', background: '#f44336', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Aggiungi Drink</button>
        </div>
      </div>
    </div>
  );
}
