/**
 * MealBuilder.jsx — Costruttore pasti (drawer): ricerca alimenti, coda, telemetria, SALVA NEL DIARIO.
 * Estratto da SalaComandi.jsx. La logica saveMealToDiary resta nel genitore; qui solo rendering e onClick.
 */
import React, { useState, useRef, useMemo, useEffect } from 'react';

const MEAL_BUTTONS = [
  { label: 'Colazione', id: 'merenda1' },
  { label: 'Snack', id: 'snack' },
  { label: 'Pranzo', id: 'pranzo' },
  { label: 'Cena', id: 'cena' }
];

function parseRecipeIngredientsFromAI(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Nessun array JSON nella risposta');
  }
  const jsonStr = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) throw new Error('La risposta non è un array');
  return parsed;
}

function normalizeDraftIngredient(row, index) {
  const w = Number(row.weight);
  const weight = Number.isFinite(w) && w > 0 ? Math.max(5, Math.round(w)) : 100;
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const baseId = String(row.id != null ? row.id : 'ing').replace(/\s+/g, '_');
  return {
    id: `draft_${index}_${baseId}`.slice(0, 80),
    name: String(row.name != null ? row.name : 'Ingrediente').trim() || 'Ingrediente',
    weight,
    kcal: Math.max(0, Math.round(num(row.kcal))),
    prot: Math.max(0, Math.round(num(row.prot) * 10) / 10),
    carb: Math.max(0, Math.round(num(row.carb) * 10) / 10),
    fat: Math.max(0, Math.round(num(row.fat) * 10) / 10)
  };
}

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
  saveMealToDiary,
  registerAddFoodCallback,
  editingMealId,
  callGeminiAPIWithRotation
}) {
  const [isAbitudiniOpen, setIsAbitudiniOpen] = useState(false);
  const [isAdvancedPastoMode, setIsAdvancedPastoMode] = useState(false);
  const [mealCarouselTab, setMealCarouselTab] = useState('macro');
  const [numpadFoodId, setNumpadFoodId] = useState(null);
  const [numpadValue, setNumpadValue] = useState('');
  const mealCarouselRef = useRef(null);

  const [isComplexMode, setIsComplexMode] = useState(false);
  const [complexFoodQuery, setComplexFoodQuery] = useState('');
  const [draftRecipe, setDraftRecipe] = useState([]);
  const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);

  const [recentFoods, setRecentFoods] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recentFoods') || '[]'); }
    catch { return []; }
  });

  const recentFoodsRef = useRef(recentFoods);
  recentFoodsRef.current = recentFoods;
  useEffect(() => {
    if (typeof registerAddFoodCallback !== 'function') return;
    registerAddFoodCallback((foodId) => {
      if (!foodId) return;
      const updateRecents = [foodId, ...recentFoodsRef.current.filter(id => id !== foodId)].slice(0, 20);
      setRecentFoods(updateRecents);
      try { localStorage.setItem('recentFoods', JSON.stringify(updateRecents)); } catch (_) {}
    });
    return () => registerAddFoodCallback(null);
  }, [registerAddFoodCallback]);

  const sortedSuggestions = useMemo(() => {
    const list = foodDropdownSuggestions || [];
    if (list.length === 0 || recentFoods.length === 0) return list;
    return [...list].sort((a, b) => {
      const aId = a.id ?? a.key;
      const bId = b.id ?? b.key;
      const aRecent = recentFoods.includes(aId);
      const bRecent = recentFoods.includes(bId);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      return 0;
    });
  }, [foodDropdownSuggestions, recentFoods]);

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

  const handleGenerateRecipe = async () => {
    const dish = complexFoodQuery.trim();
    if (!dish) return;
    if (typeof callGeminiAPIWithRotation !== 'function') {
      alert('AI non disponibile: configura le API Key nelle impostazioni.');
      return;
    }
    setIsGeneratingRecipe(true);
    try {
      const prompt = `Sei uno chef stellato esperto in nutrizione. Scomponi il piatto complesso ${JSON.stringify(dish)} nei suoi ingredienti crudi base. Calcola le proporzioni esatte affinché il peso totale degli ingredienti sia 100 grammi. Quando un valore nutrizionale non è disponibile per la compilazione automatica, fai una stima logica e usa il valore medio. Restituisci SOLO un array JSON (senza backtick o markdown) con oggetti strutturati così: { id: '...', name: '...', weight: [numero], kcal: [numero], prot: [numero], carb: [numero], fat: [numero] }.`;
      const rawText = await callGeminiAPIWithRotation(prompt);
      const rows = parseRecipeIngredientsFromAI(rawText);
      const next = rows.map((row, i) => normalizeDraftIngredient(row, i));
      if (next.length === 0) {
        alert('L’AI non ha restituito ingredienti. Riprova.');
        return;
      }
      setDraftRecipe(next);
    } catch (err) {
      console.error('Recipe AI error:', err);
      alert(
        err?.message
          ? `Impossibile elaborare la ricetta: ${err.message}`
          : 'Impossibile elaborare la ricetta. Controlla la risposta dell’AI o riprova.'
      );
    } finally {
      setIsGeneratingRecipe(false);
    }
  };

  const adjustDraftIngredientWeight = (id, deltaGrams) => {
    setDraftRecipe((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextW = Math.max(5, item.weight + deltaGrams);
        if (nextW === item.weight) return item;
        const factor = nextW / item.weight;
        return {
          ...item,
          weight: nextW,
          kcal: Math.max(0, Math.round(item.kcal * factor)),
          prot: Math.max(0, Math.round(item.prot * factor * 10) / 10),
          carb: Math.max(0, Math.round(item.carb * factor * 10) / 10),
          fat: Math.max(0, Math.round(item.fat * factor * 10) / 10)
        };
      })
    );
  };

  const setDraftIngredientWeightFromInput = (id, rawValue) => {
    const parsed = Math.round(Number(String(rawValue).replace(',', '.')));
    if (!Number.isFinite(parsed)) return;
    const nextW = Math.max(5, Math.round(parsed / 5) * 5);
    setDraftRecipe((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (nextW === item.weight) return item;
        const factor = nextW / item.weight;
        return {
          ...item,
          weight: nextW,
          kcal: Math.max(0, Math.round(item.kcal * factor)),
          prot: Math.max(0, Math.round(item.prot * factor * 10) / 10),
          carb: Math.max(0, Math.round(item.carb * factor * 10) / 10),
          fat: Math.max(0, Math.round(item.fat * factor * 10) / 10)
        };
      })
    );
  };

  const removeDraftIngredient = (id) => {
    setDraftRecipe((prev) => prev.filter((item) => item.id !== id));
  };

  const handleConfirmRecipeToMeal = () => {
    if (!draftRecipe.length) return;
    const stamp = Date.now();
    const foods = draftRecipe.map((ing, idx) => ({
      id: `complex_${stamp}_${idx}_${String(ing.id).replace(/\W/g, '_').slice(0, 24)}`,
      type: 'food',
      mealType,
      desc: ing.name,
      name: ing.name,
      qta: ing.weight,
      weight: ing.weight,
      kcal: ing.kcal,
      cal: ing.kcal,
      prot: ing.prot,
      carb: ing.carb,
      fatTotal: ing.fat,
      fat: ing.fat
    }));
    setAddedFoods((prev) => [...foods, ...prev]);
    setIsComplexMode(false);
    setDraftRecipe([]);
    setComplexFoodQuery('');
    setIsGeneratingRecipe(false);
  };

  const handleCancelComplexMode = () => {
    setIsComplexMode(false);
    setComplexFoodQuery('');
    setDraftRecipe([]);
    setIsGeneratingRecipe(false);
  };

  const toNum = (v) => (typeof v === 'number' && !Number.isNaN(v)) ? v : (typeof v === 'string' ? Number(v) : v) != null && !Number.isNaN(Number(v)) ? Number(v) : 0;
  const safeBarTarget = (val, fallback = 1) => Math.max(1, Number(val) || fallback);
  const safeBarCurrent = (val) => Math.max(0, Number(val) || 0);

  const currentMealMacros = useMemo(() => {
    const items = addedFoods || [];
    return {
      kcal: items.reduce((acc, item) => acc + toNum(item.kcal ?? item.cal), 0),
      prot: items.reduce((acc, item) => acc + toNum(item.prot ?? item.proteine), 0),
      carb: items.reduce((acc, item) => acc + toNum(item.carb ?? item.carboidrati), 0),
      fat: items.reduce((acc, item) => acc + toNum(item.fat ?? item.fatTotal ?? item.grassi), 0)
    };
  }, [addedFoods]);

  const isCena = mealType === 'cena';
  const dailyGoals = useMemo(() => ({
    kcal: (dynamicDailyKcal ?? userTargets?.kcal ?? 2000) || 2000,
    prot: (userTargets?.prot ?? 150) || 150,
    carb: (userTargets?.carb ?? 200) || 200,
    fat: (userTargets?.fatTotal ?? userTargets?.fat ?? 60) || 60
  }), [dynamicDailyKcal, userTargets]);
  const consumedSoFar = useMemo(() => ({
    kcal: totali?.kcal ?? 0,
    prot: totali?.prot ?? 0,
    carb: totali?.carb ?? 0,
    fat: totali?.fatTotal ?? totali?.fat ?? 0
  }), [totali]);

  /* In modifica pasto (editingMealId): non azzerare i target: usa totali ESCLUSO il pasto in editing così la rimanenza non va a 0 */
  const consumedSoFarForRemainder = useMemo(() => {
    if (!editingMealId) return consumedSoFar;
    return {
      kcal: Math.max(0, (consumedSoFar.kcal ?? 0) - (currentMealMacros.kcal ?? 0)),
      prot: Math.max(0, (consumedSoFar.prot ?? 0) - (currentMealMacros.prot ?? 0)),
      carb: Math.max(0, (consumedSoFar.carb ?? 0) - (currentMealMacros.carb ?? 0)),
      fat: Math.max(0, (consumedSoFar.fat ?? 0) - (currentMealMacros.fat ?? 0))
    };
  }, [editingMealId, consumedSoFar, currentMealMacros]);

  const targetMacros = useMemo(() => {
    if (isCena) {
      return {
        kcal: Math.max(1, (dailyGoals.kcal || 2000) - (consumedSoFarForRemainder.kcal ?? 0)),
        prot: Math.max(1, (dailyGoals.prot || 150) - (consumedSoFarForRemainder.prot ?? 0)),
        carb: Math.max(1, (dailyGoals.carb || 200) - (consumedSoFarForRemainder.carb ?? 0)),
        fat: Math.max(1, (dailyGoals.fat || 60) - (consumedSoFarForRemainder.fat ?? 0)),
        fibre: Math.max(0, (userTargets?.fibre ?? 30) - (totali?.fibre ?? 0))
      };
    }
    return {
      kcal: (targetMacrosPasto?.kcal ?? (dailyGoals.kcal || 2000) * 0.25) || 500,
      prot: (targetMacrosPasto?.prot ?? (dailyGoals.prot || 150) * 0.25) || 38,
      carb: (targetMacrosPasto?.carb ?? (dailyGoals.carb || 200) * 0.25) || 50,
      fat: (targetMacrosPasto?.fat ?? (dailyGoals.fat || 60) * 0.25) || 15,
      fibre: (targetMacrosPasto?.fibre ?? (userTargets?.fibre ?? 30) * 0.25) || 8
    };
  }, [isCena, dailyGoals, consumedSoFarForRemainder, targetMacrosPasto, userTargets?.fibre, totali?.fibre]);

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
              {!isComplexMode ? (
                <>
                  <div className="quick-add-bar">
                    <div style={{ position: 'relative', flex: 3, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                      <input
                        ref={foodInputRef}
                        type="text"
                        className="quick-input input-name"
                        placeholder="Es. Pollo"
                        value={foodNameInput}
                        onChange={(e) => setFoodNameInput(e.target.value)}
                        onFocus={() => setShowFoodDropdown(true)}
                        onBlur={() => setTimeout(() => setShowFoodDropdown(false), 200)}
                        onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('weight-input')?.focus(); }}
                        style={{ flex: 3, width: '100%', paddingRight: foodNameInput ? '36px' : undefined, boxSizing: 'border-box' }}
                      />
                      {foodNameInput ? (
                        <button type="button" onClick={() => setFoodNameInput('')} aria-label="Cancella ricerca" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', color: '#888', fontSize: '1rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
                      ) : null}
                    </div>
                    <input
                      id="weight-input"
                      type="number"
                      inputMode="decimal"
                      className="quick-input input-weight"
                      placeholder="g"
                      value={foodWeightInput}
                      onChange={(e) => setFoodWeightInput(e.target.value)}
                      onFocus={(e) => { if (numpadFoodId) e.target.blur(); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddFoodManual()}
                      style={{ flex: 1, maxWidth: '80px', textAlign: 'center', boxSizing: 'border-box' }}
                    />
                    <button type="button" title="Scansiona barcode" onClick={() => setIsBarcodeScannerOpen(prev => !prev)} style={{ padding: '10px 12px', background: isBarcodeScannerOpen ? '#00e5ff' : 'rgba(255,255,255,0.08)', border: '1px solid #333', borderRadius: '10px', cursor: 'pointer', fontSize: '1.1rem' }}>📷</button>
                    <button type="button" className="quick-add-btn" onClick={handleAddFoodManual}>+</button>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsComplexMode(true); setShowFoodDropdown(false); }}
                    style={{
                      width: '100%',
                      marginTop: '10px',
                      padding: '12px 14px',
                      background: '#2c2c2e',
                      border: '1px solid rgba(0, 229, 255, 0.35)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxSizing: 'border-box'
                    }}
                  >
                    Crea da Ricetta / Piatto Complesso
                  </button>
                </>
              ) : (
                <div
                  style={{
                    background: '#2c2c2e',
                    border: '1px solid #3a3a3c',
                    borderRadius: '12px',
                    padding: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Piatto complesso
                  </div>
                  <input
                    type="text"
                    value={complexFoodQuery}
                    onChange={(e) => setComplexFoodQuery(e.target.value)}
                    placeholder="Es. Lasagne, Chili con carne…"
                    disabled={isGeneratingRecipe}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      background: '#1a1a1a',
                      border: '1px solid #444',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '0.95rem',
                      outline: 'none'
                    }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
                    <button
                      type="button"
                      onClick={() => { void handleGenerateRecipe(); }}
                      disabled={isGeneratingRecipe || !complexFoodQuery.trim()}
                      style={{
                        flex: '1 1 140px',
                        padding: '12px 16px',
                        background: isGeneratingRecipe ? '#333' : 'rgba(0, 229, 255, 0.18)',
                        border: '1px solid #00e5ff',
                        borderRadius: '12px',
                        color: '#00e5ff',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: isGeneratingRecipe || !complexFoodQuery.trim() ? 'not-allowed' : 'pointer',
                        opacity: isGeneratingRecipe || !complexFoodQuery.trim() ? 0.6 : 1
                      }}
                    >
                      {isGeneratingRecipe ? '⏳ Generazione…' : 'Genera Bozza con AI'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelComplexMode}
                      disabled={isGeneratingRecipe}
                      style={{
                        flex: '1 1 100px',
                        padding: '12px 16px',
                        background: '#1a1a1a',
                        border: '1px solid #555',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: isGeneratingRecipe ? 'not-allowed' : 'pointer',
                        opacity: isGeneratingRecipe ? 0.5 : 1
                      }}
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
            {isComplexMode && isGeneratingRecipe && (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '12px 14px',
                  background: 'rgba(0, 229, 255, 0.08)',
                  border: '1px solid rgba(0, 229, 255, 0.35)',
                  borderRadius: '12px',
                  color: '#e2e8f0',
                  fontSize: '0.8rem',
                  textAlign: 'center'
                }}
              >
                Lo chef AI sta calcolando…
              </div>
            )}
            {isComplexMode && draftRecipe.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Bozza ingredienti
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {draftRecipe.map((ing, idx) => (
                    <div
                      key={`${ing.id}_${idx}`}
                      style={{
                        background: '#2c2c2e',
                        border: '1px solid #3a3a3c',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '10px',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{ing.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          {Math.round(ing.kcal)} kcal · P {ing.prot}g · C {ing.carb}g · G {ing.fat}g
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button
                          type="button"
                          aria-label="Meno 5 grammi"
                          onClick={() => adjustDraftIngredientWeight(ing.id, -5)}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            border: '1px solid #555',
                            background: '#1a1a1a',
                            color: '#fff',
                            fontSize: '1.1rem',
                            cursor: 'pointer',
                            lineHeight: 1
                          }}
                        >
                          −
                        </button>
                        <input
                          key={`w-${ing.id}-${ing.weight}`}
                          type="number"
                          inputMode="numeric"
                          min={5}
                          step={5}
                          defaultValue={ing.weight}
                          onBlur={(e) => setDraftIngredientWeightFromInput(ing.id, e.target.value)}
                          style={{
                            width: '64px',
                            padding: '8px',
                            textAlign: 'center',
                            background: '#1a1a1a',
                            border: '1px solid #444',
                            borderRadius: '10px',
                            color: '#fff',
                            fontSize: '0.9rem',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Più 5 grammi"
                          onClick={() => adjustDraftIngredientWeight(ing.id, 5)}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            border: '1px solid #555',
                            background: '#1a1a1a',
                            color: '#fff',
                            fontSize: '1.1rem',
                            cursor: 'pointer',
                            lineHeight: 1
                          }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          aria-label="Rimuovi ingrediente"
                          onClick={() => removeDraftIngredient(ing.id)}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            border: '1px solid rgba(244, 67, 54, 0.5)',
                            background: 'rgba(244, 67, 54, 0.15)',
                            color: '#f87171',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            lineHeight: 1
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleConfirmRecipeToMeal}
                  style={{
                    width: '100%',
                    marginTop: '16px',
                    padding: '16px 18px',
                    background: 'linear-gradient(145deg, rgba(0, 229, 255, 0.25), rgba(0, 229, 255, 0.08))',
                    border: '2px solid #00e5ff',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    boxSizing: 'border-box'
                  }}
                >
                  Conferma e Aggiungi al Pasto
                </button>
              </div>
            )}
            {!isComplexMode && foodNameInput.trim() === '' && abitudiniIeri.length > 0 && (
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
            {!isComplexMode && showFoodDropdown && (foodNameInput.trim() || sortedSuggestions.length > 0) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#1e1e1e', border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 8px 8px', maxHeight: '250px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', margin: 0, padding: 0 }}>
                {sortedSuggestions.map(s => (
                  <div
                    key={s.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setFoodNameInput(s.desc); setFoodWeightInput(getLastQuantityForFood(s.desc) || ''); setShowFoodDropdown(false); setTimeout(() => document.getElementById('weight-input')?.focus(), 50); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFoodNameInput(s.desc); setFoodWeightInput(getLastQuantityForFood(s.desc) || ''); setShowFoodDropdown(false); setTimeout(() => document.getElementById('weight-input')?.focus(), 50); } }}
                    style={{ padding: '14px 16px', borderBottom: '1px solid #2a2a2a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', minHeight: '48px', boxSizing: 'border-box' }}
                  >
                    <span style={{ fontWeight: '500', fontSize: '1rem' }}>{s.desc}</span>
                    <span style={{ fontSize: '0.85rem', color: '#00e5ff' }}>{s.kcal != null ? `${Math.round(s.kcal)} kcal` : (s.kcalPer100 != null ? `${Math.round(s.kcalPer100)} kcal/100g` : '')}</span>
                  </div>
                ))}
                {foodNameInput.trim() && (
                  <button type="button" style={{ width: '100%', padding: '14px 16px', minHeight: '48px', boxSizing: 'border-box', textAlign: 'left', background: 'rgba(179, 136, 255, 0.15)', border: 'none', borderBottom: '1px solid #2a2a2a', color: '#b388ff', cursor: isGeneratingFood ? 'wait' : 'pointer', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => generateFoodWithAI(foodNameInput.trim())} disabled={isGeneratingFood}>
                    {isGeneratingFood ? (
                      '⏳ Generazione in corso...'
                    ) : (
                      <>
                        <img src="/nuova-icona.png" alt="" width={22} height={22} decoding="async" style={{ objectFit: 'contain', flexShrink: 0 }} />
                        <span>{`Genera con AI: "${foodNameInput.trim()}"`}</span>
                      </>
                    )}
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
                      {(() => { const step = Number(food.unitStep) || 10; return (
                        <>
                          <button type="button" className="calibration-btn" onClick={() => handleCalibrateFoodWeight(food.id, -step)} title={`-${step}g`} aria-label={`-${step}g`}>−</button>
                          <div
                            onClick={() => { setNumpadValue(String(qta)); setNumpadFoodId(food.id); }}
                            style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00e5ff', minWidth: '60px', textAlign: 'center', cursor: 'pointer', background: '#222', padding: '5px 10px', borderRadius: '8px', border: '1px solid #333' }}
                          >
                            {qta}g
                          </div>
                          <button type="button" className="calibration-btn" onClick={() => handleCalibrateFoodWeight(food.id, step)} title={`+${step}g`} aria-label={`+${step}g`}>+</button>
                        </>
                      ); })()}
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
                            {renderProgressBar('Calorie', safeBarCurrent(mealTotaliFull.kcal), safeBarTarget(targetMacrosPasto?.kcal ?? targetMacros?.kcal, 500), 'kcal', 'kcal')}
                            {renderProgressBar('PROTEINE', safeBarCurrent(mealTotaliFull?.prot), safeBarTarget(targetMacrosPasto?.prot ?? targetMacros?.prot, 38), 'g', 'prot')}
                            {renderProgressBar('CARBOIDRATI', safeBarCurrent(mealTotaliFull.carb), safeBarTarget(targetMacrosPasto?.carb ?? targetMacros?.carb, 50), 'g', 'carb')}
                            {renderProgressBar('GRASSI', safeBarCurrent(mealTotaliFull.fatTotal ?? mealTotaliFull.fat), safeBarTarget(targetMacrosPasto?.fat ?? targetMacros?.fat, 15), 'g', 'fatTotal')}
                            {renderProgressBar('FIBRE', safeBarCurrent(mealTotaliFull.fibre), safeBarTarget(targetMacrosPasto?.fibre ?? targetMacros?.fibre, 8), 'g', 'fibre')}
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
                            {renderProgressBar('Grassi tot.', safeBarCurrent(mealTotaliFull.fatTotal ?? mealTotaliFull.fat), safeBarTarget(targetMacrosPasto?.fat ?? targetMacros?.fat, 15), 'g', 'fatTotal')}
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
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '0.7rem', color: '#00e5ff', letterSpacing: '1px', marginBottom: '10px', textTransform: 'uppercase' }}>
              {isCena ? 'Rimanenza Giornaliera' : 'Quota Prevista Pasto'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {renderProgressBar('Kcal', safeBarCurrent(currentMealMacros.kcal), safeBarTarget(targetMacros.kcal, 500), 'kcal', 'kcal')}
              {renderProgressBar('Proteine', safeBarCurrent(currentMealMacros.prot), safeBarTarget(targetMacros.prot, 38), 'g', 'prot')}
              {renderProgressBar('Carboidrati', safeBarCurrent(currentMealMacros.carb), safeBarTarget(targetMacros.carb, 50), 'g', 'carb')}
              {renderProgressBar('Grassi', safeBarCurrent(currentMealMacros.fat), safeBarTarget(targetMacros.fat, 15), 'g', 'fatTotal')}
            </div>
          </div>
          <button type="button" onClick={saveMealToDiary} style={{ width: '100%', padding: '18px', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', transition: '0.2s', opacity: addedFoods.length > 0 ? 1 : 0.5 }}>SALVA NEL DIARIO</button>
        </div>
      </div>
      {numpadFoodId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 999999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'stretch' }}>
          <div style={{ marginTop: 'auto', background: '#1a1a1c', padding: '20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ color: '#888', fontSize: '1rem' }}>Quantità (g)</span>
              <span style={{ color: '#fff', fontSize: '2rem', fontWeight: 'bold' }}>{numpadValue || '0'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button key={num} type="button" onClick={() => setNumpadValue(prev => (prev === '0' ? String(num) : prev + num))} style={{ padding: '15px', fontSize: '1.5rem', fontWeight: 'bold', background: '#2c2c2e', color: '#fff', border: 'none', borderRadius: '12px' }}>
                  {num}
                </button>
              ))}
              <button type="button" onClick={() => setNumpadValue('0')} style={{ padding: '15px', fontSize: '1.5rem', fontWeight: 'bold', background: '#333', color: '#ff4444', border: 'none', borderRadius: '12px' }}>C</button>
              <button type="button" onClick={() => setNumpadValue(prev => (prev === '0' ? '0' : prev + '0'))} style={{ padding: '15px', fontSize: '1.5rem', fontWeight: 'bold', background: '#2c2c2e', color: '#fff', border: 'none', borderRadius: '12px' }}>0</button>
              <button type="button" onClick={() => setNumpadValue(prev => (prev.slice(0, -1) || '0'))} style={{ padding: '15px', fontSize: '1.5rem', fontWeight: 'bold', background: '#333', color: '#fff', border: 'none', borderRadius: '12px' }}>⌫</button>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button type="button" onClick={() => setNumpadFoodId(null)} style={{ flex: 1, padding: '15px', background: '#333', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold' }}>Annulla</button>
              <button type="button" onClick={() => {
                const newWeight = Math.max(5, Math.min(5000, Number(numpadValue) || 0));
                const food = addedFoods.find(f => f.id === numpadFoodId);
                if (food && newWeight >= 5) {
                  const currentQta = Number(food.qta ?? food.weight ?? 100) || 100;
                  const delta = newWeight - currentQta;
                  handleCalibrateFoodWeight(numpadFoodId, delta);
                }
                setNumpadFoodId(null);
              }} style={{ flex: 1, padding: '15px', background: '#00e5ff', color: '#000', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold' }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
