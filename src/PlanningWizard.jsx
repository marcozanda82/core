/**
 * Wizard pianificazione: Step 1 attività+fasce+muscoli, Step 2 pasti/bio-target, Step 3 timeline e conferma Firebase.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { getDynamicMealTargets, toCanonicalMealType } from './coreEngine';

const MACRO_OPTIONS = [
  { id: 'mental', label: 'Lavoro Mentale / PC' },
  { id: 'physical', label: 'Lavoro Fisico' },
  { id: 'training', label: 'Allenamento' },
  { id: 'relax', label: 'Relax/Recupero' },
];

const MUSCLE_OPTIONS = ['Petto', 'Dorso', 'Gambe', 'Braccia', 'Spalle', 'Cardio'];

const TIMING_KEYS = [
  { id: 'mattina', label: 'Mattina' },
  { id: 'pomeriggio', label: 'Pomeriggio' },
  { id: 'sera', label: 'Sera' },
];

const PROPOSED_SLOTS = [
  { canon: 'colazione', label: 'Colazione', mealType: 'colazione', defaultHour: 8 },
  { canon: 'pranzo', label: 'Pranzo', mealType: 'pranzo', defaultHour: 13 },
  { canon: 'snack', label: 'Spuntino', mealType: 'spuntino', defaultHour: 16 },
  { canon: 'cena', label: 'Cena', mealType: 'cena', defaultHour: 20 },
];

const glassPanel = {
  borderRadius: 14,
  border: '1px solid rgba(0, 229, 255, 0.22)',
  background: 'linear-gradient(165deg, rgba(26, 30, 38, 0.95) 0%, rgba(14, 16, 22, 0.98) 100%)',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 10px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
  backdropFilter: 'blur(14px)',
};

const bigTileBase = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid rgba(255,248,220,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: '#fff8e8',
  fontSize: '0.92rem',
  fontWeight: 700,
  textAlign: 'left',
  cursor: 'pointer',
  lineHeight: 1.35,
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
};

const bigTileSelected = {
  border: '1px solid rgba(0, 229, 255, 0.55)',
  background: 'rgba(0, 229, 255, 0.12)',
  boxShadow: '0 0 18px rgba(0, 229, 255, 0.2)',
};

function toggleInSet(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function decimalHourToHHMM(dec) {
  if (typeof dec !== 'number' || Number.isNaN(dec)) return null;
  const h = Math.floor(dec) % 24;
  const m = Math.round((dec % 1) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getLocalDecimalHourNow() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

function isTimingSlotInPast(slotId) {
  const h = getLocalDecimalHourNow();
  if (slotId === 'mattina') return h >= 12;
  if (slotId === 'pomeriggio') return h >= 18;
  return false;
}

function extractRealWorkout(log) {
  return (log || []).find((e) => e && !e.isGhost && e.type === 'workout');
}

function hasRealMealsInLog(log) {
  return (log || []).some((e) => e && !e.isGhost && (e.type === 'food' || e.type === 'recipe'));
}

function inferMusclesFromWorkoutText(workout) {
  const text = `${workout?.desc || ''} ${workout?.name || ''} ${workout?.title || ''}`.toLowerCase();
  if (!text.trim()) return [];
  const found = [];
  const push = (label) => {
    if (MUSCLE_OPTIONS.includes(label) && !found.includes(label)) found.push(label);
  };
  if (/petto|torace|pectoral|bench|panca/.test(text)) push('Petto');
  if (/dorso|schiena|lat\b|pull|remator|rowing|remata/.test(text)) push('Dorso');
  if (/gambe|quadricip|femorali|leg day|squat|stacco/.test(text)) push('Gambe');
  if (/bracci|bicipit|tricipit|curl|dip\b/.test(text)) push('Braccia');
  if (/spalle|deltoid|shoulder|lateral/.test(text)) push('Spalle');
  if (/cardio|corr|run|corsa|tapis|cyclette|bike|hiit|ellittic|nuot|swim|rowing machine/.test(text)) push('Cardio');
  return found;
}

function computeOpenSnapshot(dailyLog) {
  const log = dailyLog || [];
  const w = extractRealWorkout(log);
  const macros = new Set();
  const muscles = new Set();
  const lockedMuscles = new Set();
  let trainingLockedFromLog = false;
  const mealsPresentInLog = hasRealMealsInLog(log);
  if (w) {
    macros.add('training');
    trainingLockedFromLog = true;
    inferMusclesFromWorkoutText(w).forEach((m) => {
      muscles.add(m);
      lockedMuscles.add(m);
    });
  }
  return { macros, muscles, lockedMuscles, trainingLockedFromLog, mealsPresentInLog };
}

function logHasRealMealCanon(log, canon) {
  return (log || []).some((e) => {
    if (!e || e.isGhost || (e.type !== 'food' && e.type !== 'recipe')) return false;
    const c = toCanonicalMealType(String(e.mealType || '').split('_')[0]);
    return c === canon;
  });
}

function logHasGhostMealCanon(log, canon) {
  return (log || []).some((e) => {
    if (!e || e.type !== 'ghost_meal') return false;
    const c = toCanonicalMealType(String(e.mealType || '').split('_')[0]);
    return c === canon;
  });
}

function buildProposedRows(log, nowDec) {
  const out = [];
  PROPOSED_SLOTS.forEach((s, i) => {
    if (logHasRealMealCanon(log, s.canon)) return;
    if (logHasGhostMealCanon(log, s.canon)) return;
    if (s.defaultHour <= nowDec + 0.08) return;
    out.push({
      id: `proposed_${s.canon}_${i}`,
      source: 'proposed',
      mealType: s.mealType,
      mealTime: s.defaultHour,
      title: `${s.label} (suggerito motore)`,
      microDesc: '',
      draftFoods: [],
    });
  });
  return out;
}

function ghostRowsFromLog(log) {
  return (log || [])
    .filter((e) => e && e.type === 'ghost_meal')
    .map((e, i) => ({
      id: e.id || `ghost_log_${i}`,
      source: 'ghost_log',
      mealType: toCanonicalMealType(String(e.mealType || 'pranzo').split('_')[0]) || 'pranzo',
      mealTime: typeof e.mealTime === 'number' && !Number.isNaN(e.mealTime) ? e.mealTime : 12,
      title: String(e.title || 'Pasto pianificato'),
      microDesc: String(e.microDesc || ''),
      draftFoods: Array.isArray(e.draftFoods) ? e.draftFoods.map((x) => String(x).trim()).filter(Boolean) : [],
    }));
}

function sumMgFromLog(log) {
  let s = 0;
  (log || []).forEach((e) => {
    if (e && (e.type === 'food' || e.type === 'recipe')) {
      s += Number(e.mg) || 0;
    }
  });
  return s;
}

function fasciaToDecimal(slotId) {
  if (slotId === 'mattina') return 10;
  if (slotId === 'pomeriggio') return 15;
  return 19;
}

function microHintFromTargets(t, userTargets) {
  if (!t || typeof t !== 'object') return '';
  const parts = [];
  const mgTarget = Number(userTargets?.mg ?? userTargets?.min?.mg ?? 400) || 400;
  parts.push(`Fibre pasto ~${Math.round(Number(t.fibre) || 0)}g`);
  if (t.minFibreG != null) parts.push(`min fisiologico pranzo ${t.minFibreG}g`);
  if (t.maxSimpleSugarG != null) parts.push(`zuccheri semplici ≤${t.maxSimpleSugarG}g`);
  if (t.dinnerFatHardCapG != null) parts.push(`grassi cena ≤${t.dinnerFatHardCapG}g`);
  parts.push(`Mg giornaliero ref. ~${Math.round(mgTarget)}mg (RDA)`);
  return parts.join(' · ');
}

function mealTypeLabelIt(raw) {
  const c = toCanonicalMealType(String(raw || '').split('_')[0]);
  const labels = { colazione: 'Colazione', pranzo: 'Pranzo', cena: 'Cena', snack: 'Spuntino' };
  return labels[c] || c || 'Pasto';
}

function DraftFoodPillsMini({ foods }) {
  if (!Array.isArray(foods) || foods.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 6 }}>
      {foods.map((foodStr, i) => (
        <span
          key={`${foodStr}_${i}`}
          style={{
            display: 'inline-block',
            background: 'rgba(0, 229, 255, 0.15)',
            color: '#00e5ff',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            margin: '4px 4px 0 0',
          }}
        >
          {String(foodStr)}
        </span>
      ))}
    </div>
  );
}

const REGISTERED_MEAL_GROUP_ORDER = ['colazione', 'snack', 'pranzo', 'cena'];

function groupRegisteredMealsByMealType(log) {
  const list = (log || []).filter(
    (e) => e && !e.isGhost && (e.type === 'food' || e.type === 'recipe')
  );
  const map = new Map();
  list.forEach((e) => {
    const mt = toCanonicalMealType(String(e.mealType || '').split('_')[0]) || 'snack';
    if (!map.has(mt)) map.set(mt, []);
    map.get(mt).push(e);
  });
  const out = [];
  REGISTERED_MEAL_GROUP_ORDER.forEach((mt) => {
    const items = map.get(mt);
    if (!items?.length) return;
    out.push({ mealType: mt, items });
    map.delete(mt);
  });
  for (const [mt, items] of map) {
    if (items.length) out.push({ mealType: mt, items });
  }
  return out;
}

function timelineSortKey(entry) {
  const t = entry.timeDec;
  return typeof t === 'number' && !Number.isNaN(t) ? t : 99;
}

export default function PlanningWizard({
  dailyLog = [],
  userTargets = {},
  calorieStrategy,
  burnedKcalBonus = 0,
  onClose,
  onConfirmApply,
}) {
  const snapshotRef = useRef(null);
  if (snapshotRef.current === null) {
    snapshotRef.current = computeOpenSnapshot(dailyLog);
  }
  const { lockedMuscles, trainingLockedFromLog, mealsPresentInLog } = snapshotRef.current;

  const [step, setStep] = useState(1);
  const [macros, setMacros] = useState(() => new Set(snapshotRef.current.macros));
  const [muscles, setMuscles] = useState(() => new Set(snapshotRef.current.muscles));
  const [timingByMacro, setTimingByMacro] = useState({});

  const stagingGhosts = useMemo(() => {
    const nd = getLocalDecimalHourNow();
    return [...ghostRowsFromLog(dailyLog), ...buildProposedRows(dailyLog, nd)];
  }, [dailyLog]);

  const hasTraining = macros.has('training');
  const hasRealWorkout = useMemo(() => !!extractRealWorkout(dailyLog), [dailyLog]);

  const timingComplete = useMemo(() => {
    for (const id of macros) {
      if (!timingByMacro[id]) return false;
    }
    return macros.size > 0;
  }, [macros, timingByMacro]);

  const canAdvanceFrom1 = macros.size > 0 && timingComplete && (!hasTraining || muscles.size > 0);

  const dynOpts = useMemo(
    () => ({
      calorieStrategy,
      burnedKcalBonus: Number(burnedKcalBonus) || 0,
    }),
    [calorieStrategy, burnedKcalBonus]
  );

  const registeredMealGroups = useMemo(() => groupRegisteredMealsByMealType(dailyLog), [dailyLog]);

  const ghostLogMeals = useMemo(
    () => (dailyLog || []).filter((e) => e && e.type === 'ghost_meal'),
    [dailyLog]
  );

  const mgConsumed = useMemo(() => sumMgFromLog(dailyLog), [dailyLog]);

  const toggleMacro = (id) => {
    setMacros((prev) => {
      if (id === 'training' && trainingLockedFromLog && prev.has('training')) return prev;
      return toggleInSet(prev, id);
    });
  };

  const toggleMuscle = (name) => {
    if (lockedMuscles.has(name) && muscles.has(name)) return;
    setMuscles((prev) => toggleInSet(prev, name));
  };

  const setTiming = (macroId, slot) => {
    if (isTimingSlotInPast(slot)) return;
    setTimingByMacro((prev) => ({ ...prev, [macroId]: slot }));
  };

  const goNext = useCallback(() => {
    if (step === 1 && !canAdvanceFrom1) return;
    if (step < 3) setStep((s) => s + 1);
  }, [step, canAdvanceFrom1]);

  const goBack = useCallback(() => {
    if (step > 1) setStep((s) => s - 1);
  }, [step]);

  const workoutDecForApply = useMemo(() => {
    if (!hasTraining || hasRealWorkout) return null;
    const slot = timingByMacro.training;
    if (!slot) return null;
    return fasciaToDecimal(slot);
  }, [hasTraining, hasRealWorkout, timingByMacro]);

  const handleConfirm = () => {
    const ghostMeals = stagingGhosts.map((r) => ({
      mealType: r.mealType,
      mealTime: r.mealTime,
      title: r.title,
      microDesc: r.microDesc,
      draftFoods: Array.isArray(r.draftFoods) ? r.draftFoods.map((x) => String(x).trim()).filter(Boolean) : [],
    }));
    onConfirmApply?.({
      ghostMeals,
      workoutTimeDec: workoutDecForApply,
      addGhostWorkout: Boolean(hasTraining && !hasRealWorkout && workoutDecForApply != null),
    });
  };

  const timelineEntries = useMemo(() => {
    const rows = [];
    const realMealItems = [];
    (dailyLog || []).forEach((e) => {
      if (!e) return;
      if (e.isGhost && e.type !== 'ghost_meal' && e.type !== 'ghost_workout') return;
      if ((e.type === 'food' || e.type === 'recipe') && !e.isGhost) {
        realMealItems.push(e);
      } else if (e.type === 'workout') {
        rows.push({
          kind: 'real_workout',
          timeDec: Number(e.time ?? e.mealTime) || 0,
          label: `[Workout] ${String(e.desc || e.name || 'Allenamento')}`,
        });
      } else if (e.type === 'ghost_meal') {
        rows.push({
          kind: 'ghost_meal_old',
          timeDec: Number(e.mealTime) || 0,
          label: `[Ghost] ${String(e.title || 'Pasto')}`,
        });
      } else if (e.type === 'ghost_workout') {
        rows.push({
          kind: 'ghost_wo_old',
          timeDec: Number(e.time) || 0,
          label: `[Ghost] ${String(e.title || 'Allenamento')}`,
        });
      }
    });
    const byMt = new Map();
    realMealItems.forEach((e) => {
      const mt = toCanonicalMealType(String(e.mealType || '').split('_')[0]) || 'snack';
      if (!byMt.has(mt)) byMt.set(mt, []);
      byMt.get(mt).push(e);
    });
    REGISTERED_MEAL_GROUP_ORDER.forEach((mt) => {
      const items = byMt.get(mt);
      if (!items?.length) return;
      const decs = items.map((x) => Number(x.mealTime)).filter((t) => !Number.isNaN(t));
      const timeDec = decs.length ? Math.min(...decs) : 0;
      rows.push({ kind: 'real_meal_group', timeDec, mealType: mt, items });
      byMt.delete(mt);
    });
    for (const [mt, items] of byMt) {
      if (!items.length) continue;
      const decs = items.map((x) => Number(x.mealTime)).filter((t) => !Number.isNaN(t));
      const timeDec = decs.length ? Math.min(...decs) : 0;
      rows.push({ kind: 'real_meal_group', timeDec, mealType: mt, items });
    }
    stagingGhosts.forEach((g) => {
      rows.push({
        kind: g.source === 'proposed' ? 'ghost_proposed' : 'ghost_staging',
        timeDec: g.mealTime,
        label: `${g.source === 'proposed' ? '🎯 ' : '📋 '}${g.title}`,
      });
    });
    if (hasTraining && !hasRealWorkout && workoutDecForApply != null) {
      rows.push({
        kind: 'ghost_wo_new',
        timeDec: workoutDecForApply,
        label: '⚡ Allenamento pianificato (nuovo)',
      });
    }
    rows.sort((a, b) => timelineSortKey(a) - timelineSortKey(b));
    return rows;
  }, [dailyLog, stagingGhosts, hasTraining, hasRealWorkout, workoutDecForApply]);

  const macroList = MACRO_OPTIONS.filter((m) => macros.has(m.id));

  return (
    <div style={{ ...glassPanel, padding: '16px 14px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
        <div>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,229,255,0.55)', fontWeight: 700 }}>
            Pianificazione guidata
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff8e8', marginTop: 4 }}>Passo {step} di 3</div>
        </div>
        <button
          type="button"
          onClick={() => onClose?.()}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.2)',
            color: 'rgba(255,248,220,0.85)',
            fontWeight: 700,
            fontSize: '0.78rem',
            cursor: 'pointer',
          }}
        >
          Chiudi
        </button>
      </div>

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.82rem', color: 'rgba(200,210,220,0.9)' }}>
            Seleziona le macro-attività di oggi e la fascia oraria per ciascuna. Se alleni, scegli anche i gruppi muscolari.
          </p>
          {MACRO_OPTIONS.map(({ id, label }) => {
            const on = macros.has(id);
            const lockedTrain = id === 'training' && trainingLockedFromLog && on;
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleMacro(id)}
                style={{ ...bigTileBase, ...(on ? bigTileSelected : {}), ...(lockedTrain ? { opacity: 0.92 } : {}) }}
              >
                {label}
                {lockedTrain ? ' 🔒' : ''}
              </button>
            );
          })}

          {hasTraining ? (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#c4b5fd', marginBottom: 8 }}>Gruppi muscolari / sessione</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {MUSCLE_OPTIONS.map((name) => {
                  const on = muscles.has(name);
                  const locked = lockedMuscles.has(name) && on;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleMuscle(name)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: on ? '1px solid rgba(179, 136, 255, 0.55)' : '1px solid rgba(255,248,220,0.12)',
                        background: on ? 'rgba(179, 136, 255, 0.15)' : 'rgba(255,255,255,0.04)',
                        color: '#fff8e8',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: locked ? 'default' : 'pointer',
                        opacity: locked ? 0.88 : 1,
                      }}
                    >
                      {name}
                      {locked ? ' 🔒' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {macroList.length > 0 ? (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7dd3fc' }}>Fascia oraria per attività</div>
              {macroList.map(({ id, label }) => (
                <div
                  key={id}
                  style={{
                    padding: '12px 12px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,248,220,0.08)',
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#7dd3fc', fontSize: '0.85rem', marginBottom: 10 }}>
                    {id === 'training' && muscles.size > 0 ? `${label}: ${MUSCLE_OPTIONS.filter((m) => muscles.has(m)).join(' e ')}` : label}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {TIMING_KEYS.map(({ id: slotId, label: slotLabel }) => {
                      const on = timingByMacro[id] === slotId;
                      const slotPast = isTimingSlotInPast(slotId);
                      return (
                        <button
                          key={slotId}
                          type="button"
                          disabled={slotPast}
                          onClick={() => setTiming(id, slotId)}
                          style={{
                            flex: 1,
                            minWidth: 88,
                            padding: '10px 8px',
                            borderRadius: 10,
                            border: on ? '1px solid rgba(0, 229, 255, 0.6)' : '1px solid rgba(255,255,255,0.12)',
                            background: on ? 'rgba(0, 229, 255, 0.18)' : 'rgba(0,0,0,0.2)',
                            color: slotPast ? 'rgba(255,248,220,0.35)' : '#fff8e8',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: slotPast ? 'not-allowed' : 'pointer',
                            opacity: slotPast ? 0.45 : 1,
                          }}
                        >
                          {slotPast ? `${slotLabel} 🔒` : slotLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {mealsPresentInLog ? (
            <div
              role="status"
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid rgba(251, 191, 36, 0.35)',
                background: 'rgba(251, 191, 36, 0.08)',
                color: '#fde68a',
                fontSize: '0.76rem',
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              Pasti reali già nel diario: non verranno sovrascritti in conferma.
            </div>
          ) : null}

          <button
            type="button"
            disabled={!canAdvanceFrom1}
            onClick={goNext}
            style={{
              marginTop: 8,
              padding: '14px 16px',
              borderRadius: 12,
              border: 'none',
              background: canAdvanceFrom1 ? 'rgba(0, 229, 255, 0.25)' : 'rgba(60,60,60,0.5)',
              color: canAdvanceFrom1 ? '#e0faff' : '#666',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: canAdvanceFrom1 ? 'pointer' : 'not-allowed',
            }}
          >
            Continua
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(200,210,220,0.9)' }}>
            Pasti del giorno e target dinamici (motore biochimico). I futuri usano ciò che resta da collimare alla giornata.
          </p>

          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#4ade80', marginBottom: 8, letterSpacing: '0.06em' }}>FATTI (registrati)</div>
            {registeredMealGroups.length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: '#888' }}>Nessun pasto reale registrato oggi.</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', color: '#e5e7eb', fontSize: '0.78rem', lineHeight: 1.45 }}>
                {registeredMealGroups.map((g, gi) => (
                  <li key={`${g.mealType}_${gi}`} style={{ marginBottom: 8 }}>
                    <details
                      style={{
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '1px solid rgba(74, 222, 128, 0.25)',
                        background: 'rgba(34, 197, 94, 0.06)',
                      }}
                    >
                      <summary
                        style={{
                          cursor: 'pointer',
                          listStyle: 'none',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          color: '#bbf7d0',
                        }}
                      >
                        ▶ {mealTypeLabelIt(g.mealType)} - Fatto
                      </summary>
                      <div style={{ fontSize: '0.72rem', color: '#d1fae5', marginTop: 8, lineHeight: 1.45 }}>
                        {g.items.map((e, j) => {
                          const hh = decimalHourToHHMM(Number(e.mealTime)) || '—';
                          const kcal = Math.round(Number(e.kcal || e.cal) || 0);
                          const p = Number(e.prot) || 0;
                          const c = Number(e.carb) || 0;
                          const f = Number(e.fatTotal ?? e.fat) || 0;
                          const fib = Number(e.fibre) || 0;
                          const mg = Number(e.mg) || 0;
                          const macroLine = `${kcal} kcal, P${p.toFixed(0)}g C${c.toFixed(0)}g F${f.toFixed(0)}g${fib > 0 ? ` · fibre ${fib.toFixed(0)}g` : ''}${mg > 0 ? ` · Mg ${Math.round(mg)}mg` : ''}`;
                          return (
                            <div key={e.id || j} style={{ marginTop: j > 0 ? 6 : 0 }}>
                              <strong>{hh}</strong> · {String(e.desc || e.title || 'Pasto')} — {macroLine}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#a78bfa', marginBottom: 8, letterSpacing: '0.06em' }}>PIANIFICATI (ghost in diario)</div>
            {ghostLogMeals.length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: '#888' }}>Nessun pasto fantasma salvato.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, color: '#ddd6fe', fontSize: '0.78rem', lineHeight: 1.45 }}>
                {ghostLogMeals.map((e, i) => {
                  const hh = decimalHourToHHMM(Number(e.mealTime)) || '—';
                  const t = getDynamicMealTargets(String(e.mealType || 'pranzo').split('_')[0], dailyLog, userTargets, dynOpts);
                  const foods = Array.isArray(e.draftFoods) ? e.draftFoods : [];
                  return (
                    <li
                      key={e.id || i}
                      style={{
                        marginBottom: 8,
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '2px dashed rgba(167, 139, 250, 0.45)',
                        background: 'rgba(167, 139, 250, 0.06)',
                        listStyle: 'none',
                        marginLeft: -18,
                      }}
                    >
                      <div>
                        <strong>{hh}</strong> · {String(e.title || 'Pasto pianificato')} ({String(e.mealType || '')})
                      </div>
                      <DraftFoodPillsMini foods={foods} />
                      <div style={{ fontSize: '0.7rem', color: '#c4b5fd', marginTop: 4 }}>
                        Target residui per questo slot: ~{t.kcal} kcal, P{t.prot}g, C{t.carb}g, F{t.fat}g · {microHintFromTargets(t, userTargets)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#22d3ee', marginBottom: 8, letterSpacing: '0.06em' }}>PROPOSTI ORA (slot liberi · motore)</div>
            {stagingGhosts.filter((r) => r.source === 'proposed').length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: '#888' }}>Nessuno slot futuro vuoto da proporre.</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {stagingGhosts
                  .filter((r) => r.source === 'proposed')
                  .map((r) => {
                    const t = getDynamicMealTargets(r.mealType, dailyLog, userTargets, dynOpts);
                    const hh = decimalHourToHHMM(r.mealTime) || '—';
                    return (
                      <li
                        key={r.id}
                        style={{
                          marginBottom: 10,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid rgba(34, 211, 238, 0.35)',
                          background: 'rgba(34, 211, 238, 0.08)',
                        }}
                      >
                        <div style={{ fontWeight: 800, color: '#a5f3fc' }}>
                          {hh} · {r.title}
                        </div>
                        <DraftFoodPillsMini foods={r.draftFoods} />
                        <div style={{ fontSize: '0.72rem', color: '#cffafe', marginTop: 6, lineHeight: 1.4 }}>
                          Target suggeriti: ~{t.kcal} kcal · Prot {t.prot}g · Carb {t.carb}g · Grassi {t.fat}g
                          <br />
                          {microHintFromTargets(t, userTargets)}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(200,230,240,0.85)', marginTop: 6 }}>
                          Magnesio accumulato oggi (da pasti registrati): ~{Math.round(mgConsumed)} mg
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={goBack}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'transparent',
                color: 'rgba(255,248,220,0.85)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Indietro
            </button>
            <button
              type="button"
              onClick={goNext}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: 12,
                border: 'none',
                background: 'rgba(0, 229, 255, 0.25)',
                color: '#e0faff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Continua
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(200,210,220,0.9)' }}>
            Riepilogo timeline: eventi passati e nuova pianificazione (ghost). La conferma sostituisce i vecchi nodi fantasma pasto e aggiorna l’allenamento ghost se previsto, senza modificare i pasti reali.
          </p>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(125, 211, 252, 0.25)',
              background: 'rgba(14, 165, 233, 0.08)',
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            <ul style={{ margin: 0, paddingLeft: 18, color: '#e0f2fe', fontSize: '0.78rem', lineHeight: 1.5 }}>
              {timelineEntries.map((row, i) => {
                if (row.kind === 'real_meal_group') {
                  return (
                    <li key={`rg_${row.mealType}_${i}`} style={{ marginBottom: 8, listStyle: 'none', marginLeft: -18 }}>
                      <details
                        style={{
                          padding: '6px 10px',
                          borderRadius: 10,
                          border: '1px solid rgba(125, 211, 252, 0.28)',
                          background: 'rgba(14, 165, 233, 0.07)',
                        }}
                      >
                        <summary
                          style={{
                            cursor: 'pointer',
                            listStyle: 'none',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            color: '#bae6fd',
                          }}
                        >
                          ▶ {mealTypeLabelIt(row.mealType)} - Fatto
                        </summary>
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.74rem', color: '#e0f2fe' }}>
                          {row.items.map((e, j) => (
                            <li key={e.id || j} style={{ marginBottom: 4 }}>
                              <strong>{decimalHourToHHMM(Number(e.mealTime)) || '—'}</strong> {String(e.desc || e.title || '—')}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  );
                }
                return (
                  <li key={i} style={{ marginBottom: 6 }}>
                    <strong>{decimalHourToHHMM(row.timeDec) || '—'}</strong> {row.label}
                  </li>
                );
              })}
            </ul>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                width: '100%',
                padding: '16px 18px',
                borderRadius: 14,
                border: 'none',
                background: 'linear-gradient(135deg, #00e5ff 0%, #7c3aed 100%)',
                color: '#0a0a0a',
                fontWeight: 900,
                fontSize: '0.9rem',
                letterSpacing: '0.03em',
                cursor: 'pointer',
                boxShadow: '0 0 24px rgba(0, 229, 255, 0.35)',
              }}
            >
              Conferma e Applica
            </button>
            <button
              type="button"
              onClick={goBack}
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: 'rgba(255,248,220,0.8)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Torna indietro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
