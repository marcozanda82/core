import React from 'react';
import MetabolicPhaseIcon from './MetabolicPhaseIcon';

export default function MetabolicStatusBadge({ metabolicSnapshot, onClick }) {
  const phase = metabolicSnapshot?.phase;
  if (!phase) return null;

  const isOverload = metabolicSnapshot?.isOverloadOverride || phase.id === 'sovraccarico';

  const label = isOverload
    ? phase.label
    : metabolicSnapshot?.hasMealLogged === false
      ? 'Nessun pasto loggato'
      : phase.label;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Fase metabolica: ${label}. Apri cruscotto.`}
      title={isOverload ? `${label} — ${phase.action}` : `${label} — ${phase.action}`}
      className={`inline-flex max-w-[min(52vw,240px)] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-transform active:scale-[0.98] ${
        isOverload
          ? 'animate-pulse border-red-500/50 bg-red-500/20 text-red-500 shadow-[0_0_14px_rgba(239,68,68,0.35)]'
          : `border-white/10 ${phase.color}`
      }`}
    >
      <MetabolicPhaseIcon phase={phase} size="sm" className="shrink-0" />
      {isOverload && phase.badgeLabel ? (
        <span className="shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
          {phase.badgeLabel}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </button>
  );
}
