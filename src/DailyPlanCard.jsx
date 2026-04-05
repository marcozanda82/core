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

export default function DailyPlanCard({ planData, onConfirm, onCancel }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPlan, setEditedPlan] = useState(() => planData);

  useEffect(() => {
    setEditedPlan(planData);
    setIsEditing(false);
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

  const updateActivity = (idx, patch) => {
    setEditedPlan((prev) => {
      if (!prev?.activities) return prev;
      const nextActs = [...prev.activities];
      nextActs[idx] = { ...nextActs[idx], ...patch };
      return { ...prev, activities: nextActs };
    });
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
            {sortedWithIdx.map(({ row, idx: origIdx }) => (
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
                    {row.time || '—'}
                  </span>
                  <span style={{ flex: 1, color: '#fff8e8', fontSize: '0.88rem', lineHeight: 1.35 }}>
                    {row.desc}
                  </span>
                </li>
            ))}
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
                {editedPlan.ghostMeals.map((gm, gi) => (
                  <li
                    key={gi}
                    style={{
                      fontSize: '0.78rem',
                      color: '#e8e0ff',
                      marginBottom: gi < editedPlan.ghostMeals.length - 1 ? 8 : 0,
                      lineHeight: 1.35,
                    }}
                  >
                    <strong style={{ color: '#c4b5fd' }}>{String(gm.time || '—')}</strong>
                    {' · '}
                    {String(gm.title || 'Pasto')}
                    {gm.mealType ? (
                      <span style={{ opacity: 0.75 }}> ({String(gm.mealType)})</span>
                    ) : null}
                    {gm.microDesc ? (
                      <div style={{ fontSize: '0.68rem', color: 'rgba(200, 200, 220, 0.9)', marginTop: 4 }}>{String(gm.microDesc)}</div>
                    ) : null}
                  </li>
                ))}
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
            Modifica orari e descrizioni; poi salva per tornare alla vista di conferma.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(editedPlan?.activities || []).map((row, idx) => (
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
                  style={{ ...inputBaseStyle, width: 120 }}
                />
                <input
                  type="text"
                  value={row.desc || ''}
                  onChange={(e) => updateActivity(idx, { desc: e.target.value })}
                  placeholder="Descrizione attività"
                  style={{ ...inputBaseStyle, flex: 1, minWidth: 140 }}
                />
              </div>
            ))}
          </div>
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
                setEditedPlan(planData);
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
