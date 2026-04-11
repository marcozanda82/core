import React, { useMemo } from 'react';
import {
  createWeeklyPlanDay,
  WEEKLY_PLAN_GOAL_OPTIONS,
  WEEKLY_PLAN_UI_DAY_TYPES,
} from '../weeklyPlanning';

function localDateKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 7 giorni a partire da `from` (locale). */
function getSevenDaysFrom(from) {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    out.push({
      key: localDateKeyFromDate(d),
      date: d,
    });
  }
  return out;
}

const DAY_LABELS = {
  deficit: 'Deficit',
  maintenance: 'Maint',
  training: 'Training',
};

/** Somma kcal su 7 gg: giorni senza target usano il profilo; delta = somma − 7× profilo. */
function computeWeeklyKcalDelta(value, weekDayKeys, profileDailyKcal) {
  const base = Math.max(1200, Math.round(Number(profileDailyKcal) || 2000));
  const baseWeek = base * 7;
  let sum = 0;
  for (let i = 0; i < weekDayKeys.length; i++) {
    const key = weekDayKeys[i];
    const raw = Number(value?.days?.[key]?.kcalTarget);
    sum += Number.isFinite(raw) && raw > 0 ? Math.round(raw) : base;
  }
  const delta = sum - baseWeek;
  const cap = Math.max(Math.round(baseWeek * 0.28), 4000);
  const ratio = Math.max(-1, Math.min(1, cap > 0 ? delta / cap : 0));
  let label = 'In linea con il profilo';
  if (delta < -280) label = 'Più leggera del profilo';
  else if (delta > 280) label = 'Più ricca del profilo';
  return { delta, ratio, label };
}

/**
 * @param {{
 *   value: object,
 *   onChange: (u: object | ((p: object) => object)) => void,
 *   anchorDate?: Date,
 *   profileDailyKcal?: number,
 * }} props
 */
export default function WeeklyPlanning({ value, onChange, anchorDate, profileDailyKcal }) {
  const anchorTick =
    anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
      ? anchorDate.getTime()
      : 'floating';
  const weekDays = useMemo(() => {
    const d = anchorTick === 'floating' ? new Date() : new Date(anchorTick);
    return getSevenDaysFrom(d);
  }, [anchorTick]);
  const weekDayKeys = useMemo(() => weekDays.map((w) => w.key), [weekDays]);
  const { delta, ratio, label } = useMemo(
    () => computeWeeklyKcalDelta(value, weekDayKeys, profileDailyKcal),
    [value, weekDayKeys, profileDailyKcal]
  );

  const setGoal = (goalId) => {
    onChange((prev) => ({ ...prev, goal: goalId }));
  };

  const setDayType = (dateKey, type) => {
    onChange((prev) => {
      const prevDay = prev.days?.[dateKey];
      const kcal = prevDay && typeof prevDay.kcalTarget === 'number' ? prevDay.kcalTarget : 0;
      return {
        ...prev,
        days: {
          ...(prev.days || {}),
          [dateKey]: createWeeklyPlanDay(type, kcal),
        },
      };
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.25)',
        }}
        aria-label={delta === 0 ? 'Bilancio settimanale in linea' : `Delta settimanale indicativo ${delta > 0 ? 'positivo' : 'negativo'}`}
      >
        <div style={{ fontSize: '0.72rem', opacity: 0.75, marginBottom: 6, letterSpacing: '0.04em' }}>
          Bilancio kcal settimanale
        </div>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>{label}</div>
        <div style={{ position: 'relative', height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: 2,
              marginLeft: -1,
              background: 'rgba(255,255,255,0.35)',
              borderRadius: 1,
              zIndex: 2,
            }}
          />
          {ratio < 0 && (
            <div
              style={{
                position: 'absolute',
                right: '50%',
                top: 2,
                bottom: 2,
                width: `${Math.abs(ratio) * 50}%`,
                background: 'linear-gradient(90deg, rgba(14,165,233,0.85), rgba(14,165,233,0.35))',
                borderRadius: '4px 0 0 4px',
                zIndex: 1,
              }}
            />
          )}
          {ratio > 0 && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 2,
                bottom: 2,
                width: `${ratio * 50}%`,
                background: 'linear-gradient(90deg, rgba(251,146,60,0.35), rgba(251,146,60,0.9))',
                borderRadius: '0 4px 4px 0',
                zIndex: 1,
              }}
            />
          )}
        </div>
        <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: 8, lineHeight: 1.35 }}>
          Rispetto a 7 giorni al tuo profilo. I giorni senza kcal dedicato contano come il profilo.
        </div>
      </div>

      <div>
        <div style={{ marginBottom: 8, fontSize: '0.8rem', opacity: 0.85 }}>Obiettivo</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {WEEKLY_PLAN_GOAL_OPTIONS.map((g) => {
            const active = (value?.goal ?? '') === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoal(g.id)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${active ? '#00e5ff' : '#444'}`,
                  background: active ? 'rgba(0,229,255,0.2)' : '#222',
                  color: '#eee',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ marginBottom: 8, fontSize: '0.8rem', opacity: 0.85 }}>Prossimi 7 giorni</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {weekDays.map(({ key, date }) => {
            const row = value?.days?.[key];
            const selected = row?.type;
            const short = date.toLocaleDateString('it-IT', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 0',
                  borderBottom: '1px solid #333',
                }}
              >
                <span style={{ minWidth: 100, fontSize: '0.82rem', color: '#ccc' }}>{short}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {WEEKLY_PLAN_UI_DAY_TYPES.map((t) => {
                    const on = selected === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDayType(key, t)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: `1px solid ${on ? '#7dd3fc' : '#555'}`,
                          background: on ? 'rgba(125,211,252,0.15)' : '#1a1a1a',
                          color: '#ddd',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        {DAY_LABELS[t] || t}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
