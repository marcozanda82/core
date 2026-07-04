import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getWorkoutActivityLogDescription } from '../activityCatalog';
import { MEAL_LABELS_SAVE, toCanonicalMealType } from '../coreEngine';

function formatGrams(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return Number.isInteger(n) ? `${n}g` : `${n.toFixed(0)}g`;
}

function formatKcal(value) {
  return `${Math.round(Number(value) || 0)} kcal`;
}

function formatBurnedKcal(value) {
  const n = Math.round(Number(value) || 0);
  return n > 0 ? `−${n} kcal` : '0 kcal';
}

function formatWorkoutMeta(workout) {
  const parts = [];
  const durH = Number(workout.duration);
  if (Number.isFinite(durH) && durH > 0) {
    parts.push(`${Math.round(durH * 60)} min`);
  }
  const detail = String(workout.workoutDetailNote || '').trim();
  if (detail) parts.push(detail);
  const muscles = Array.isArray(workout.muscles)
    ? workout.muscles
    : Array.isArray(workout.workoutMuscles)
      ? workout.workoutMuscles
      : [];
  if (muscles.length > 0 && !detail) {
    parts.push(muscles.join(' · '));
  }
  return parts.join(' · ') || '—';
}

function resolveWorkoutName(workout) {
  const desc = String(workout.desc || workout.name || '').trim();
  if (desc) return desc;
  const muscles = Array.isArray(workout.muscles)
    ? workout.muscles
    : Array.isArray(workout.workoutMuscles)
      ? workout.workoutMuscles
      : [];
  return getWorkoutActivityLogDescription(workout.subType || 'pesi', muscles);
}

function buildMealSections(groupedFoods, decimalToTimeStr) {
  return Object.keys(groupedFoods || {})
    .map((slotKey) => {
      const items = groupedFoods[slotKey] || [];
      if (items.length === 0) return null;
      const mealType = items[0]?.mealType || slotKey.split('_')[0];
      const baseType = String(mealType).split('_')[0];
      const suffix = String(mealType).includes('_') ? ` ${String(mealType).split('_')[1]}` : '';
      const mealTime = items[0]?.mealTime ?? 12;
      const label = `${MEAL_LABELS_SAVE[toCanonicalMealType(baseType)] || baseType}${suffix}`;
      const timeLabel = typeof decimalToTimeStr === 'function' ? decimalToTimeStr(mealTime) : '';
      const subtotalKcal = items.reduce((sum, f) => sum + (Number(f.kcal ?? f.cal) || 0), 0);
      const subtotalProt = items.reduce((sum, f) => sum + (Number(f.prot) || 0), 0);
      const subtotalCarb = items.reduce((sum, f) => sum + (Number(f.carb) || 0), 0);
      const subtotalFat = items.reduce(
        (sum, f) => sum + (Number(f.fatTotal ?? f.fat) || 0),
        0,
      );
      const sortTime = Number(mealTime) || 0;
      return {
        slotKey,
        label,
        timeLabel,
        subtotalKcal,
        subtotalProt,
        subtotalCarb,
        subtotalFat,
        items,
        sortTime,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortTime - b.sortTime);
}

function buildWorkoutEntries(workoutsLog, decimalToTimeStr) {
  return (workoutsLog || [])
    .map((workout) => {
      const sortTime = typeof workout.time === 'number' && !Number.isNaN(workout.time) ? workout.time : 12;
      const timeLabel = typeof decimalToTimeStr === 'function' ? decimalToTimeStr(sortTime) : '';
      return {
        workout,
        sortTime,
        timeLabel,
        name: resolveWorkoutName(workout),
        meta: formatWorkoutMeta(workout),
        burnedKcal: Number(workout.kcal ?? workout.cal) || 0,
      };
    })
    .sort((a, b) => a.sortTime - b.sortTime);
}

/**
 * Bottom sheet — diario giornaliero (pasto + output energetico).
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   activeLog?: Array<Record<string, unknown>>,
 *   groupedFoods?: Record<string, Array<Record<string, unknown>>>,
 *   workoutsLog?: Array<Record<string, unknown>>,
 *   totali?: { kcal?: number, prot?: number, carb?: number, fatTotal?: number },
 *   dynamicDailyKcal?: number,
 *   decimalToTimeStr?: (hour: number) => string,
 *   onEditMeal?: (slotKey: string) => void,
 *   onEditWorkout?: (workout: Record<string, unknown>) => void,
 *   onDeleteItem?: (id: string) => void,
 *   onInspectFood?: (food: Record<string, unknown>) => void,
 * }} props
 */
export default function DiaryDetailsSheet({
  isOpen,
  onClose,
  activeLog = [],
  groupedFoods = {},
  workoutsLog = [],
  totali = {},
  dynamicDailyKcal = 0,
  decimalToTimeStr,
  onEditMeal,
  onEditWorkout,
  onDeleteItem,
  onInspectFood,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    console.log('Props ricevute dal diario:', {
      activeLog,
      groupedFoods,
      workoutsLog,
      mealSlotCount: Object.keys(groupedFoods || {}).length,
      workoutCount: (workoutsLog || []).length,
    });
  }, [isOpen, activeLog, groupedFoods, workoutsLog]);

  const mealSections = useMemo(
    () => buildMealSections(groupedFoods, decimalToTimeStr),
    [groupedFoods, decimalToTimeStr],
  );

  const workoutEntries = useMemo(
    () => buildWorkoutEntries(workoutsLog, decimalToTimeStr),
    [workoutsLog, decimalToTimeStr],
  );

  const workoutBurnTotal = useMemo(
    () => workoutEntries.reduce((sum, entry) => sum + entry.burnedKcal, 0),
    [workoutEntries],
  );

  if (!isOpen) return null;

  const consumedKcal = Math.round(Number(totali?.kcal) || 0);
  const targetKcal = Math.round(Number(dynamicDailyKcal) || 0);
  const hasMeals = mealSections.length > 0;
  const hasWorkouts = workoutEntries.length > 0;
  const isEmpty = !hasMeals && !hasWorkouts;

  return createPortal(
    <div
      className="diary-details-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="diary-details-title"
        className="diary-details-panel vetrina-sheet-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="diary-details-panel__chrome">
          <div className="diary-details-panel__handle" aria-hidden />
          <button
            type="button"
            className="diary-details-panel__close"
            onClick={onClose}
            aria-label="Chiudi diario"
          >
            ✕
          </button>
        </div>

        <header className="diary-details-summary">
          <h2 id="diary-details-title" className="diary-details-summary__title">
            Diario Giornaliero
          </h2>
          <p className="diary-details-summary__kcal">
            {consumedKcal}
            {targetKcal > 0 ? ` / ${targetKcal}` : ''}
            <span className="diary-details-summary__unit"> kcal</span>
          </p>
          <div className="diary-details-summary__macros">
            <span>P {Math.round(Number(totali?.prot) || 0)}g</span>
            <span>C {Math.round(Number(totali?.carb) || 0)}g</span>
            <span>G {Math.round(Number(totali?.fatTotal) || 0)}g</span>
            {workoutBurnTotal > 0 ? (
              <span className="diary-details-summary__burn">−{workoutBurnTotal} kcal out</span>
            ) : null}
          </div>
        </header>

        <div className="diary-details-scroll">
          {isEmpty ? (
            <p className="diary-details-empty">Nessuna voce registrata oggi.</p>
          ) : null}

          {hasMeals
            ? mealSections.map((section) => (
                <section key={section.slotKey} className="diary-details-meal">
                  <header className="diary-details-meal__header">
                    <div className="diary-details-meal__title-wrap">
                      <h3 className="diary-details-meal__title">
                        {section.label}
                        {section.timeLabel ? (
                          <span className="diary-details-meal__time"> · {section.timeLabel}</span>
                        ) : null}
                      </h3>
                      <p className="diary-details-meal__subtotals">
                        {formatKcal(section.subtotalKcal)}
                        <span className="diary-details-meal__macro-mini">
                          {' '}
                          · P {Math.round(section.subtotalProt)}g · C {Math.round(section.subtotalCarb)}g · G {Math.round(section.subtotalFat)}g
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      className="diary-details-meal__edit"
                      onClick={() => onEditMeal?.(section.slotKey)}
                      aria-label={`Modifica ${section.label}`}
                    >
                      Modifica
                    </button>
                  </header>

                  <ul className="diary-details-food-list">
                    {section.items.map((food) => {
                      const foodId = food.id != null ? String(food.id) : `${section.slotKey}-${food.desc}`;
                      const name = food.desc || food.name || 'Alimento';
                      return (
                        <li key={foodId} className="diary-details-food-row">
                          <div className="diary-details-food-row__main">
                            <span className="diary-details-food-row__name" title={name}>
                              {name}
                            </span>
                            <span className="diary-details-food-row__qty">
                              {formatGrams(food.qta ?? food.weight)}
                            </span>
                            <span className="diary-details-food-row__kcal">
                              {formatKcal(food.kcal ?? food.cal)}
                            </span>
                          </div>

                          <details className="diary-details-food-menu">
                            <summary className="diary-details-food-menu__trigger" aria-label={`Azioni per ${name}`}>
                              ⋮
                            </summary>
                            <menu className="diary-details-food-menu__panel">
                              <li>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onInspectFood?.(food);
                                  }}
                                >
                                  Info macro
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  className="diary-details-food-menu__danger"
                                  onClick={() => {
                                    if (food.id != null) onDeleteItem?.(String(food.id));
                                  }}
                                >
                                  Elimina
                                </button>
                              </li>
                            </menu>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            : null}

          {hasWorkouts ? (
            <section className="diary-sheet-workout-group">
              <header className="diary-sheet-workout-group__header">
                <div className="diary-sheet-workout-group__title-wrap">
                  <h3 className="diary-sheet-workout-group__title">Output Energetico</h3>
                  <p className="diary-sheet-workout-group__subtotals">
                    {formatBurnedKcal(workoutBurnTotal)}
                    <span className="diary-sheet-workout-group__count">
                      {' '}
                      · {workoutEntries.length} {workoutEntries.length === 1 ? 'sessione' : 'sessioni'}
                    </span>
                  </p>
                </div>
              </header>

              <ul className="diary-details-food-list">
                {workoutEntries.map(({ workout, name, meta, timeLabel, burnedKcal }) => {
                  const workoutId = workout.id != null ? String(workout.id) : name;
                  return (
                    <li key={workoutId} className="diary-details-food-row diary-details-food-row--workout">
                      <div className="diary-details-food-row__main">
                        <span className="diary-details-food-row__name" title={name}>
                          {name}
                          {timeLabel ? (
                            <span className="diary-details-food-row__time-inline"> · {timeLabel}</span>
                          ) : null}
                        </span>
                        <span className="diary-details-food-row__qty diary-details-food-row__meta">
                          {meta}
                        </span>
                        <span className="diary-details-food-row__kcal diary-details-food-row__kcal--burn">
                          {formatBurnedKcal(burnedKcal)}
                        </span>
                      </div>

                      <details className="diary-details-food-menu">
                        <summary className="diary-details-food-menu__trigger" aria-label={`Azioni per ${name}`}>
                          ⋮
                        </summary>
                        <menu className="diary-details-food-menu__panel">
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                onEditWorkout?.(workout);
                              }}
                            >
                              Modifica
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              className="diary-details-food-menu__danger"
                              onClick={() => {
                                if (workout.id != null) onDeleteItem?.(String(workout.id));
                              }}
                            >
                              Elimina
                            </button>
                          </li>
                        </menu>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
