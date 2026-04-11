import React from 'react';

const LINE = { blocked: { emoji: '🚫', text: 'Avoid' }, warning: { emoji: '⚠️', text: 'Limit' }, free: { emoji: '✅', text: 'OK' } };

function normalize(v) {
  return v === 'blocked' || v === 'warning' || v === 'free' ? v : 'free';
}

function MacroRow({ label, value }) {
  const key = normalize(value);
  const { emoji, text } = LINE[key];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, lineHeight: 1.4, color: 'rgba(255,255,255,0.88)' }}>
      <span style={{ minWidth: 72, opacity: 0.9 }}>{label}</span>
      <span aria-hidden>{emoji}</span>
      <span>{text}</span>
    </div>
  );
}

/**
 * @param {{ status?: { protein?: string, carbs?: string, fats?: string } }} props
 */
export default function MacroStatus({ status }) {
  const s = status && typeof status === 'object' ? status : {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="status" aria-label="Macro budget">
      <MacroRow label="Protein" value={s.protein} />
      <MacroRow label="Carbs" value={s.carbs} />
      <MacroRow label="Fats" value={s.fats} />
    </div>
  );
}
