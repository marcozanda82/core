import { memo, useMemo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { isUnresolvedMealDraftItem } from '../../utils/mealDraftStatus';

const MEAL_LABELS = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Spuntino',
  spuntino: 'Spuntino',
  merenda: 'Spuntino',
};

function mealLabelFromSlot(slotKey, mealType) {
  const base = String(mealType || slotKey || 'pasto').split('_')[0].trim().toLowerCase();
  if (MEAL_LABELS[base]) return MEAL_LABELS[base];
  if (!base) return 'Pasto';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function sumMacro(items, pick) {
  return items.reduce((sum, item) => sum + (Number(pick(item)) || 0), 0);
}

function buildDailyMeals(groupedFoods, decimalToTimeStr) {
  return Object.keys(groupedFoods || {})
    .map((slotKey) => {
      const items = (groupedFoods[slotKey] || []).filter(
        (item) => item && item.type !== 'stimulant',
      );
      if (items.length === 0) return null;
      const mealType = items[0]?.mealType || slotKey.split('_')[0];
      const mealTimeRaw = Number(items[0]?.mealTime ?? items[0]?.time);
      const sortTime = Number.isFinite(mealTimeRaw) ? mealTimeRaw : 12;
      const pendingCount = items.filter(isUnresolvedMealDraftItem).length;
      const resolved = items.filter((item) => !isUnresolvedMealDraftItem(item));
      return {
        slotKey,
        mealType,
        label: mealLabelFromSlot(slotKey, mealType),
        timeLabel: typeof decimalToTimeStr === 'function' && Number.isFinite(mealTimeRaw)
          ? decimalToTimeStr(mealTimeRaw)
          : '',
        sortTime,
        pendingCount,
        kcal: Math.round(sumMacro(resolved, (item) => item.kcal ?? item.cal)),
        prot: Math.round(sumMacro(resolved, (item) => item.prot ?? item.pro)),
        carb: Math.round(sumMacro(resolved, (item) => item.carb ?? item.carbo ?? item.cho)),
        fat: Math.round(sumMacro(resolved, (item) => item.fatTotal ?? item.fat)),
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
}) {
  const meals = useMemo(
    () => buildDailyMeals(groupedFoods, decimalToTimeStr),
    [groupedFoods, decimalToTimeStr],
  );

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
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h3 className="m-0 truncate text-sm font-semibold text-slate-50">
                    {meal.label}
                  </h3>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                    {meal.pendingCount > 0 ? 'Da calcolare' : (meal.timeLabel || 'Registrato')}
                  </span>
                </div>
                <p className="m-0 mt-0.5 truncate text-xs tabular-nums text-slate-300">
                  {`${meal.kcal} kcal · P ${meal.prot}g · C ${meal.carb}g · G ${meal.fat}g`}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cyan-200 transition hover:bg-cyan-400/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                aria-label={`Modifica ${meal.label}`}
                title={`Modifica ${meal.label}`}
                onClick={() => onEditMeal?.(meal)}
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
