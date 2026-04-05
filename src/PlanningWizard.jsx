/**
 * Wizard guidato per avviare la pianificazione giornaliera (invio testo strutturato alla chat).
 */
import React, { useCallback, useMemo, useState } from 'react';

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

export default function PlanningWizard({ onClose, onSubmit }) {
  const [step, setStep] = useState(1);
  const [macros, setMacros] = useState(() => new Set());
  const [muscles, setMuscles] = useState(() => new Set());
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
    setTimingByMacro((prev) => ({ ...prev, [macroId]: slot }));
  };

  const handleFinalize = () => {
    if (!timingComplete) return;
    const text = buildGuidedPrompt({
      macroIds: macros,
      muscles: MUSCLE_OPTIONS.filter((m) => muscles.has(m)),
      timingByMacro,
    });
    onSubmit?.(text);
  };

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
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMacros((prev) => toggleInSet(prev, id))}
                style={{ ...bigTileBase, ...(on ? bigTileSelected : {}) }}
              >
                {label}
              </button>
            );
          })}
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
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setMuscles((prev) => toggleInSet(prev, name))}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: on ? '1px solid rgba(179, 136, 255, 0.55)' : '1px solid rgba(255,248,220,0.12)',
                    background: on ? 'rgba(179, 136, 255, 0.15)' : 'rgba(255,255,255,0.04)',
                    color: '#fff8e8',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  {name}
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
            Per ogni attività scegli una fascia oraria (una sola per riga).
          </p>
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
                  return (
                    <button
                      key={slotId}
                      type="button"
                      onClick={() => setTiming(id, slotId)}
                      style={{
                        flex: 1,
                        minWidth: 88,
                        padding: '10px 8px',
                        borderRadius: 10,
                        border: on ? '1px solid rgba(0, 229, 255, 0.6)' : '1px solid rgba(255,255,255,0.12)',
                        background: on ? 'rgba(0, 229, 255, 0.18)' : 'rgba(0,0,0,0.2)',
                        color: '#fff8e8',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      {slotLabel}
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
