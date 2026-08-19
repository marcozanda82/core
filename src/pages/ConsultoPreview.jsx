import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import KentuSolverModal from '../components/solver/KentuSolverModal';
import { calculateNutritionalGap } from '../utils/solverEngine';

/** Target pasto sandbox */
const MEAL_TARGETS = {
  kcal: 650,
  prot: 35,
  carb: 80,
  fat: 20,
};

/** Già nel piatto: 80g riso + 10g olio */
const EXISTING_FOODS = [
  {
    id: 'rice_existing',
    name: 'Riso Basmati',
    grams: 80,
    kcal: 280,
    prot: 6.4,
    carb: 61.6,
    fat: 0.5,
  },
  {
    id: 'oil_existing',
    name: 'Olio EVO',
    grams: 10,
    kcal: 88,
    prot: 0,
    carb: 0,
    fat: 10,
  },
];

export default function ConsultoPreview() {
  const [open, setOpen] = useState(false);
  const [lastApplied, setLastApplied] = useState(null);

  const initialGap = useMemo(
    () => calculateNutritionalGap(MEAL_TARGETS, EXISTING_FOODS, []),
    [],
  );

  return (
    <div
      style={{ minHeight: '100dvh', background: '#050a12' }}
      className="text-slate-100"
    >
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <Sparkles className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Sandbox
              </p>
              <h1 className="truncate text-xl font-semibold">Consulto Pasto — Solver Preview</h1>
            </div>
          </div>
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold">Stato iniziale</p>
          <p className="mt-1 text-sm text-slate-300">
            Già mangiato: <span className="font-mono text-slate-100">80g Riso Basmati</span> +{' '}
            <span className="font-mono text-slate-100">10g Olio EVO</span>
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Target pasto: <span className="font-mono text-slate-100">650 kcal</span>,{' '}
            <span className="font-mono text-slate-100">35g proteine</span>,{' '}
            <span className="font-mono text-slate-100">80g carbo</span>,{' '}
            <span className="font-mono text-slate-100">20g grassi</span>
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              Gap residuo: {Math.round(initialGap.kcal)} kcal
            </span>
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
              +{initialGap.prot}g proteine
            </span>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              +{initialGap.carb}g carbo
            </span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              +{initialGap.fat}g grassi
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200 transition-colors hover:bg-cyan-500/20 active:scale-95"
            >
              Apri Kentu Solver
            </button>
            {lastApplied ? (
              <span className="text-xs text-emerald-200">
                Applicate {lastApplied.totalCount} proposte ({lastApplied.lockedCount} bloccate).
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <KentuSolverModal
        open={open}
        onClose={() => setOpen(false)}
        targets={MEAL_TARGETS}
        existingFoods={EXISTING_FOODS}
        onApply={(next) => {
          setLastApplied({
            totalCount: next.length,
            lockedCount: next.filter((p) => p.locked).length,
            at: Date.now(),
          });
        }}
      />
    </div>
  );
}
