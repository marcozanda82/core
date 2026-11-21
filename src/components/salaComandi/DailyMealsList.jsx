import { memo, useMemo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { isUnresolvedMealDraftItem } from '../../utils/mealDraftStatus';
import {
  isClaudeLoggedMealEntry,
  isUnreadClaudeLoggedMeal,
  resolveClaudeMealId,
} from '../../utils/claudeLoggedMeals';

const MEAL_LABELS = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Spuntino',
  spuntino: 'Spuntino',
  merenda: 'Spuntino',
};

function mealLabelFromSlot(slotKey, mealType, items = []) {
  const slotHint = items[0]?.mealSlot || items[0]?.mealDesc;
  if (slotHint && MEAL_LABELS[String(slotHint).toLowerCase()]) {
    return MEAL_LABELS[String(slotHint).toLowerCase()];
  }
  const raw = String(mealType || slotKey || 'pasto');
  const claude = raw.match(/^claude_([a-z]+)_/i);
  const base = (claude ? claude[1] : raw.split('_')[0]).trim().toLowerCase();
  if (MEAL_LABELS[base]) return MEAL_LABELS[base];
  if (!base) return 'Pasto';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function sumMacro(items, pick) {
  return items.reduce((sum, item) => sum + (Number(pick(item)) || 0), 0);
}

function entryUnsaved(item, unsavedEntryIds) {
  if (!unsavedEntryIds || typeof unsavedEntryIds.has !== 'function') return false;
  if (item?.id != null && unsavedEntryIds.has(String(item.id))) return true;
  if (item?.mealId != null && unsavedEntryIds.has(String(item.mealId))) return true;
  if (item?.mealType != null && unsavedEntryIds.has(String(item.mealType))) return true;
  return false;
}

function buildDailyMeals(groupedFoods, decimalToTimeStr, unsavedEntryIds) {
  return Object.keys(groupedFoods || {})
    .map((slotKey) => {
      const rawItems = (groupedFoods[slotKey] || []).filter(
        (item) => item && item.type !== 'stimulant',
      );
      // Solo pasti convalidati: le bozze stanno in «Bozze da convalidare».
      const items = rawItems.filter((item) => !isUnresolvedMealDraftItem(item));
      if (items.length === 0) return null;
      const mealType = items[0]?.mealType || slotKey.split('_')[0];
      const mealTimeRaw = Number(items[0]?.mealTime ?? items[0]?.time);
      const sortTime = Number.isFinite(mealTimeRaw) ? mealTimeRaw : 12;
      const unsaved = items.some((item) => entryUnsaved(item, unsavedEntryIds))
        || (unsavedEntryIds?.has?.(String(slotKey)) === true);
      const fromClaude = items.some((item) => isClaudeLoggedMealEntry(item));
      const unreadClaude = fromClaude && items.some((item) => isUnreadClaudeLoggedMeal(item));
      const claudeMealId = resolveClaudeMealId(items[0]) || null;
      return {
        slotKey,
        mealType,
        label: mealLabelFromSlot(slotKey, mealType, items),
        timeLabel: typeof decimalToTimeStr === 'function' && Number.isFinite(mealTimeRaw)
          ? decimalToTimeStr(mealTimeRaw)
          : '',
        sortTime,
        pendingCount: 0,
        unsaved,
        fromClaude,
        unreadClaude,
        claudeMealId,
        kcal: Math.round(sumMacro(items, (item) => item.kcal ?? item.cal)),
        prot: Math.round(sumMacro(items, (item) => item.prot ?? item.pro)),
        carb: Math.round(sumMacro(items, (item) => item.carb ?? item.carbo ?? item.cho)),
        fat: Math.round(sumMacro(items, (item) => item.fatTotal ?? item.fat)),
        items,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortTime - b.sortTime || String(a.slotKey).localeCompare(String(b.slotKey)));
}

function DailyMealsList({
  groupedFoods = null,
  decimalToTimeStr = null,
  onEditMeal = null,
  onDeleteMeal = null,
  unsavedEntryIds = null,
  onOpenClaudeMeal = null,
}) {
  const meals = useMemo(
    () => buildDailyMeals(groupedFoods, decimalToTimeStr, unsavedEntryIds),
    [groupedFoods, decimalToTimeStr, unsavedEntryIds],
  );

  const openMeal = (meal) => {
    if (meal?.fromClaude && meal?.claudeMealId) {
      onOpenClaudeMeal?.(meal.claudeMealId);
    }
    onEditMeal?.(meal);
  };

  return (
    <section className="flex w-full flex-col gap-2" aria-label="Pasti di oggi">
      <h2 className="px-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Pasti di oggi
      </h2>
      {meals.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900/55 px-3 py-3 text-sm text-slate-400">
          Nessun pasto registrato
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {meals.map((meal) => (
            <li
              key={meal.slotKey}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2.5"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => openMeal(meal)}
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  {meal.unreadClaude ? (
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                      aria-label="Nuovo da Claude"
                      title="Nuovo"
                    />
                  ) : null}
                  <h3 className="m-0 truncate text-sm font-semibold text-slate-50">
                    {meal.label}
                  </h3>
                  {meal.fromClaude ? (
                    <span className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[0.62rem] font-semibold tracking-wide text-violet-200">
                      da Claude
                    </span>
                  ) : null}
                  <span className={`shrink-0 text-xs tabular-nums ${meal.unsaved ? 'font-semibold text-amber-300' : 'text-slate-400'}`}>
                    {meal.unsaved
                      ? 'Non salvato'
                      : (meal.pendingCount > 0 ? 'Da calcolare' : (meal.timeLabel || 'Registrato'))}
                  </span>
                </div>
                <p className="m-0 mt-0.5 truncate text-xs tabular-nums text-slate-300">
                  {`${meal.kcal} kcal · P ${meal.prot}g · C ${meal.carb}g · G ${meal.fat}g`}
                </p>
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cyan-200 transition hover:bg-cyan-400/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                aria-label={`Modifica ${meal.label}`}
                title={`Modifica ${meal.label}`}
                onClick={() => openMeal(meal)}
              >
                <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rose-300 transition hover:bg-rose-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                aria-label={`Elimina ${meal.label}`}
                title={`Elimina ${meal.label}`}
                onClick={() => onDeleteMeal?.(meal)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default memo(DailyMealsList);
