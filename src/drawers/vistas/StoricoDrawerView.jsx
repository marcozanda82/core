import React from 'react';

export default function StoricoDrawerView({
  onBack,
  selectedHistoryDate,
  setSelectedHistoryDate,
  selectedDayData,
  pastDaysStorico,
  expandedStoricoDate,
  setExpandedStoricoDate,
}) {
  return (
    <div className="view-animate">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
        <h2 style={{ fontSize: '0.8rem', color: '#b0bec5', letterSpacing: '2px', margin: 0 }}>📚 ARCHIVIO STORICO</h2>
        <div style={{ width: '70px' }} />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '0.7rem', color: '#888', letterSpacing: '1px', marginBottom: '8px' }}>Cerca per data</label>
        <input
          type="date"
          value={selectedHistoryDate}
          onChange={(e) => setSelectedHistoryDate(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', background: '#111', border: '1px solid #2a2a2a', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
        />
      </div>
      {selectedHistoryDate && (
        <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(176, 190, 197, 0.06)', border: '1px solid rgba(176, 190, 197, 0.2)', borderRadius: '12px' }}>
          {selectedDayData ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px', fontSize: '0.8rem' }}>
                <span style={{ color: '#b0bec5' }}>{new Date(`${selectedHistoryDate}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                <span style={{ color: '#00e5ff' }}>{Math.round(selectedDayData.calorie)} kcal</span>
                <span style={{ color: '#b388ff' }}>{selectedDayData.proteine.toFixed(1)} g prot</span>
                <span style={{ color: selectedDayData.deficit < 0 ? '#00e676' : selectedDayData.deficit > 0 ? '#ff6d00' : '#888' }}>
                  {selectedDayData.deficit < 0 ? `${selectedDayData.deficit} kcal (Deficit)` : selectedDayData.deficit > 0 ? `+${selectedDayData.deficit} kcal (Surplus)` : '0 kcal (Pari)'}
                </span>
              </div>
              <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '8px' }}>Dettaglio</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(selectedDayData.log || []).map((entry, idx) => {
                  if (entry.type === 'meal' && entry.items) {
                    const tot = (entry.items || []).reduce((a, it) => ({ prot: a.prot + (it.prot || 0), cal: a.cal + ((it.cal || it.kcal) || 0) }), { prot: 0, cal: 0 });
                    return (
                      <div key={idx}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#e4e6eb' }}>{entry.desc || 'Pasto'} — {tot.prot.toFixed(1)} g prot, {Math.round(tot.cal)} kcal</div>
                        {(entry.items || []).map((item, i) => (
                          <div key={i} style={{ paddingLeft: '12px', fontSize: '0.75rem', color: '#b0b3b8' }}>{item.desc} · {(item.qta || item.weight) || ''}g · {Math.round((item.cal || item.kcal) || 0)} kcal</div>
                        ))}
                      </div>
                    );
                  }
                  if (entry.type === 'single' || !entry.type) {
                    return <div key={idx} style={{ fontSize: '0.8rem', color: '#b0b3b8' }}>{entry.desc} · {Math.round((entry.cal || entry.kcal) || 0)} kcal</div>;
                  }
                  if (entry.type === 'workout') {
                    return <div key={idx} style={{ fontSize: '0.8rem', color: '#ff6d00' }}>{entry.desc} — {Math.round((entry.cal || entry.kcal) || 0)} kcal (bruciate)</div>;
                  }
                  return null;
                })}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#888', fontStyle: 'italic' }}>Nessun dato registrato per questa data.</p>
          )}
        </div>
      )}
      <h3 className="diary-group-title" style={{ borderLeftColor: '#b0bec5', marginBottom: '12px' }}>Tutti i giorni</h3>
      {pastDaysStorico.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', fontStyle: 'italic' }}>Nessun giorno passato in archivio.</p>
      ) : (
        <div className="storico-accordion">
          {pastDaysStorico.map(({ dataStr, log, calorie, proteine, deficit }) => {
            const isExpanded = expandedStoricoDate === dataStr;
            const dataFormatted = new Date(`${dataStr}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const deficitText = deficit < 0 ? `${deficit} kcal (Deficit)` : deficit > 0 ? `+${deficit} kcal (Surplus)` : '0 kcal (Pari)';
            return (
              <div key={dataStr} style={{ marginBottom: '8px', border: '1px solid #2a2a2a', borderRadius: '12px', overflow: 'hidden', background: isExpanded ? 'rgba(176, 190, 197, 0.06)' : 'rgba(255,255,255,0.02)' }}>
                <button type="button" onClick={() => setExpandedStoricoDate(isExpanded ? null : dataStr)} style={{ width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{dataFormatted}</span>
                  <span style={{ fontSize: '0.75rem', color: '#00e5ff' }}>{Math.round(calorie)} kcal</span>
                  <span style={{ fontSize: '0.75rem', color: '#b388ff' }}>{proteine.toFixed(1)} g prot</span>
                  <span style={{ fontSize: '0.75rem', color: deficit < 0 ? '#00e676' : deficit > 0 ? '#ff6d00' : '#888' }}>{deficitText}</span>
                  <span style={{ fontSize: '1rem', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                </button>
                {isExpanded && (
                  <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #2a2a2a', background: 'rgba(0,0,0,0.3)' }}>
                    <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '10px' }}>Dettaglio pasti e alimenti</h4>
                    {(log || []).length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>Nessun dettaglio per questo giorno.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(log || []).map((entry, idx) => {
                          if (entry.type === 'meal' && entry.items) {
                            const totPasto = (entry.items || []).reduce((a, it) => ({ prot: a.prot + (it.prot || 0), cal: a.cal + ((it.cal || it.kcal) || 0) }), { prot: 0, cal: 0 });
                            return (
                              <div key={idx} style={{ marginBottom: '4px' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#e4e6eb', marginBottom: '4px' }}>{entry.desc || 'Pasto'} — {totPasto.prot.toFixed(1)} g prot, {Math.round(totPasto.cal)} kcal</div>
                                {(entry.items || []).map((item, i) => (
                                  <div key={i} style={{ paddingLeft: '16px', fontSize: '0.8rem', color: '#b0b3b8', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{item.desc}</span>
                                    <span>{item.qta || item.weight}g · {(item.prot || 0).toFixed(1)} g · {Math.round((item.cal || item.kcal) || 0)} kcal</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          if (entry.type === 'single' || !entry.type) {
                            return (
                              <div key={idx} style={{ fontSize: '0.8rem', color: '#b0b3b8', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{entry.desc}</span>
                                <span>{(entry.qta || entry.weight) || ''}g · {(entry.prot || 0).toFixed(1)} g · {Math.round((entry.cal || entry.kcal) || 0)} kcal</span>
                              </div>
                            );
                          }
                          if (entry.type === 'workout') {
                            return (
                              <div key={idx} style={{ fontSize: '0.8rem', color: '#ff6d00', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{entry.desc}</span>
                                <span>{Math.round((entry.cal || entry.kcal) || 0)} kcal (bruciate)</span>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
