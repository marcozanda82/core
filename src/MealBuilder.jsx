/**
 * MealBuilder.jsx — Costruttore pasti (drawer): ricerca alimenti, coda, telemetria, SALVA NEL DIARIO.
 * Estratto da SalaComandi.jsx. La logica saveMealToDiary resta nel genitore; qui solo rendering e onClick.
 */
import React, { useState, useRef } from 'react';

const MEAL_BUTTONS = [
  { label: 'Colazione', id: 'merenda1' },
  { label: 'Snack', id: 'snack' },
  { label: 'Pranzo', id: 'pranzo' },
  { label: 'Cena', id: 'cena' }
];

export default function MealBuilder({
  onClose,
  mealType,
  setMealType,
  drawerMealTime,
  setDrawerMealTime,
  setDrawerMealTimeStr,
  getDefaultMealTime,
  decimalToTimeStr,
  parseTimeStrToDecimal,
  miniTimelinePastoRef,
  handleMiniTimelineDrag,
  allNodes,
  totali,
  userTargets,
  dynamicDailyKcal,
  renderLiveProgressBar,
  renderMiniBar,
  renderProgressBar,
  renderRatioBar,
  mealTotaliFull,
  targetMacrosPasto,
  ratio,
  energyAt20Percent,
  isBarcodeScannerOpen,
  setIsBarcodeScannerOpen,
  barcodeVideoRef,
  onCloseBarcodeScanner,
  foodInputRef,
  foodNameInput,
  setFoodNameInput,
  foodWeightInput,
  setFoodWeightInput,
  handleAddFoodManual,
  foodDropdownSuggestions,
  getLastQuantityForFood,
  showFoodDropdown,
  setShowFoodDropdown,
  generateFoodWithAI,
  isGeneratingFood,
  abitudiniIeri,
  addedFoods,
  setAddedFoods,
  handleCalibrateFoodWeight,
  setSelectedFoodForInfo,
  setSelectedFoodForEdit,
  setEditQuantityValue,
  userProfile,
  checkBilanciamentoPasto,
  TELEMETRY_TABS,
  TARGETS,
  MEAL_LABELS_SAVE,
  saveMealToDiary
}) {
  const [isAbitudiniOpen, setIsAbitudiniOpen] = useState(false);
  const [isAdvancedPastoMode, setIsAdvancedPastoMode] = useState(false);
  const [mealCarouselTab, setMealCarouselTab] = useState('macro');
  const mealCarouselRef = useRef(null);

  const handleMealCarouselScroll = (e) => {
    const { scrollLeft, clientWidth } = e.target;
    const pageIndex = Math.round(scrollLeft / clientWidth);
    const activeTab = TELEMETRY_TABS[pageIndex];
    if (activeTab && activeTab !== mealCarouselTab) setMealCarouselTab(activeTab);
  };
  const scrollToMealCarouselTab = (tabName) => {
    setMealCarouselTab(tabName);
    const index = TELEMETRY_TABS.indexOf(tabName);
    if (mealCarouselRef.current && index !== -1) {
      const container = mealCarouselRef.current;
      container.scrollTo({ left: index * container.clientWidth, behavior: 'smooth' });
    }
  };

  return (
    <div className="view-animate">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
        <h2 style={{ fontSize: '0.8rem', color: '#fff', letterSpacing: '2px', margin: 0 }}>NUOVO PASTO</h2>
        <div style={{ width: '70px' }}></div>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
        {MEAL_BUTTONS.map(({ label, id }) => (
          <button
            key={id}
            className={`type-btn ${mealType === id ? 'active' : ''}`}
            onClick={() => setMealType(id)}
            style={{ whiteSpace: 'nowrap', padding: '12px 15px' }}
          >
            {label}
          </button>
        ))}
      </div>
      {(mealType === 'cena' || mealType === 'Cena') && (
        <div style={{ background: 'rgba(156, 39, 176, 0.15)', border: '1px solid #9c27b0', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
          <div style={{ color: '#e1bee7', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>📉 STRATEGIA NOTTURNA</div>
          <div style={{ color: '#ccc', fontSize: '0.85rem', lineHeight: '1.5' }}><strong>Cortisolo Serale Rilevato:</strong> inserisci una quota strategica di carboidrati. Il picco insulinico agirà da antagonista naturale, abbattendo l'ormone dello stress e preparando il sistema nervoso centrale al sonno profondo.</div>
        </div>
      )}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#888', fontSize: '0.7rem', marginBottom: '8px' }}>
          <span>0:00</span>
          <input
          type="time"
          value={decimalToTimeStr(drawerMealTime)}
          onChange={(e) => {
            const newTimeStr = e.target.value;
            const v = parseTimeStrToDecimal(newTimeStr);
            setDrawerMealTime(v);
            setDrawerMealTimeStr(decimalToTimeStr(v));
            if (newTimeStr) {
              const hour = parseInt(newTimeStr.split(':')[0], 10);
              if (hour >= 5 && hour < 11) setMealType('merenda1');
              else if (hour >= 11 && hour < 15) setMealType('pranzo');
              else if (hour >= 19 && hour <= 22) setMealType('cena');
              else setMealType('snack');
            }
          }}
          style={{ width: '130px', minWidth: '110px', padding: '8px 10px', background: '#1a1a1a', border: '1px solid #00e5ff', borderRadius: '8px', color: '#00e5ff', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center', letterSpacing: '1px' }}
        />
          <span>24:00</span>
        </div>
        <div ref={miniTimelinePastoRef} style={{ position: 'relative', height: '36px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid #333', touchAction: 'pan-x' }}>
          {allNodes.filter(n => n.id !== `${mealType}_${drawerMealTime}`).map(n => {
            const isWork = n.type === 'work';
            const startP = (n.time / 24) * 100;
            const durP = isWork ? ((n.duration || 1) / 24) * 100 : 0;
            const isPesi = n.type === 'workout' && n.subType === 'pesi' && n.muscles?.length > 0;
            const iconContent = isPesi ? n.muscles.map(m => m.substring(0, 2).toUpperCase()).join('+') : (n.icon || '•');
            if (isWork) {
              return (
                <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(255, 234, 0, 0.2)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
              );
            }
            return (
              <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid #666', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none', fontSize: '0.5rem' }}>
                <span style={{ lineHeight: 1 }}>{iconContent}</span>
              </div>
            );
          })}
          <div className="mini-timeline-hitbox" role="slider" aria-label="Ora pasto" onPointerDown={(e) => handleMiniTimelineDrag(e, miniTimelinePastoRef, 'point', drawerMealTime, null, setDrawerMealTime, null)} style={{ position: 'absolute', left: `${(drawerMealTime / 24) * 100}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '44px', height: '44px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, touchAction: 'none' }}>
            <div className="mini-timeline-point-bubble" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '28px', height: '28px', borderRadius: '50%', background: '#00e5ff', border: '2px solid #fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(0,229,255,0.5)', pointerEvents: 'none' }}>
              <span style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#000' }}>{decimalToTimeStr(drawerMealTime)}</span>
              <span style={{ lineHeight: 1 }}>🍎</span>
            </div>
          </div>
        </div>
      </div>
      <div className="pasto-container">
        <div className="pasto-telemetry-panel">
          <h4 style={{ fontSize: '0.7rem', color: '#00e5ff', letterSpacing: '1px', marginBottom: '12px', textTransform: 'uppercase' }}>Telemetria live (oggi + pasto)</h4>
          {renderLiveProgressBar('Kcal', totali?.kcal || 0, mealTotaliFull.kcal || 0, dynamicDailyKcal, 'kcal', '#00e5ff')}
          {renderLiveProgressBar('Proteine', totali?.prot || 0, mealTotaliFull.prot || 0, userTargets?.prot ?? 150, 'g', '#b388ff')}
          {renderLiveProgressBar('Carboidrati', totali?.carb || 0, mealTotaliFull.carb || 0, userTargets?.carb ?? 200, 'g', '#00e676')}
          {renderLiveProgressBar('Grassi', totali?.fatTotal ?? totali?.fat ?? 0, mealTotaliFull.fatTotal ?? mealTotaliFull.fat ?? 0, userTargets?.fatTotal ?? userTargets?.fat ?? 60, 'g', '#ffea00')}
          {mealType === 'cena' && (() => {
            const targetKcal = dynamicDailyKcal;
            const targetProt = userTargets?.prot ?? 150;
            const targetCarb = userTargets?.carb ?? 200;
            const targetFat = userTargets?.fatTotal ?? userTargets?.fat ?? 60;
            const totalKcal = (totali?.kcal || 0) + (mealTotaliFull?.kcal || 0);
            const totalProt = (totali?.prot || 0) + (mealTotaliFull?.prot || 0);
            const totalCarb = (totali?.carb || 0) + (mealTotaliFull?.carb || 0);
            const totalFat = (totali?.fatTotal ?? totali?.fat ?? 0) + (mealTotaliFull?.fatTotal ?? mealTotaliFull?.fat ?? 0);
            const deltaKcal = targetKcal - totalKcal;
            const deltaProt = targetProt - totalProt;
            const deltaCarb = targetCarb - totalCarb;
            const deltaFat = targetFat - totalFat;
            return (
              <div style={{ marginTop: '16px', padding: '12px', borderRadius: '10px', border: '1px solid #333', background: 'rgba(0,0,0,0.2)' }}>
                <h4 style={{ fontSize: '0.7rem', color: '#ffea00', letterSpacing: '1px', marginBottom: '10px', textTransform: 'uppercase' }}>Bilancio di Fine Giornata</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: deltaKcal >= 0 ? '#00e676' : '#ff1744' }}><span>Kcal</span><span>{deltaKcal >= 0 ? `Rimangono ${Math.round(deltaKcal)}` : `Eccesso ${Math.round(-deltaKcal)}`}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: deltaProt >= 0 ? '#00e676' : '#ff1744' }}><span>Proteine (g)</span><span>{deltaProt >= 0 ? `Rimangono ${deltaProt.toFixed(0)}` : `Eccesso ${(-deltaProt).toFixed(0)}`}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: deltaCarb >= 0 ? '#00e676' : '#ff1744' }}><span>Carboidrati (g)</span><span>{deltaCarb >= 0 ? `Rimangono ${deltaCarb.toFixed(0)}` : `Eccesso ${(-deltaCarb).toFixed(0)}`}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: deltaFat >= 0 ? '#00e676' : '#ff1744' }}><span>Grassi (g)</span><span>{deltaFat >= 0 ? `Rimangono ${deltaFat.toFixed(0)}` : `Eccesso ${(-deltaFat).toFixed(0)}`}</span></div>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '0.65rem', color: '#888' }}>Utile per bilanciare i carboidrati serali e supportare il cortisolo notturno.</p>
              </div>
            );
          })()}
        </div>
        <div className="pasto-builder-panel">
          <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '10px', border: '1px solid #333', background: energyAt20Percent < 40 ? 'rgba(220, 38, 38, 0.12)' : 'rgba(34, 197, 94, 0.1)', borderColor: energyAt20Percent < 40 ? 'rgba(220, 38, 38, 0.4)' : 'rgba(34, 197, 94, 0.35)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: '600', color: energyAt20Percent < 40 ? '#f87171' : '#4ade80', marginBottom: '4px' }}>Analisi Bio-Feedback</div>
            {energyAt20Percent < 40 ? (
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#fca5a5', lineHeight: 1.4 }}>⚠️ Rischio Cortisolo Alto rilevato. Si consiglia di aumentare la quota di carboidrati complessi o grassi sani in questo pasto per stabilizzare i livelli serali.</p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#86efac', lineHeight: 1.4 }}>✅ Equilibrio Serale Ottimale. La strategia attuale supporta bassi livelli di stress.</p>
            )}
          </div>
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            {isBarcodeScannerOpen && (
              <div style={{ marginBottom: '12px', borderRadius: '12px', overflow: 'hidden', background: '#000', border: '1px solid #333' }}>
                <video ref={barcodeVideoRef} muted playsInline style={{ width: '100%', maxHeight: '200px', display: 'block' }} />
                <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>Inquadra il codice a barre</span>
                  <button type="button" onClick={onCloseBarcodeScanner} style={{ padding: '6px 12px', background: '#333', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}>Chiudi</button>
                </div>
              </div>
            )}
            <div style={{ position: 'sticky', top: '-20px', zIndex: 50, background: '#111', paddingTop: '20px', paddingBottom: '10px', borderBottom: '1px solid #333', margin: '0 -15px 20px -15px', paddingLeft: '15px', paddingRight: '15px' }}>
              <div className="quick-add-bar">
                <input ref={foodInputRef} type="text" className="quick-input input-name" placeholder="Es. Pollo" value={foodNameInput} onChange={(e) => setFoodNameInput(e.target.value)} onFocus={() => setShowFoodDropdown(true)} onBlur={() => setTimeout(() => setShowFoodDropdown(false), 200)} onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('weight-input')?.focus(); }} />
                <input id="weight-input" type="number" inputMode="decimal" className="quick-input input-weight" placeholder="g" value={foodWeightInput} onChange={(e) => setFoodWeightInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddFoodManual()} />
                <button type="button" title="Scansiona barcode" onClick={() => setIsBarcodeScannerOpen(prev => !prev)} style={{ padding: '10px 12px', background: isBarcodeScannerOpen ? '#00e5ff' : 'rgba(255,255,255,0.08)', border: '1px solid #333', borderRadius: '10px', cursor: 'pointer', fontSize: '1.1rem' }}>📷</button>
                <button type="button" className="quick-add-btn" onClick={handleAddFoodManual}>+</button>
              </div>
            </div>
            {abitudiniIeri.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <button type="button" onClick={() => setIsAbitudiniOpen(prev => !prev)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid #333', borderRadius: '10px', color: '#888', fontSize: '0.7rem', letterSpacing: '1px', cursor: 'pointer', textAlign: 'left' }}>
                  <span>Abitudini di ieri</span>
                  <span style={{ fontSize: '1rem', transition: 'transform 0.2s', transform: isAbitudiniOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
                </button>
                {isAbitudiniOpen && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                    {abitudiniIeri.map((f, idx) => (
                      <button key={f.id || `yest_${idx}`} type="button" onClick={() => setAddedFoods(prev => [...prev, { ...f, id: `habit_${Date.now()}_${idx}`, mealType }])} style={{ padding: '8px 12px', borderRadius: '20px', border: '1px solid #333', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {f.desc || f.name}{f.qta != null || f.weight != null ? ` (${f.qta ?? f.weight}g)` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {showFoodDropdown && (foodNameInput.trim() || foodDropdownSuggestions.length > 0) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid #333', borderRadius: '0 0 12px 12px', maxHeight: '220px', overflowY: 'auto', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                {foodDropdownSuggestions.map(s => (
                  <button key={s.key} type="button" style={{ width: '100%', padding: '12px 16px', textAlign: 'left', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid #2a2a2a' }} onClick={() => { setFoodNameInput(s.desc); setFoodWeightInput(getLastQuantityForFood(s.desc) || ''); setShowFoodDropdown(false); setTimeout(() => document.getElementById('weight-input')?.focus(), 50); }}>
                    {s.desc}
                  </button>
                ))}
                {foodNameInput.trim() && (
                  <button type="button" style={{ width: '100%', padding: '12px 16px', textAlign: 'left', background: 'rgba(179, 136, 255, 0.15)', border: 'none', color: '#b388ff', cursor: isGeneratingFood ? 'wait' : 'pointer', fontSize: '0.9rem', fontWeight: '600' }} onClick={() => generateFoodWithAI(foodNameInput.trim())} disabled={isGeneratingFood}>
                    {isGeneratingFood ? '⏳ Generazione in corso...' : `✨ Genera con AI: "${foodNameInput.trim()}"`}
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ minHeight: '100px', marginBottom: '20px' }}>
            {addedFoods.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '30px' }}>Nessun alimento in coda</p>
            ) : (
              addedFoods.map((food) => {
                const omega3G = (food.omega3 != null && food.omega3 > 0) ? (food.omega3 >= 1 ? food.omega3 : food.omega3 / 1000) : 0;
                const omega3Rich = omega3G > 0.5;
                const mgVal = Number(food.mg) || 0;
                const mgRich = mgVal >= 30;
                const qta = Number(food.qta ?? food.weight ?? 100) || 100;
                return (
                  <div key={food.id} className="food-pill">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <span className="food-pill-name">{food.desc || food.name}</span>
                        <span className="food-pill-weight">{qta}g</span>
                        {(omega3Rich || mgRich) && (
                          <span style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
                            {omega3Rich && <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '10px', background: 'rgba(0, 150, 255, 0.25)', color: '#5eb3f6', fontWeight: '600' }}>Ω3</span>}
                            {mgRich && <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '10px', background: 'rgba(139, 90, 43, 0.35)', color: '#d4a574', fontWeight: '600' }}>Mg</span>}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button type="button" className="calibration-btn" onClick={() => handleCalibrateFoodWeight(food.id, -10)} title="-10g" aria-label="-10g">−</button>
                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#00e5ff', minWidth: '42px', textAlign: 'center' }}>{qta}g</span>
                      <button type="button" className="calibration-btn" onClick={() => handleCalibrateFoodWeight(food.id, 10)} title="+10g" aria-label="+10g">+</button>
                      <div className="food-pill-actions" style={{ marginLeft: '4px' }}>
                        <button type="button" className="food-pill-btn" onClick={() => setSelectedFoodForInfo(food)} title="Info macro/micro">ℹ️</button>
                        <button type="button" className="food-pill-btn" onClick={() => { setSelectedFoodForEdit({ food, source: 'queue' }); setEditQuantityValue(String(qta)); }} title="Modifica quantità">✏️</button>
                        <button type="button" className="food-pill-btn btn-delete" onClick={() => setAddedFoods(prev => prev.filter(f => f.id !== food.id))}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {addedFoods.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                {renderMiniBar('KCAL', mealTotaliFull.kcal || 0, targetMacrosPasto.kcal, '#00e5ff')}
                {renderMiniBar('PROTEINE (g)', mealTotaliFull.prot || 0, targetMacrosPasto.prot, '#b388ff')}
                {renderMiniBar('CARBOIDRATI (g)', mealTotaliFull.carb || 0, targetMacrosPasto.carb, '#00e676')}
                {renderMiniBar('GRASSI (g)', mealTotaliFull.fatTotal ?? mealTotaliFull.fat ?? 0, targetMacrosPasto.fat, '#ffea00')}
              </div>
              {userProfile?.level === 'pro' && (
                <>
                  <button type="button" onClick={() => setIsAdvancedPastoMode(prev => !prev)} style={{ width: '100%', marginBottom: '16px', padding: '10px 14px', fontSize: '0.8rem', background: isAdvancedPastoMode ? 'rgba(0, 229, 255, 0.15)' : '#1a1a1a', border: '1px solid #333', borderRadius: '10px', color: '#00e5ff', cursor: 'pointer', textAlign: 'center' }}>
                    {isAdvancedPastoMode ? '⚙️ Nascondi Telemetria Avanzata' : '⚙️ Mostra Telemetria Avanzata'}
                  </button>
                  {checkBilanciamentoPasto && (() => {
                    const alert = checkBilanciamentoPasto();
                    if (!alert) return null;
                    return (
                      <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${alert.color}`, background: `${alert.color}20`, color: alert.color, fontSize: '0.8rem', lineHeight: 1.4 }}>
                        {alert.text}
                      </div>
                    );
                  })()}
                  {isAdvancedPastoMode && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '15px', marginBottom: '20px', overflow: 'hidden' }}>
                      <h4 style={{ fontSize: '0.65rem', color: '#b388ff', letterSpacing: '1px', marginBottom: '10px', textTransform: 'uppercase' }}>Telemetria Pasto ({MEAL_LABELS_SAVE[mealType] || mealType})</h4>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                        {TELEMETRY_TABS.map(t => (
                          <button key={t} type="button" onClick={() => scrollToMealCarouselTab(t)} style={{ padding: '8px 14px', fontSize: '0.7rem', fontWeight: 'bold', background: mealCarouselTab === t ? '#00e5ff' : '#111', color: mealCarouselTab === t ? '#000' : '#888', border: 'none', borderRadius: '20px', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer' }}>{t}</button>
                        ))}
                      </div>
                      <div className="telemetry-carousel" ref={mealCarouselRef} onScroll={handleMealCarouselScroll} style={{ height: '220px', display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {renderProgressBar('Calorie', mealTotaliFull.kcal || 0, targetMacrosPasto.kcal, 'kcal', 'kcal')}
                            {renderProgressBar('PROTEINE', mealTotaliFull.prot || 0, targetMacrosPasto.prot, 'g', 'prot')}
                            {renderProgressBar('CARBOIDRATI', mealTotaliFull.carb || 0, targetMacrosPasto.carb, 'g', 'carb')}
                            {renderProgressBar('GRASSI', mealTotaliFull.fatTotal ?? mealTotaliFull.fat ?? 0, targetMacrosPasto.fat, 'g', 'fatTotal')}
                            {renderProgressBar('FIBRE', mealTotaliFull.fibre || 0, targetMacrosPasto.fibre, 'g', 'fibre')}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            <h4 style={{ fontSize: '0.65rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '10px', marginTop: 0 }}>RAPPORTI BIOCHIMICI</h4>
                            {renderRatioBar('Equilibrio Elettrolitico', 'Na', mealTotaliFull?.na, 'K', mealTotaliFull?.k, 'Na < K', (Number(mealTotaliFull?.na) || 0) < (Number(mealTotaliFull?.k) || 0))}
                            {renderRatioBar('Omega 6:3', 'Ω6', mealTotaliFull?.omega6, 'Ω3', mealTotaliFull?.omega3, 'W6:W3 ≤ 4:1', (Number(mealTotaliFull?.omega6) || 0) <= (Number(mealTotaliFull?.omega3) || 1) * 4)}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {Object.keys(TARGETS.amino || {}).map(k => renderProgressBar(k.toUpperCase(), mealTotaliFull[k] || 0, (TARGETS.amino[k] || 0) * ratio, 'mg', k))}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {Object.keys(TARGETS.vit || {}).map(k => renderProgressBar(k.toUpperCase(), mealTotaliFull[k] || 0, (TARGETS.vit[k] || 0) * ratio, k === 'vitA' || k === 'b9' ? 'µg' : 'mg', k))}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {Object.keys(TARGETS.min || {}).map(k => renderProgressBar(k.toUpperCase(), mealTotaliFull[k] || 0, (TARGETS.min[k] || 0) * ratio, k === 'se' ? 'µg' : 'mg', k))}
                          </div>
                        </div>
                        <div className="telemetry-carousel-slide" style={{ flex: '0 0 100%', scrollSnapAlign: 'start', minWidth: '100%', overflowY: 'auto', paddingRight: '8px' }}>
                          <div style={{ background: '#111', padding: '12px', borderRadius: '12px' }}>
                            {renderProgressBar('Grassi tot.', mealTotaliFull.fatTotal ?? mealTotaliFull.fat ?? 0, targetMacrosPasto.fat, 'g', 'fatTotal')}
                            {Object.keys(TARGETS.fat || {}).map(k => renderProgressBar(k.toUpperCase(), mealTotaliFull[k] || 0, (TARGETS.fat[k] || 0) * ratio, 'g', k))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <button type="button" onClick={saveMealToDiary} style={{ width: '100%', padding: '18px', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', transition: '0.2s', opacity: addedFoods.length > 0 ? 1 : 0.5 }}>SALVA NEL DIARIO</button>
        </div>
      </div>
    </div>
  );
}
