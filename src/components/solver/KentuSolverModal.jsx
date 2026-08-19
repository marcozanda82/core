import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dice5, Lock, Minus, Plus, Sparkles, Unlock, X } from 'lucide-react';
import {
  calculateNutritionalGap,
  generateMealProposals,
  scaleProposalNutrients,
  sortProposalsLockedFirst,
} from '../../utils/solverEngine';

const PANEL_CLASS =
  'pointer-events-auto my-auto w-11/12 max-w-2xl rounded-2xl border border-white/10 bg-zinc-950/75 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md';

const GRAM_STEP = 5;
const MIN_GRAMS = 5;

function GapTile({ label, value, tone = 'cyan' }) {
  const v = typeof value === 'number' ? value : Number(value) || 0;
  const isZero = Math.abs(v) < 0.0001;
  const bg =
    tone === 'green'
      ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
      : tone === 'amber'
        ? 'bg-amber-500/10 border-amber-400/30 text-amber-100'
        : 'bg-cyan-500/10 border-cyan-400/30 text-cyan-100';

  return (
    <div
      className={[
        'flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2',
        bg,
      ].join(' ')}
    >
      <span className="min-w-0 truncate text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-zinc-300">
        {label}
      </span>
      <span
        className={[
          'shrink-0 font-mono text-sm font-bold tabular-nums',
          isZero ? 'opacity-70' : '',
        ].join(' ')}
      >
        {v}
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-white/5" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-4/5 animate-pulse rounded bg-white/5" />
        </div>
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-white/5" />
      </div>
      <div className="flex items-center justify-between gap-3 pl-[52px]">
        <div className="h-8 w-28 animate-pulse rounded-lg bg-white/5" />
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/5" />
      </div>
    </div>
  );
}

function resolveProposalKey(proposal) {
  return String(proposal?.uid || proposal?.id || '');
}

function LockButton({ locked, disabled, onClick, name }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 disabled:opacity-50',
        locked
          ? 'h-9 w-9 border-emerald-400/45 bg-emerald-500/25 text-emerald-100'
          : 'h-10 w-10 border-white/10 bg-white/[0.04] text-slate-200 hover:border-cyan-400/30 hover:text-cyan-100',
      ].join(' ')}
      aria-label={locked ? `Sblocca ${name}` : `Blocca ${name}`}
      title={locked ? 'Bloccato (🔒) — tocca per riaprire' : 'Libero (🔓) — verrà ricalcolato'}
    >
      {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
    </button>
  );
}

function ProposalCard({
  proposal,
  disabled,
  isEditingGrams,
  onToggleLock,
  onStartEditGrams,
  onCommitGrams,
  onCancelEditGrams,
  onAdjustGrams,
}) {
  const proposalKey = resolveProposalKey(proposal);
  const locked = Boolean(proposal.locked);
  const cardBase = 'rounded-2xl border transition-all duration-300 ease-in-out';
  const cardTone = locked
    ? 'border-emerald-400/40 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.12)]'
    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]';

  const handleGramInputKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommitGrams(proposalKey, event.currentTarget.value);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelEditGrams();
    }
  };

  if (locked) {
    return (
      <article
        className={[
          cardBase,
          'flex items-center justify-between gap-3 px-3 py-2',
          cardTone,
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-500/15 text-base"
            aria-hidden
          >
            {proposal.emoji || '🍽️'}
          </span>
          <div className="flex min-w-0 flex-1 items-baseline gap-1">
            <span className="truncate text-sm font-medium text-white">
              {proposal.name || 'Alimento'}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-emerald-300/80">
              · {proposal.grams ?? 0}g · {proposal.kcal ?? 0} kcal
            </span>
          </div>
        </div>

        <LockButton
          locked
          disabled={disabled}
          name={proposal.name}
          onClick={() => onToggleLock(proposalKey)}
        />
      </article>
    );
  }

  return (
    <article className={[cardBase, 'p-3', cardTone].join(' ')}>
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/60 text-lg"
          aria-hidden
        >
          {proposal.emoji || '🍽️'}
        </div>

        <p className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-white">
          {proposal.name || 'Alimento'}
        </p>

        <LockButton
          locked={false}
          disabled={disabled}
          name={proposal.name}
          onClick={() => onToggleLock(proposalKey)}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 pl-[52px] transition-all duration-200">
        <div className="flex shrink-0 items-center rounded-xl border border-white/10 bg-black/20">
          <button
            type="button"
            onClick={() => onAdjustGrams(proposalKey, -GRAM_STEP)}
            disabled={disabled || (proposal.grams ?? 0) <= MIN_GRAMS}
            className="flex h-9 w-9 items-center justify-center rounded-l-xl text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            aria-label={`Riduci ${proposal.name}`}
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>

          {isEditingGrams ? (
            <input
              type="number"
              min={MIN_GRAMS}
              step={GRAM_STEP}
              inputMode="numeric"
              autoFocus
              defaultValue={proposal.grams ?? MIN_GRAMS}
              onBlur={(event) => onCommitGrams(proposalKey, event.target.value)}
              onKeyDown={handleGramInputKeyDown}
              className="h-9 w-[4.25rem] border-x border-white/10 bg-transparent text-center font-mono text-xs font-semibold tabular-nums text-white outline-none focus:bg-white/[0.04]"
              aria-label={`Grammi ${proposal.name}`}
            />
          ) : (
            <button
              type="button"
              onClick={() => onStartEditGrams(proposalKey)}
              disabled={disabled}
              className="h-9 min-w-[4.25rem] border-x border-white/10 px-2 font-mono text-xs font-semibold tabular-nums text-white transition-colors hover:bg-white/[0.04] disabled:opacity-50"
              title="Tocca per inserire i grammi"
            >
              {proposal.grams ?? 0}g
            </button>
          )}

          <button
            type="button"
            onClick={() => onAdjustGrams(proposalKey, GRAM_STEP)}
            disabled={disabled}
            className="flex h-9 w-9 items-center justify-center rounded-r-xl text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            aria-label={`Aumenta ${proposal.name}`}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="min-w-0 text-right">
          <p className="font-mono text-sm font-bold tabular-nums text-cyan-300">
            {proposal.kcal ?? 0} kcal
          </p>
          <p className="mt-0.5 text-[0.72rem] font-mono tabular-nums text-zinc-400">
            P: {proposal.prot ?? 0} · C: {proposal.carb ?? 0} · F: {proposal.fat ?? 0}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function KentuSolverModal({
  open,
  onClose,
  targets = { kcal: 0, prot: 0, carb: 0, fat: 0 },
  existingFoods = [],
  initialLockedProposals = [],
  mealType = null,
  selectedSlot = null,
  onApply = null,
  elevated = false,
}) {
  const [localProposals, setLocalProposals] = useState([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [appliedAt, setAppliedAt] = useState(null);
  const [editingGramsId, setEditingGramsId] = useState(null);
  const [historyExcludedIds, setHistoryExcludedIds] = useState([]);

  const reformulateGenRef = useRef(0);
  const prevOpenRef = useRef(false);
  const historyExcludedRef = useRef([]);
  const initSnapshotRef = useRef({ targets, existingFoods, mealType, selectedSlot });

  const lockedProposals = useMemo(
    () => (localProposals || []).filter((p) => p.locked),
    [localProposals],
  );

  const dynamicGap = useMemo(
    () => calculateNutritionalGap(targets, existingFoods, lockedProposals),
    [targets, existingFoods, lockedProposals],
  );

  const sortedProposals = useMemo(
    () => sortProposalsLockedFirst(localProposals),
    [localProposals],
  );

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) return;
    if (!justOpened) return;

    initSnapshotRef.current = { targets, existingFoods, mealType, selectedSlot };
    historyExcludedRef.current = [];
    setHistoryExcludedIds([]);
    setAppliedAt(null);
    setEditingGramsId(null);

    const gap = calculateNutritionalGap(targets, existingFoods, initialLockedProposals);
    const initial = generateMealProposals({
      gap,
      lockedProposals: initialLockedProposals,
      excludedFoodIds: historyExcludedRef.current,
      existingFoods,
      mealType,
      selectedSlot,
      shuffleSeed: Date.now(),
    });
    setLocalProposals(sortProposalsLockedFirst(initial));
  }, [open, targets, existingFoods, initialLockedProposals, mealType, selectedSlot]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const applyGramsWithAutoLock = useCallback((id, nextGrams) => {
    setLocalProposals((prev) =>
      sortProposalsLockedFirst(
        prev.map((p) => {
          if (resolveProposalKey(p) !== id) return p;
          const scaled = scaleProposalNutrients(p, nextGrams);
          return { ...scaled, uid: p.uid || p.id, id: p.uid || p.id, locked: true };
        }),
      ),
    );
  }, []);

  const handleToggleLock = useCallback((id) => {
    if (isRecalculating) return;
    setEditingGramsId(null);
    setLocalProposals((prev) =>
      sortProposalsLockedFirst(
        prev.map((p) => {
          if (resolveProposalKey(p) !== id) return p;
          return { ...p, locked: !Boolean(p.locked) };
        }),
      ),
    );
  }, [isRecalculating]);

  const handleAdjustGrams = useCallback((id, delta) => {
    if (isRecalculating) return;
    setLocalProposals((prev) => {
      const item = prev.find((p) => resolveProposalKey(p) === id);
      if (!item) return prev;
      const nextGrams = (item.grams ?? MIN_GRAMS) + delta;
      return sortProposalsLockedFirst(
        prev.map((p) => {
          if (resolveProposalKey(p) !== id) return p;
          const scaled = scaleProposalNutrients(p, nextGrams);
          return { ...scaled, uid: p.uid || p.id, id: p.uid || p.id, locked: true };
        }),
      );
    });
  }, [isRecalculating]);

  const handleCommitGrams = (id, rawValue) => {
    if (isRecalculating) return;
    const parsed = Number.parseInt(String(rawValue).trim(), 10);
    applyGramsWithAutoLock(id, Number.isFinite(parsed) ? parsed : MIN_GRAMS);
    setEditingGramsId(null);
  };

  const handleReformulate = () => {
    if (isRecalculating) return;
    setIsRecalculating(true);
    setAppliedAt(null);
    setEditingGramsId(null);

    const gen = ++reformulateGenRef.current;

    setTimeout(() => {
      if (gen !== reformulateGenRef.current) return;

      setLocalProposals((prev) => {
        const locked = prev.filter((p) => p.locked);
        const unlocked = prev.filter((p) => !p.locked);
        const batchExcluded = unlocked
          .map((p) => p.foodId)
          .filter(Boolean);

        const combinedExcluded = [...new Set([...historyExcludedRef.current, ...batchExcluded])];
        historyExcludedRef.current = combinedExcluded;
        setHistoryExcludedIds(combinedExcluded);

        const snapshot = initSnapshotRef.current;
        const gap = calculateNutritionalGap(
          snapshot.targets ?? targets,
          snapshot.existingFoods ?? existingFoods,
          locked,
        );

        return sortProposalsLockedFirst(
          generateMealProposals({
            gap,
            lockedProposals: locked,
            excludedFoodIds: combinedExcluded,
            existingFoods: snapshot.existingFoods ?? existingFoods,
            mealType: snapshot.mealType ?? mealType,
            selectedSlot: snapshot.selectedSlot ?? selectedSlot,
            shuffleSeed: Date.now() + combinedExcluded.length * 997,
          }),
        );
      });

      setIsRecalculating(false);
      setAppliedAt(new Date().toISOString());
    }, 450);
  };

  const handleApply = () => {
    const next = localProposals.map((p) => ({
      ...p,
      locked: Boolean(p.locked),
    }));
    onApply?.(next);
    onClose?.();
  };

  if (!open || typeof document === 'undefined') return null;

  const backdropZ = elevated ? 'z-[100055]' : 'z-[100040]';
  const dialogZ = elevated ? 'z-[100056]' : 'z-[100041]';

  return createPortal(
    <>
      <div
        className={`kentu-submenu-focus-backdrop fixed inset-0 ${backdropZ} bg-black/60 backdrop-blur-md`}
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kentu Solver"
        className={`pointer-events-none fixed inset-0 ${dialogZ} flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-4 sm:py-6`}
      >
        <div className={PANEL_CLASS} onClick={(e) => e.stopPropagation()}>
          <header className="mb-3 flex items-start justify-between gap-3 border-b border-white/10 pb-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Kentu Solver
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-zinc-50">
                Consulto Pasto 🪄
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-900/80 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              aria-label="Chiudi"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <section className="mb-3 grid grid-cols-2 gap-2">
            <GapTile label="Calorie" value={Math.round(dynamicGap.kcal)} tone="cyan" />
            <GapTile label="Proteine" value={dynamicGap.prot} tone="amber" />
            <GapTile label="Carbo" value={dynamicGap.carb} tone="cyan" />
            <GapTile label="Grassi" value={dynamicGap.fat} tone="green" />
          </section>

          <section className="mb-3">
            <h3 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Cibi già presenti nel pasto
            </h3>
            <div className="flex flex-wrap gap-2">
              {(existingFoods || []).length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                  Nessun alimento nel pasto.
                </div>
              ) : (
                (existingFoods || []).map((f) => (
                  <div
                    key={f.id || f.name}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-200"
                    title={f.note || ''}
                  >
                    {f.name} · {f.grams}g
                    {typeof f.kcal === 'number' ? (
                      <span className="text-cyan-400/90"> · {f.kcal} kcal</span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Proposte di completamento
              </h3>
              {isRecalculating ? (
                <div className="flex items-center gap-2 text-xs text-cyan-200">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                  Ricalcolo in corso…
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Modifica grammi → auto-blocco.
                </div>
              )}
            </div>

            <div className="max-h-[42vh] space-y-2 overflow-y-auto pb-6 pr-1">
              {isRecalculating ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : null}

              {!isRecalculating
                ? sortedProposals.map((p) => {
                    const proposalKey = resolveProposalKey(p);
                    return (
                    <ProposalCard
                      key={proposalKey}
                      proposal={p}
                      disabled={isRecalculating}
                      isEditingGrams={editingGramsId === proposalKey}
                      onToggleLock={handleToggleLock}
                      onStartEditGrams={setEditingGramsId}
                      onCommitGrams={handleCommitGrams}
                      onCancelEditGrams={() => setEditingGramsId(null)}
                      onAdjustGrams={handleAdjustGrams}
                    />
                    );
                  })
                : null}
            </div>
          </section>

          <footer className="mt-4 border-t border-white/10 pt-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleReformulate}
                disabled={isRecalculating}
                className={[
                  'col-span-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors active:scale-95',
                  isRecalculating
                    ? 'cursor-wait border-cyan-500/20 bg-cyan-500/10 text-cyan-200/70'
                    : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20',
                ].join(' ')}
              >
                <Dice5 className="h-4 w-4" />
                {isRecalculating ? '…' : '🎲 Riformula liberi'}
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={isRecalculating}
                className="col-span-1 rounded-xl border border-zinc-700/80 bg-zinc-900/70 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white active:scale-95 disabled:opacity-60"
              >
                Annulla
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={isRecalculating}
                className="col-span-1 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3 py-2 text-sm font-bold text-emerald-100 transition-colors hover:bg-emerald-500/30 active:scale-95 disabled:opacity-60"
              >
                ✔ Applica al Pasto
              </button>
            </div>

            {appliedAt ? (
              <p className="mt-2 text-center text-xs text-emerald-200">
                Ricalcolo completato · {new Date(appliedAt).toLocaleTimeString()}
              </p>
            ) : null}
          </footer>
        </div>
      </div>
    </>,
    document.body,
  );
}
