import React from 'react';

export default function FrequentMealBanner({ count, mealLabel, onOpen }) {
  if (!count || count <= 0) return null;

  const label = String(mealLabel || 'Pasto').trim() || 'Pasto';
  const mealText = count === 1 ? 'pasto frequente salvato' : 'pasti frequenti salvati';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-3 w-full rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-left transition-colors hover:border-amber-400/40 hover:bg-amber-950/35 active:scale-[0.99]"
    >
      <p className="text-sm leading-snug text-amber-100">
        💡 Hai <span className="font-semibold">{count}</span> {mealText} per{' '}
        <span className="font-semibold">{label}</span>. Tocca per vederli.
      </p>
    </button>
  );
}
