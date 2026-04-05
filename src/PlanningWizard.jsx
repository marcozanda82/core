/**
 * Wizard guidato per avviare la pianificazione giornaliera (invio testo strutturato alla chat).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { toCanonicalMealType } from './coreEngine';

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

/** Riga leggibile per contesto AI: solo eventi reali (no ghost). */
function formatLogEntryForPlanningContext(n) {
  if (!n || typeof n !== 'object') return null;
  if (n.isGhost === true) return null;
  if (n.type === 'ghost_meal' || n.type === 'ghost_workout') return null;

  const rawT = n.mealTime ?? n.time ?? n.wakeTime;
  let timeStr = '—';
  if (typeof rawT === 'number' && !Number.isNaN(rawT)) {
    const hhmm = decimalHourToHHMM(rawT);
    if (hhmm) timeStr = hhmm;
  } else if (typeof rawT === 'string' && rawT.includes(':')) {
    timeStr = rawT.trim().slice(0, 5);
  }

  const typ = String(n.type || '');
  let label = typ;
  if (typ === 'food' || typ === 'recipe') {
    const slot = n.mealType ? toCanonicalMealType(String(n.mealType).split('_')[0]) : '';
    const foodName = String(n.desc || n.title || n.name || '').trim();
    label = foodName
      ? `pasto ${slot || n.mealType || ''} (${foodName})`.replace(/\s+/g, ' ').trim()
      : n.mealType
        ? `pasto ${n.mealType}`
        : 'pasto';
  } else if (typ === 'workout') {
    label = String(n.desc || n.name || n.title || 'allenamento');
  } else if (typ === 'sleep') {
    label = 'sonno';
  }

  return `[${timeStr}] ${label}`;
}

/** Pianificazioni già presenti (ghost) — contesto separato dal log reale. */
function formatGhostEntryForPlanningContext(n) {
  if (!n || typeof n !== 'object') return null;
  const isGhost = n.isGhost === true || n.type === 'ghost_meal' || n.type === 'ghost_workout';
  if (!isGhost) return null;

  const rawT = n.mealTime ?? n.time;
  let timeStr = '—';
  if (typeof rawT === 'number' && !Number.isNaN(rawT)) {
    const hhmm = decimalHourToHHMM(rawT);
    if (hhmm) timeStr = hhmm;
  } else if (typeof rawT === 'string' && rawT.includes(':')) {
    timeStr = rawT.trim().slice(0, 5);
  }

  if (n.type === 'ghost_meal') {
    const t = String(n.title || 'pasto pianificato').trim();
    const mt = n.mealType ? String(n.mealType) : '';
    return `[${timeStr}] ghost pasto ${mt ? `${mt}: ` : ''}${t}`;
  }
  if (n.type === 'ghost_workout') {
    return `[${timeStr}] ghost ${String(n.title || 'allenamento pianificato')}`;
  }
  return `[${timeStr}] ghost`;
}

function extractRealWorkout(log) {
  return (log || []).find((e) => e && !e.isGhost && e.type === 'workout');
}

function hasRealMealsInLog(log) {
  return (log || []).some((e) => e && !e.isGhost && (e.type === 'food' || e.type === 'recipe'));
}

/** Estrae gruppi muscolari da titolo/descrizione allenamento (italiano). */
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

/** Ora locale come ore decimali 0–24. */
function getLocalDecimalHourNow() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Fascia già passata per il giorno corrente (pianificazione solo avanti nel tempo). */
function isTimingSlotInPast(slotId) {
  const h = getLocalDecimalHourNow();
  if (slotId === 'mattina') return h >= 12;
  if (slotId === 'pomeriggio') return h >= 18;
  return false;
}

function buildLogSummaryFromDailyLog(dailyLog) {
  const log = dailyLog || [];
  const fatto = log.map((e) => formatLogEntryForPlanningContext(e)).filter(Boolean);
  const pianificato = log.map((e) => formatGhostEntryForPlanningContext(e)).filter(Boolean);
  return { fatto, pianificato };
}

function buildGuidedPrompt({ macroIds, muscles, timingByMacro }) {
  const order = MACRO_OPTIONS.map((m) => m.id).filter((id) => macroIds.has(id));
  const fascLabel = (k) => (k === 'mattina' ? 'Mattina' : k === 'pomeriggio' ? 'Pomeriggio' : 'Sera');
  const parts = order.map((id) => {
    const def = MACRO_OPTIONS.find((m) => m.id === id);
    const label = def?.label || id;
    const slot = timingByMacro[id];
    const fasc = fascLabel(slot);
    if (id === 'training' && muscles.length > 0) {
      return `${label}: ${muscles.join(' e ')} (${fasc})`;
    }
    return `${label} (${fasc})`;
  });
  return (
    `PIANIFICAZIONE GUIDATA: ${parts.join('. ')}. ` +
    `Ottimizza orari, target calorico e genera i Nodi Fantasma per i pasti con focus sui micronutrienti per mantenere la lucidità e proteggere il sonno.`
  );
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

export default function PlanningWizard({ onClose, onSubmit, dailyLog = [] }) {
  const snapshotRef = useRef(null);
  if (snapshotRef.current === null) {
    snapshotRef.current = computeOpenSnapshot(dailyLog);
  }
  const { lockedMuscles, trainingLockedFromLog, mealsPresentInLog } = snapshotRef.current;

  const [step, setStep] = useState(1);
  const [macros, setMacros] = useState(() => new Set(snapshotRef.current.macros));
  const [muscles, setMuscles] = useState(() => new Set(snapshotRef.current.muscles));
  const [timingByMacro, setTimingByMacro] = useState({});

  const hasTraining = macros.has('training');

  const canAdvanceFrom1 = macros.size > 0;
  const canAdvanceFrom2 = !hasTraining || muscles.size > 0;

  const timingComplete = useMemo(() => {
    for (const id of macros) {
      if (!timingByMacro[id]) return false;
    }
    return macros.size > 0;
  }, [macros, timingByMacro]);

  const goNext = useCallback(() => {
    if (step === 1) {
      if (!canAdvanceFrom1) return;
      if (hasTraining) setStep(2);
      else setStep(3);
      return;
    }
    if (step === 2) {
      if (!canAdvanceFrom2) return;
      setStep(3);
    }
  }, [step, canAdvanceFrom1, canAdvanceFrom2, hasTraining]);

  const goBack = useCallback(() => {
    if (step === 3) {
      if (hasTraining) setStep(2);
      else setStep(1);
      return;
    }
    if (step === 2) setStep(1);
  }, [step, hasTraining]);

  const setTiming = (macroId, slot) => {
    if (isTimingSlotInPast(slot)) return;
    setTimingByMacro((prev) => ({ ...prev, [macroId]: slot }));
  };

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

  const handleFinalize = () => {
    if (!timingComplete) return;
    const base = buildGuidedPrompt({
      macroIds: macros,
      muscles: MUSCLE_OPTIONS.filter((m) => muscles.has(m)),
      timingByMacro,
    });
    const currentTime = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const { fatto, pianificato } = buildLogSummaryFromDailyLog(dailyLog);
    const fattoStr = fatto.length ? fatto.join(' | ') : 'Nessuno';
    const ghostStr = pianificato.length ? pianificato.join(' | ') : 'Nessuno';
    const invisible =
      `[CONTESTO DI SISTEMA INVISIBILE: L'ora attuale è ${currentTime}. ` +
      `STATO FATTO (reale, già nel diario oggi — NON modificare, NON sostituire, NON duplicare): ${fattoStr}. ` +
      `STATO PIANIFICATO (ghost già presenti — puoi affinarli solo se coerente col resto della giornata): ${ghostStr}. ` +
      `Usa gli eventi FATTO come fondamenta del piano: non alterarli. Se l'utente ha già completato un allenamento (es. spalle), ` +
      `considera quel volume di lavoro per recupero serale, idratazione e timing dei pasti successivi. ` +
      `REGOLA TASSATIVA: NON pianificare Nodi Fantasma per orari già passati. ` +
      `NON inserire pasti ghost per slot mealType già coperti da voci FATTO. ` +
      `Adatta i macronutrienti dei futuri ghost calcolando ciò che rimane per l'obiettivo giornaliero. ` +
      `REGOLA ANTI-DUPLICAZIONE: il sistema in conferma scarta ghost che collidono con il reale; il JSON [DAILY_PLAN] deve restare coerente e snello.]`;
    const text = `${base}\n\n${invisible}`;
    onSubmit?.(text);
  };

  const diaryLines = useMemo(() => {
    const log = dailyLog || [];
    return log
      .map((e) => formatLogEntryForPlanningContext(e) || formatGhostEntryForPlanningContext(e))
      .filter(Boolean);
  }, [dailyLog]);

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
            Seleziona tutte le macro-attività che ti riguardano oggi (multipla scelta).
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
              Nel diario risultano già pasti reali registrati: il piano non deve duplicarli (slot e titoli sono protetti in conferma).
            </div>
          ) : null}
          <div
            role="note"
            style={{
              marginTop: 4,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(45, 212, 191, 0.4)',
              background: 'linear-gradient(165deg, rgba(13, 148, 136, 0.14) 0%, rgba(6, 78, 59, 0.12) 100%)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              color: '#99f6e4',
              fontSize: '0.78rem',
              lineHeight: 1.45,
              fontWeight: 600,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            ✅ Sincronizzazione reale: allenamento e muscoli sono pre-impostati dal log quando presenti; fasce orarie già passate non sono selezionabili allo step 3.
          </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.82rem', color: 'rgba(200,210,220,0.9)' }}>
            Focus allenamento: quali gruppi muscolari o tipo di sessione (multipla scelta).
          </p>
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
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
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
              disabled={!canAdvanceFrom2}
              onClick={goNext}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: 12,
                border: 'none',
                background: canAdvanceFrom2 ? 'rgba(0, 229, 255, 0.25)' : 'rgba(60,60,60,0.5)',
                color: canAdvanceFrom2 ? '#e0faff' : '#666',
                fontWeight: 800,
                cursor: canAdvanceFrom2 ? 'pointer' : 'not-allowed',
              }}
            >
              Continua
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.82rem', color: 'rgba(200,210,220,0.9)' }}>
            Per ogni attività scegli una fascia oraria (una sola per riga). Le fasce già trascorse nella giornata non sono disponibili.
          </p>
          {diaryLines.length > 0 ? (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(125, 211, 252, 0.25)',
                background: 'rgba(14, 165, 233, 0.08)',
                marginBottom: 4,
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#7dd3fc', marginBottom: 8, letterSpacing: '0.06em' }}>
                Già nel diario oggi
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(224, 242, 254, 0.95)', fontSize: '0.78rem', lineHeight: 1.45 }}>
                {diaryLines.map((line, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
                {id === 'training' && muscles.size > 0
                  ? `${label}: ${MUSCLE_OPTIONS.filter((m) => muscles.has(m)).join(' e ')}`
                  : label}
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
                      title={slotPast ? 'Fascia già passata' : undefined}
                    >
                      {slotPast ? `${slotLabel} 🔒` : slotLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              disabled={!timingComplete}
              onClick={handleFinalize}
              style={{
                width: '100%',
                padding: '16px 18px',
                borderRadius: 14,
                border: 'none',
                background: timingComplete ? 'linear-gradient(135deg, #00e5ff 0%, #7c3aed 100%)' : '#444',
                color: timingComplete ? '#0a0a0a' : '#888',
                fontWeight: 900,
                fontSize: '0.9rem',
                letterSpacing: '0.03em',
                cursor: timingComplete ? 'pointer' : 'not-allowed',
                boxShadow: timingComplete ? '0 0 24px rgba(0, 229, 255, 0.35)' : 'none',
              }}
            >
              Fai ottimizzare a Kentu
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
              Indietro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
