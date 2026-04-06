/**
 * Card interattiva per modalità pianificazione giornaliera ([DAILY_PLAN:...]).
 */
import React, { useEffect, useState, useMemo } from 'react';
import { calorieStrategyShortLabelIt } from './coreEngine';

const inputBaseStyle = {
  background: 'rgba(0,0,0,0.22)',
  border: '1px solid rgba(255,248,220,0.12)',
  borderRadius: 10,
  color: '#fff8e8',
  fontSize: '0.82rem',
  padding: '8px 10px',
  outline: 'none',
};

const selectBaseStyle = {
  ...inputBaseStyle,
  cursor: 'pointer',
  minWidth: 118,
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, rgba(0,229,255,0.5) 50%), linear-gradient(135deg, rgba(0,229,255,0.5) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 14px) 55%, calc(100% - 9px) 55%',
  backgroundSize: '5px 5px, 5px 5px',
  backgroundRepeat: 'no-repeat',
  paddingRight: 28,
};

const MEAL_SELECT_OPTIONS = [
  { value: 'colazione', label: 'Colazione' },
  { value: 'pranzo', label: 'Pranzo' },
  { value: 'cena', label: 'Cena' },
  { value: 'spuntino', label: 'Spuntino' },
];

const removeRowBtnStyle = {
  background: 'transparent',
  color: '#ef4444',
  border: 'none',
  cursor: 'pointer',
  fontSize: '1.2rem',
  lineHeight: 1,
  padding: '4px 8px',
  flexShrink: 0,
  alignSelf: 'center',
};

function normalizePlanFromProps(p) {
  if (!p || typeof p !== 'object') {
    return { activities: [], ghostMeals: [] };
  }
  return {
    ...p,
    activities: Array.isArray(p.activities) ? p.activities.map((a) => ({ ...a })) : [],
    ghostMeals: Array.isArray(p.ghostMeals)
      ? p.ghostMeals.map((g) => {
          const raw = g?.draftFoods || [];
          const draftFoods = Array.isArray(raw)
            ? raw.map((x) => String(x).trim()).filter(Boolean)
            : [];
          const foods = Array.isArray(g?.foods) ? g.foods : [];
          return { ...g, draftFoods, foods };
        })
      : [],
  };
}

/** Valore coerente con le 4 opzioni del select. */
function mealTypeForSelect(mealType) {
  const base = String(mealType || '')
    .split('_')[0]
    .toLowerCase();
  if (MEAL_SELECT_OPTIONS.some((o) => o.value === base)) return base;
  return 'spuntino';
}

/** "HH:MM" o "H:MM" → minuti da mezzanotte; null se non valido. */
function timeStrToMinutes(str) {
  const s = String(str || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

const detailsBaseStyle = {
  marginBottom: 8,
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,248,220,0.08)',
  padding: '6px 10px',
};

const summaryStyle = {
  cursor: 'pointer',
  listStyle: 'none',
  fontWeight: 800,
  fontSize: '0.82rem',
  color: 'rgba(255,248,220,0.92)',
};

function DraftFoodPills({ foods }) {
  if (!Array.isArray(foods) || foods.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 4 }}>
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

function planRowDecimalHour(row) {
  if (!row) return NaN;
  if (typeof row.timeDec === 'number' && !Number.isNaN(row.timeDec)) return row.timeDec;
  const m = timeStrToMinutes(row.time);
  if (m == null) return NaN;
  return m / 60;
}

/** SOLA regola: isLocked = !row.isGhost && (timeDec ≤ nowDec). Ora in ore decimali. */
function planActivityRowIsLocked(row, nowDec) {
  if (!row || row.isGhost === true) return false;
  const td = planRowDecimalHour(row);
  if (typeof td !== 'number' || Number.isNaN(td)) return false;
  return td <= nowDec;
}

export default function DailyPlanCard({ planData, onConfirm, onCancel, onGeneratePlanGhostMealDraft }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPlan, setEditedPlan] = useState(() => normalizePlanFromProps(planData));
  const [pendingGhostProposals, setPendingGhostProposals] = useState({});
  const [generatingGhostIdx, setGeneratingGhostIdx] = useState(null);
  const [generateError, setGenerateError] = useState(null);

  useEffect(() => {
    setEditedPlan(normalizePlanFromProps(planData));
    setIsEditing(false);
    setPendingGhostProposals({});
    setGeneratingGhostIdx(null);
    setGenerateError(null);
  }, [planData]);

  const sortedWithIdx = useMemo(() => {
    const acts = editedPlan?.activities || [];
    return acts
      .map((row, idx) => ({ row, idx }))
      .sort((a, b) => {
        const ta = String(a.row?.time || '99:99');
        const tb = String(b.row?.time || '99:99');
        return ta.localeCompare(tb);
      });
  }, [editedPlan?.activities]);
  const targetLabel = calorieStrategyShortLabelIt(editedPlan?.target);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const nowDec = currentMinutes / 60;

  const updateActivity = (idx, patch) => {
    setEditedPlan((prev) => {
      if (!prev?.activities) return prev;
      const nextActs = [...prev.activities];
      nextActs[idx] = { ...nextActs[idx], ...patch };
      return { ...prev, activities: nextActs };
    });
  };

  const handleGhostMealChange = (index, field, value) => {
    setEditedPlan((prev) => {
      const list = [...(prev.ghostMeals || [])];
      if (!list[index]) return prev;
      list[index] = { ...list[index], [field]: value };
      return { ...prev, ghostMeals: list };
    });
  };

  const handleRemoveActivity = (index) => {
    setEditedPlan((prev) => ({
      ...prev,
      activities: (prev.activities || []).filter((_, i) => i !== index),
    }));
  };

  const handleRemoveGhostMeal = (index) => {
    setPendingGhostProposals((p) => {
      const next = {};
      Object.keys(p).forEach((k) => {
        const ki = parseInt(k, 10);
        if (Number.isNaN(ki)) return;
        if (ki === index) return;
        if (ki > index) next[ki - 1] = p[ki];
        else next[ki] = p[ki];
      });
      return next;
    });
    setEditedPlan((prev) => ({
      ...prev,
      ghostMeals: (prev.ghostMeals || []).filter((_, i) => i !== index),
    }));
  };

  const removeGhostDraftFood = (gIdx, foodIndex) => {
    setEditedPlan((prev) => {
      const list = [...(prev.ghostMeals || [])];
      if (!list[gIdx]) return prev;
      const foods = [...(list[gIdx].draftFoods || [])].filter((_, j) => j !== foodIndex);
      list[gIdx] = { ...list[gIdx], draftFoods: foods };
      return { ...prev, ghostMeals: list };
    });
  };

  const removePendingDraftFood = (gIdx, foodIndex) => {
    setPendingGhostProposals((prev) => {
      const cur = prev[gIdx];
      if (!Array.isArray(cur)) return prev;
      const nextFoods = cur.filter((_, j) => j !== foodIndex);
      return { ...prev, [gIdx]: nextFoods.length ? nextFoods : undefined };
    });
  };

  const acceptPendingProposal = (gIdx) => {
    const foods = pendingGhostProposals[gIdx];
    if (!Array.isArray(foods) || foods.length === 0) return;
    handleGhostMealChange(gIdx, 'draftFoods', foods);
    setPendingGhostProposals((p) => {
      const next = { ...p };
      delete next[gIdx];
      return next;
    });
  };

  const discardPendingProposal = (gIdx) => {
    setPendingGhostProposals((p) => {
      const next = { ...p };
      delete next[gIdx];
      return next;
    });
  };

  const runGenerateGhostMeal = async (gIdx) => {
    if (typeof onGeneratePlanGhostMealDraft !== 'function') return;
    const gm = editedPlan.ghostMeals?.[gIdx];
    if (!gm) return;
    setGenerateError(null);
    setGeneratingGhostIdx(gIdx);
    try {
      const draftFoods = await onGeneratePlanGhostMealDraft({
        mealType: gm.mealType,
        time: gm.time,
        title: gm.title,
        microDesc: gm.microDesc,
        planTarget: editedPlan?.target,
      });
      setPendingGhostProposals((p) => ({ ...p, [gIdx]: draftFoods }));
    } catch (err) {
      setGenerateError(err?.message || String(err));
    } finally {
      setGeneratingGhostIdx(null);
    }
  };

  const handleSaveEdits = () => {
    setIsEditing(false);
  };

  return (
    <div
      className="daily-plan-card"
      style={{
        width: '100%',
        maxWidth: '100%',
        marginTop: 6,
        marginBottom: 10,
        padding: '14px 14px 12px',
        borderRadius: 14,
        border: '2px dashed rgba(0, 229, 255, 0.28)',
        background: 'linear-gradient(165deg, rgba(28, 32, 42, 0.96) 0%, rgba(16, 20, 28, 0.98) 100%)',
        boxShadow:
          '0 0 0 1px rgba(0,0,0,0.45), 0 8px 28px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          fontSize: '0.68rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(0, 229, 255, 0.55)',
          marginBottom: 10,
          fontWeight: 700,
        }}
      >
        📅 Piano giornata
      </div>

      {!isEditing ? (
        <>
          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(0, 229, 255, 0.08)',
              border: '1px solid rgba(0, 229, 255, 0.2)',
              fontSize: '0.8rem',
              color: '#e0f7ff',
            }}
          >
            <strong style={{ color: '#7dd3fc' }}>Strategia kcal: </strong>
            {targetLabel}
            {editedPlan?.workoutTime ? (
              <>
                <span style={{ margin: '0 8px', opacity: 0.35 }}>|</span>
                <strong style={{ color: '#7dd3fc' }}>Allenamento: </strong>
                {String(editedPlan.workoutTime)}
              </>
            ) : null}
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sortedWithIdx.map(({ row, idx: origIdx }) => {
              const timeLabel = row.time || '—';
              if (planActivityRowIsLocked(row, nowDec)) {
                return (
                  <li key={`${origIdx}_${row.time}`} style={{ listStyle: 'none' }}>
                    <details style={detailsBaseStyle}>
                      <summary style={summaryStyle}>
                        🔒 [{timeLabel}] {String(row.desc || 'Attività').slice(0, 48)}
                        {String(row.desc || '').length > 48 ? '…' : ''} - Registrato
                      </summary>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(200,205,215,0.9)', marginTop: 8, lineHeight: 1.4 }}>
                        {row.desc || '—'}
                      </div>
                    </details>
                  </li>
                );
              }
              return (
                <li
                  key={`${origIdx}_${row.time}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 10px',
                    marginBottom: 8,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,248,220,0.08)',
                  }}
                >
                  <span
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 800,
                      color: '#00e5ff',
                      minWidth: 52,
                      fontSize: '0.85rem',
                    }}
                  >
                    {timeLabel}
                  </span>
                  <span style={{ flex: 1, color: '#fff8e8', fontSize: '0.88rem', lineHeight: 1.35 }}>
                    {row.desc}
                  </span>
                </li>
              );
            })}
          </ul>

          {Array.isArray(editedPlan?.ghostMeals) && editedPlan.ghostMeals.length > 0 ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 4,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(179, 136, 255, 0.08)',
                border: '1px solid rgba(179, 136, 255, 0.22)',
              }}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(224, 210, 255, 0.95)', marginBottom: 8, letterSpacing: '0.06em' }}>
                Pasti pianificati (nodi fantasma)
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {editedPlan.ghostMeals.map((gm, gi) => {
                  const foods = gm.draftFoods;
                  return (
                    <li
                      key={gi}
                      style={{
                        fontSize: '0.78rem',
                        color: '#e8e0ff',
                        marginBottom: gi < editedPlan.ghostMeals.length - 1 ? 8 : 0,
                        lineHeight: 1.35,
                      }}
                    >
                      <div>
                        <strong style={{ color: '#c4b5fd' }}>{String(gm.time || '—')}</strong>
                        {' · '}
                        {String(gm.title || 'Pasto')}
                        {gm.mealType ? (
                          <span style={{ opacity: 0.75 }}> ({String(gm.mealType)})</span>
                        ) : null}
                      </div>
                      <DraftFoodPills foods={foods} />
                      {gm.microDesc ? (
                        <div style={{ fontSize: '0.68rem', color: 'rgba(200, 200, 220, 0.9)', marginTop: 4 }}>{String(gm.microDesc)}</div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onConfirm?.(editedPlan)}
              style={{
                flex: 1,
                minWidth: 140,
                padding: '12px 14px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, #00e5ff 0%, #7c3aed 100%)',
                color: '#0a0a0a',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                letterSpacing: '0.04em',
                boxShadow: '0 0 22px rgba(0, 229, 255, 0.35), 0 4px 14px rgba(124, 58, 237, 0.25)',
              }}
            >
              Conferma Piano
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,248,220,0.8)',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              Modifica
            </button>
            <button
              type="button"
              onClick={() => onCancel?.()}
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                border: '1px solid rgba(248,113,113,0.35)',
                background: 'transparent',
                color: 'rgba(252,165,165,0.9)',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              Annulla
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: 'rgba(200,210,220,0.85)' }}>
            Modifica attività e pasti pianificati; poi salva per tornare alla vista di conferma.
          </p>

          <div
            style={{
              fontSize: '0.68rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(0, 229, 255, 0.65)',
              marginBottom: 8,
              fontWeight: 800,
            }}
          >
            Attività
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(editedPlan?.activities || []).map((row, idx) => {
              const timeLabel = row.time || '—';
              if (planActivityRowIsLocked(row, nowDec)) {
                return (
                  <details key={idx} style={detailsBaseStyle}>
                    <summary style={summaryStyle}>
                      🔒 [{timeLabel}] {String(row.desc || 'Attività').slice(0, 40)}
                      {String(row.desc || '').length > 40 ? '…' : ''} - Registrato
                    </summary>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(200,205,215,0.88)', marginTop: 8, lineHeight: 1.4 }}>
                      {row.desc || '—'}
                    </div>
                  </details>
                );
              }
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,248,220,0.06)',
                  }}
                >
                  <input
                    type="time"
                    value={row.time || ''}
                    onChange={(e) => updateActivity(idx, { time: e.target.value })}
                    style={{ ...inputBaseStyle, width: 120, colorScheme: 'dark' }}
                  />
                  <input
                    type="text"
                    value={row.desc || ''}
                    onChange={(e) => updateActivity(idx, { desc: e.target.value })}
                    placeholder="Descrizione attività"
                    style={{ ...inputBaseStyle, flex: 1, minWidth: 140 }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveActivity(idx)}
                    style={removeRowBtnStyle}
                    aria-label="Rimuovi attività"
                    title="Rimuovi"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {Array.isArray(editedPlan?.ghostMeals) && editedPlan.ghostMeals.length > 0 ? (
            <>
              <div
                style={{
                  fontSize: '0.68rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(196, 181, 253, 0.85)',
                  marginTop: 18,
                  marginBottom: 8,
                  fontWeight: 800,
                }}
              >
                Pasti
              </div>
              {generateError ? (
                <div style={{ fontSize: '0.72rem', color: '#fca5a5', marginTop: 8, marginBottom: 4 }}>{generateError}</div>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {editedPlan.ghostMeals.map((gm, gIdx) => {
                  const timeStr = gm.time != null ? String(gm.time).slice(0, 5) : '';
                  const foods = gm.draftFoods;
                  const pending = pendingGhostProposals[gIdx];
                  const canGenerate = typeof onGeneratePlanGhostMealDraft === 'function';
                  const pillShell = {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'rgba(0, 229, 255, 0.15)',
                    borderRadius: '12px',
                    padding: '4px 6px 4px 8px',
                    margin: '4px 4px 0 0',
                  };
                  const miniX = {
                    background: 'transparent',
                    border: 'none',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    lineHeight: 1,
                    padding: '0 2px',
                  };
                  return (
                    <div
                      key={gIdx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: 10,
                        borderRadius: 10,
                        background: 'rgba(179, 136, 255, 0.06)',
                        border: '1px solid rgba(179, 136, 255, 0.14)',
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                        <input
                          type="time"
                          value={timeStr}
                          onChange={(e) => handleGhostMealChange(gIdx, 'time', e.target.value)}
                          style={{ ...inputBaseStyle, width: 120, colorScheme: 'dark' }}
                        />
                        <select
                          value={mealTypeForSelect(gm.mealType)}
                          onChange={(e) => handleGhostMealChange(gIdx, 'mealType', e.target.value)}
                          style={selectBaseStyle}
                          aria-label="Tipo pasto"
                        >
                          {MEAL_SELECT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} style={{ background: '#1a1a22', color: '#fff8e8' }}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={gm.title || ''}
                          onChange={(e) => handleGhostMealChange(gIdx, 'title', e.target.value)}
                          placeholder="Titolo (es. Pranzo Focus)"
                          style={{ ...inputBaseStyle, flex: 1, minWidth: 140 }}
                        />
                        {canGenerate ? (
                          <button
                            type="button"
                            disabled={generatingGhostIdx === gIdx}
                            onClick={() => runGenerateGhostMeal(gIdx)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              border: '1px solid rgba(0, 229, 255, 0.45)',
                              background: 'rgba(0, 229, 255, 0.12)',
                              color: '#7dd3fc',
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              cursor: generatingGhostIdx === gIdx ? 'wait' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {generatingGhostIdx === gIdx ? '⏳ …' : '✨ Genera Pasto'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleRemoveGhostMeal(gIdx)}
                          style={removeRowBtnStyle}
                          aria-label="Rimuovi pasto pianificato"
                          title="Rimuovi"
                        >
                          ✕
                        </button>
                      </div>
                      {Array.isArray(pending) && pending.length > 0 ? (
                        <div
                          style={{
                            padding: 8,
                            borderRadius: 8,
                            border: '1px dashed rgba(0, 229, 255, 0.45)',
                            background: 'rgba(0, 229, 255, 0.06)',
                          }}
                        >
                          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#7dd3fc', marginBottom: 6 }}>Proposta AI</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {pending.map((foodStr, i) => (
                              <div key={`pend_${gIdx}_${i}`} style={pillShell}>
                                <span style={{ color: '#00e5ff', fontSize: '0.75rem' }}>{String(foodStr)}</span>
                                <button type="button" onClick={() => removePendingDraftFood(gIdx, i)} style={miniX} aria-label="Rimuovi dalla proposta">
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            <button
                              type="button"
                              onClick={() => acceptPendingProposal(gIdx)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: 'none',
                                background: 'linear-gradient(135deg, #00e5ff 0%, #7c3aed 100%)',
                                color: '#0a0a0a',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                              }}
                            >
                              Accetta proposta
                            </button>
                            <button
                              type="button"
                              onClick={() => discardPendingProposal(gIdx)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.2)',
                                background: 'transparent',
                                color: 'rgba(255,248,220,0.75)',
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                              }}
                            >
                              Scarta
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {Array.isArray(foods) && foods.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.65rem', color: 'rgba(200,200,220,0.85)', marginRight: 6, width: '100%', marginBottom: 2 }}>
                            Abbozzo (tocca ✕ per rimuovere)
                          </span>
                          {foods.map((foodStr, i) => (
                            <div key={`${foodStr}_${i}`} style={pillShell}>
                              <span style={{ color: '#00e5ff', fontSize: '0.75rem' }}>{String(foodStr)}</span>
                              <button type="button" onClick={() => removeGhostDraftFood(gIdx, i)} style={miniX} aria-label="Rimuovi alimento">
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleSaveEdits}
              style={{
                flex: 1,
                minWidth: 140,
                padding: '12px 14px',
                borderRadius: 12,
                border: 'none',
                background: '#b388ff',
                color: '#0a0a0a',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              Salva Modifiche
            </button>
            <button
              type="button"
              onClick={() => {
                setEditedPlan(normalizePlanFromProps(planData));
                setIsEditing(false);
              }}
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: 'rgba(255,248,220,0.75)',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              Ripristina
            </button>
          </div>
        </>
      )}
    </div>
  );
}
