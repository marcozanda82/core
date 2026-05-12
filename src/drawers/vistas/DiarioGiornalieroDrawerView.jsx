import React from 'react';
import TelemetryPanel from '../../telemetry/TelemetryPanel';
import { MEAL_LABELS_SAVE, toCanonicalMealType } from '../../coreEngine';

export default function DiarioGiornalieroDrawerView({
  onBack,
  diarioTab,
  setDiarioTab,
  activeLog,
  workoutsLog,
  groupedFoods,
  decimalToTimeStr,
  removeLogItem,
  setSleepModal,
  loadMealToConstructor,
  expandedRecipes,
  toggleRecipe,
  setSelectedFoodForInfo,
  telemetrySubTab,
  setTelemetrySubTab,
  telemetryScrollRef,
  totali,
  dynamicDailyKcal,
  userTargets,
  drilldownKey,
  onToggleNutrientDrilldown,
  drilldownFoodEntriesForToday,
}) {
  return (
    <div className="view-animate">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
        <h2 style={{ fontSize: '0.8rem', color: '#00e676', letterSpacing: '2px', margin: 0 }}>📓 DIARIO GIORNALIERO</h2>
        <div style={{ width: '70px' }} />
      </div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#111', padding: '5px', borderRadius: '15px' }}>
        <button type="button" className={`type-btn ${diarioTab === 'storico' ? 'active blue' : ''}`} onClick={() => setDiarioTab('storico')} style={{ border: 'none' }}>Registro voci</button>
        <button type="button" className={`type-btn ${diarioTab === 'telemetria' ? 'active blue' : ''}`} onClick={() => setDiarioTab('telemetria')} style={{ border: 'none' }}>Bioscan 40</button>
      </div>
      {diarioTab === 'storico' && (
        <div style={{ minHeight: '200px' }}>
          {(activeLog || []).filter((item) => item.type === 'sleep').map((item) => (
            <div
              key={item.id}
              style={{
                background: 'linear-gradient(145deg, #1a1c29, #11121a)',
                borderLeft: '4px solid #4ba3e3',
                borderRadius: '12px',
                padding: '15px',
                marginBottom: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#4ba3e3', fontWeight: 'bold', fontSize: '1.1rem' }}>🌙 Riposo Notturno</span>
                <span style={{ color: '#888', fontSize: '0.85rem', textAlign: 'right' }}>
                  {(() => {
                    const bed = item.bedtime ?? item.sleepStart;
                    const wak = item.wakeTime ?? item.sleepEnd;
                    const bedStr =
                      typeof bed === 'number' && Number.isFinite(bed)
                        ? `${Math.floor(bed)}:${String(Math.round((bed % 1) * 60)).padStart(2, '0')}`
                        : '—';
                    const wakeStr =
                      typeof wak === 'number' && Number.isFinite(wak)
                        ? `${Math.floor(wak)}:${String(Math.round((wak % 1) * 60)).padStart(2, '0')}`
                        : '—';
                    return (
                      <>
                        Addormentato {bedStr}
                        <br />
                        Risveglio {wakeStr}
                      </>
                    );
                  })()}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '5px' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>Durata Totale</div>
                  <div style={{ color: '#fff', fontWeight: 'bold' }}>{item.hours != null ? `${Number(item.hours).toFixed(1)}h` : '--'}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>Battito Medio</div>
                  <div style={{ color: '#ff4d4d', fontWeight: 'bold' }}>{item.hr != null ? `${item.hr} bpm` : '--'}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>Sonno Profondo</div>
                  <div style={{ color: '#8c52ff', fontWeight: 'bold' }}>{item.deepMin != null ? `${Math.floor(item.deepMin / 60)}h ${item.deepMin % 60}m` : '--'}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>Fase REM</div>
                  <div style={{ color: '#00e5ff', fontWeight: 'bold' }}>{item.remMin != null ? `${Math.floor(item.remMin / 60)}h ${item.remMin % 60}m` : '--'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setSleepModal({ editingId: item.id })}
                  style={{ background: 'transparent', border: '1px solid #4ba3e3', color: '#4ba3e3', fontSize: '0.8rem', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px' }}
                >
                  Modifica
                </button>
                <button
                  type="button"
                  onClick={() => removeLogItem(item.id)}
                  style={{ background: 'transparent', border: 'none', color: '#ff4d4d', fontSize: '0.8rem', cursor: 'pointer', padding: '6px 0' }}
                >
                  Rimuovi dati
                </button>
              </div>
            </div>
          ))}
          {workoutsLog.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.7rem', color: '#ff6d00', letterSpacing: '1px', marginBottom: '8px' }}>OUTPUT ENERGETICO</h4>
              {workoutsLog.map((wk) => (
                <div key={wk.id} className="food-pill" style={{ borderLeft: '3px solid #ff6d00', background: 'rgba(255, 109, 0, 0.05)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#fff' }}>{wk.desc || wk.name}</div>
                    <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '2px' }}>Stima: {wk.duration || Math.round((wk.kcal || 0) / 6)} min</div>
                  </div>
                  <div className="food-pill-actions">
                    <div style={{ color: '#ff6d00', fontWeight: 'bold', fontSize: '1rem', marginRight: '10px' }}>🔥 {Math.round(wk.kcal || wk.cal || 0)}</div>
                    <button type="button" className="food-pill-btn btn-delete" onClick={() => removeLogItem(wk.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {Object.keys(groupedFoods).length === 0 && workoutsLog.length === 0 && !(activeLog || []).some((i) => i.type === 'sleep') ? (
            <p style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', fontStyle: 'italic' }}>Nessuna traccia registrata oggi.</p>
          ) : (
            Object.keys(groupedFoods)
              .sort((a, b) => {
                const timeA = Math.min(...(groupedFoods[a] || []).map((f) => Number(f.mealTime ?? f.time ?? 12) || 0));
                const timeB = Math.min(...(groupedFoods[b] || []).map((f) => Number(f.mealTime ?? f.time ?? 12) || 0));
                return timeA - timeB;
              })
              .map((slotKey) => {
                const items = groupedFoods[slotKey];
                const mType = items[0]?.mealType || slotKey.split('_')[0];
                const baseType = mType.split('_')[0];
                const suffixType = mType.includes('_') ? ` ${mType.split('_')[1]}` : '';
                const mTime = items[0]?.mealTime ?? 12;
                const label = `${MEAL_LABELS_SAVE[toCanonicalMealType(baseType)] || baseType}${suffixType} (${decimalToTimeStr(mTime)})`;

                return (
                  <div key={slotKey} style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <h4 style={{ fontSize: '0.7rem', color: '#888', letterSpacing: '1px', margin: 0, cursor: 'pointer', flex: 1 }} onClick={() => loadMealToConstructor(slotKey)}>
                        {label}
                      </h4>
                      <button type="button" className="food-pill-btn" onClick={() => loadMealToConstructor(slotKey)} title="Modifica pasto">✏️</button>
                    </div>
                    {items.map((food) => {
                      const recipeExpandable = (food.type === 'recipe' || food.isRecipe === true)
                        && Array.isArray(food.ingredients)
                        && food.ingredients.length > 0;
                      const recipeKey = food.id != null ? String(food.id) : '';
                      const recipeExpanded = recipeKey && !!expandedRecipes[recipeKey];
                      return (
                        <div key={food.id} style={{ marginBottom: '8px' }}>
                          <div className="food-pill" style={{ borderLeft: '3px solid #333', cursor: 'pointer' }} onClick={() => loadMealToConstructor(slotKey)}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                <span className="food-pill-name">{food.desc || food.name}</span>
                                {recipeExpandable && (
                                  <button
                                    type="button"
                                    className="food-pill-btn"
                                    aria-expanded={recipeExpanded}
                                    aria-label={recipeExpanded ? 'Nascondi ingredienti' : 'Mostra ingredienti'}
                                    title={recipeExpanded ? 'Nascondi ingredienti' : 'Mostra ingredienti'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleRecipe(food.id);
                                    }}
                                    style={{ fontSize: '0.65rem', opacity: 0.85, padding: '2px 6px' }}
                                  >
                                    {recipeExpanded ? '▲' : '▼'}
                                  </button>
                                )}
                                <span className="food-pill-weight">{food.qta || food.weight}g</span>
                              </div>
                            </div>
                            <div className="food-pill-actions" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="food-pill-btn" onClick={(e) => { e.stopPropagation(); setSelectedFoodForInfo(food); }} title="Info macro/micro">ℹ️</button>
                              <button type="button" className="food-pill-btn" onClick={(e) => { e.stopPropagation(); loadMealToConstructor(slotKey); }} title="Modifica pasto">✏️</button>
                              <div style={{ fontSize: '0.75rem', color: '#888', marginRight: '10px' }}>{Math.round(food.kcal || food.cal || 0)} kcal</div>
                              <button type="button" className="food-pill-btn btn-delete" onClick={(e) => { e.stopPropagation(); removeLogItem(food.id); }}>✕</button>
                            </div>
                          </div>
                          {recipeExpandable && recipeExpanded && (
                            <div
                              style={{
                                marginTop: '8px',
                                marginLeft: '4px',
                                paddingLeft: '15px',
                                paddingTop: '8px',
                                paddingBottom: '8px',
                                paddingRight: '10px',
                                borderLeft: '2px solid #444',
                                background: 'rgba(0,0,0,0.28)',
                                borderRadius: '0 10px 10px 0',
                              }}
                            >
                              {food.ingredients.map((ing, ingIdx) => {
                                const w = Number(ing.weight);
                                const wg = Number.isFinite(w) ? `${Math.round(w)}g` : '—';
                                const kc = Math.round(Number(ing.kcal) || 0);
                                const p = Number(ing.prot);
                                const c = Number(ing.carb);
                                const g = Number(ing.fat);
                                const pStr = Number.isFinite(p) ? p.toFixed(1) : '0';
                                const cStr = Number.isFinite(c) ? c.toFixed(1) : '0';
                                const gStr = Number.isFinite(g) ? g.toFixed(1) : '0';
                                const nm = ing.name != null ? String(ing.name) : 'Ingrediente';
                                return (
                                  <div
                                    key={ing.id != null ? String(ing.id) : `ing_${ingIdx}`}
                                    style={{
                                      fontSize: '0.85rem',
                                      color: '#aaa',
                                      lineHeight: 1.45,
                                      marginBottom: ingIdx < food.ingredients.length - 1 ? '6px' : 0,
                                    }}
                                  >
                                    {nm} · {wg} · {kc} kcal · P {pStr}g · C {cStr}g · G {gStr}g
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
          )}
        </div>
      )}
      {diarioTab === 'telemetria' && (
        <TelemetryPanel
          telemetrySubTab={telemetrySubTab}
          setTelemetrySubTab={setTelemetrySubTab}
          telemetryScrollRef={telemetryScrollRef}
          totali={totali}
          dynamicDailyKcal={dynamicDailyKcal}
          userTargets={userTargets}
          drilldownKey={drilldownKey}
          onToggleNutrientDrilldown={onToggleNutrientDrilldown}
          drilldownFoodEntriesForToday={drilldownFoodEntriesForToday}
        />
      )}
    </div>
  );
}
