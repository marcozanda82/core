/**
 * L2 — Risolutore del target kcal giornaliero.
 * Nessuna dipendenza da Firebase, React o UI.
 *
 * I consumer (Bussola, Livella, bodyMetrics) scelgono il `mode` e ricevono
 * un target numerico coerente da passare a `computeDayEnergySnapshot`.
 */

import { applyCalorieStrategyToProfileKcal } from '../../coreEngine';
import { resolveBlockKcalTarget } from '../weeklyBlocks/weeklyBlockSchema';
import { normalizeTargetKcal } from './energyBalanceMath';

const DEFAULT_PROFILE_KCAL = 2000;

/**
 * @typedef {'profile_static' | 'weekly_block' | 'profile_with_strategy'} DayKcalTargetMode
 */

/**
 * @typedef {object} ResolveDayKcalTargetContext
 * @property {DayKcalTargetMode} mode
 * @property {number} [profileKcal] — TDEE di profilo (`userTargets.kcal`)
 * @property {import('../weeklyBlocks/weeklyBlockSchema').WeeklyBlockPlan} [weeklyBlockPlan]
 * @property {string | number | null | undefined} [calorieStrategy] — strategia Kentu: deficit | pari | surplus
 * @property {Record<string, string | number>} [calorieStrategyByDate] — strategia per data ISO (override)
 * @property {number} [workoutBurnKcal] — bonus workout (solo `profile_with_strategy`)
 */

/**
 * @typedef {object} ResolveDayKcalTargetResult
 * @property {number} targetKcal
 * @property {DayKcalTargetMode} mode
 * @property {string} targetSource — origine leggibile del target
 * @property {object} [meta]
 */

/**
 * @param {unknown} v
 * @returns {number}
 */
function resolveProfileKcal(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PROFILE_KCAL;
  return Math.round(n);
}

/**
 * Strategia calorica per una data: mappa per-data ha priorità sul valore globale.
 * @param {string} date
 * @param {ResolveDayKcalTargetContext} context
 * @returns {string | number | null | undefined}
 */
function strategyForDate(date, context) {
  const key = String(date || '').trim();
  const byDate = context.calorieStrategyByDate;
  if (key && byDate && typeof byDate === 'object' && byDate[key] != null) {
    return byDate[key];
  }
  return context.calorieStrategy;
}

/**
 * Risolve il target kcal per un giorno in base al `mode` richiesto.
 *
 * | mode | Comportamento |
 * |------|---------------|
 * | `profile_static` | TDEE fisso di profilo (parità Bussola attuale) |
 * | `weekly_block` | Target dal Blocco Indivisibile in `weeklyBlockPlan.blocks[date]` |
 * | `profile_with_strategy` | strategia(profile) + eventuale bonus `workoutBurnKcal` |
 *
 * @param {string} date — ISO `YYYY-MM-DD`
 * @param {ResolveDayKcalTargetContext} context
 * @returns {ResolveDayKcalTargetResult}
 */
export function resolveDayKcalTarget(date, context) {
  const dateKey = String(date || '').trim();
  const mode = context?.mode;
  const profileKcal = resolveProfileKcal(context?.profileKcal);

  if (mode === 'weekly_block') {
    const plan = context?.weeklyBlockPlan;
    const block =
      plan?.blocks && typeof plan.blocks === 'object' && dateKey
        ? plan.blocks[dateKey]
        : null;

    if (block && typeof block === 'object') {
      const targetKcal = resolveBlockKcalTarget(block, profileKcal);
      return {
        targetKcal: normalizeTargetKcal(targetKcal),
        mode: 'weekly_block',
        targetSource: 'weeklyBlockPlan.blocks',
        meta: {
          date: dateKey,
          weekStart: plan?.weekStart ?? null,
          blockActivityKind: block.activity?.kind ?? null,
          calorieStrategyStatus: block.calorieStrategy?.status ?? null,
          calorieStrategyDelta: block.calorieStrategy?.deltaKcal ?? null,
        },
      };
    }

    return {
      targetKcal: profileKcal,
      mode: 'weekly_block',
      targetSource: 'profile_fallback_missing_block',
      meta: {
        date: dateKey,
        weekStart: plan?.weekStart ?? null,
        fallbackReason: 'no_block_for_date',
      },
    };
  }

  if (mode === 'profile_with_strategy') {
    const strategy = strategyForDate(dateKey, context);
    const baseWithStrategy = applyCalorieStrategyToProfileKcal(profileKcal, strategy);
    const workoutBonus = Number(context?.workoutBurnKcal);
    const bonus = Number.isFinite(workoutBonus) && workoutBonus > 0 ? Math.round(workoutBonus) : 0;
    const targetKcal = normalizeTargetKcal(baseWithStrategy + bonus);

    return {
      targetKcal,
      mode: 'profile_with_strategy',
      targetSource: bonus > 0 ? 'profile_strategy_plus_workout' : 'profile_strategy',
      meta: {
        date: dateKey,
        profileKcal,
        calorieStrategy: strategy ?? null,
        strategyAdjustedBase: baseWithStrategy,
        workoutBonus: bonus,
      },
    };
  }

  // Default e `profile_static`: TDEE fisso (comportamento Bussola storica).
  return {
    targetKcal: profileKcal,
    mode: 'profile_static',
    targetSource: 'profile_static',
    meta: {
      date: dateKey || null,
      profileKcal,
    },
  };
}
