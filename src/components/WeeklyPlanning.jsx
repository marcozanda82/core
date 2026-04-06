import React from 'react';
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

/**
 * @param {{
 *   value: object,
 *   onChange: (u: object | ((p: object) => object)) => void,
 *   anchorDate?: Date,
 * }} props
 */
export default function WeeklyPlanning({ value, onChange, anchorDate }) {
  const from =
    anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime()) ? anchorDate : new Date();
  const weekDays = getSevenDaysFrom(from);

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
