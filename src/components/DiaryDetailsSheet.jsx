import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getWorkoutActivityLogDescription } from '../activityCatalog';
import { MEAL_LABELS_SAVE, toCanonicalMealType } from '../coreEngine';
import { KENTU_PILLARS, PILLAR_IDS, pillarColorToRgba } from '../features/metabolic/pillarsMapper';
import { TRAINING_GOALS, WorkoutQuestionnaireForm } from '../features/metabolic/WorkoutQuestionnaireForm';
import {
  computeBedtimeFromWakeAndDuration,
  formatSleepDurationParts,
} from '../utils/salaComandiUtils';

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

function formatTimeLabel(decimalHour, decimalToTimeStr) {
  if (typeof decimalToTimeStr === 'function') {
    const label = decimalToTimeStr(Number(decimalHour));
    if (label) return label;
  }
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatWorkoutMeta(workout) {
  const parts = [];
  const durH = Number(workout.duration);
  if (Number.isFinite(durH) && durH > 0) {
    parts.push(`${Math.round(durH * 60)} min`);
  }
  const goal = String(workout.trainingGoal || workout.workoutGoal || '').trim();
  if (goal) {
    const found = TRAINING_GOALS.find((g) => g.id === goal);
    parts.push(found?.label || goal);
  }
  const rpe = Number(workout.rpe);
  if (Number.isFinite(rpe) && rpe >= 1) parts.push(`RPE ${Math.round(rpe)}`);
  const muscles = Array.isArray(workout.muscles)
    ? workout.muscles
    : Array.isArray(workout.workoutMuscles)
      ? workout.workoutMuscles
      : [];
  if (muscles.length > 0) parts.push(muscles.join(' · '));
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

function decimalToTimeInputValue(decimalHour, fallback = '07:00') {
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return fallback;
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function parseTimeInputToDecimal(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  return Number(match[1]) + Number(match[2]) / 60;
}

function formatSleepDuration(entry) {
  const dm = Number(entry?.durationMinutes);
  if (Number.isFinite(dm) && dm > 0) return `${Math.floor(dm / 60)}h ${dm % 60}m`;
  const hours = Number(entry?.hours ?? entry?.duration ?? entry?.sleepHours);
  if (!Number.isFinite(hours) || hours <= 0) return '—';
  return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
}

function SleepTabPanel({
  sleepEntry,
  decimalToTimeStr,
  onSaveSleep,
}) {
  const hasSleep = Boolean(sleepEntry);

  const [wakeStr, setWakeStr] = useState('07:00');
  const [durationHours, setDurationHours] = useState(7);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [quality, setQuality] = useState(3);
  const [editing, setEditing] = useState(!hasSleep);

  useEffect(() => {
    if (!sleepEntry) {
      setWakeStr('07:00');
      setDurationHours(7);
      setDurationMinutes(30);
      setQuality(3);
      setEditing(true);
      return;
    }
    setWakeStr(decimalToTimeInputValue(sleepEntry.wakeTime ?? sleepEntry.sleepEnd, '07:00'));
    const dm = Number(sleepEntry.durationMinutes);
    const hoursDec = Number(sleepEntry.hours ?? sleepEntry.duration ?? sleepEntry.sleepHours);
    if (Number.isFinite(dm) && dm > 0) {
      setDurationHours(Math.floor(dm / 60));
      setDurationMinutes(dm % 60);
    } else if (Number.isFinite(hoursDec) && hoursDec > 0) {
      setDurationHours(Math.floor(hoursDec));
      setDurationMinutes(Math.round((hoursDec % 1) * 60));
    }
    const q = Number(sleepEntry.quality);
    setQuality(Number.isFinite(q) && q >= 1 && q <= 5 ? Math.round(q) : 3);
    setEditing(false);
  }, [sleepEntry]);

  const durationLabel = formatSleepDurationParts(durationHours, durationMinutes);

  const handleSave = () => {
    const wakeDec = parseTimeInputToDecimal(wakeStr);
    const duration = (Number(durationHours) || 0) + (Number(durationMinutes) || 0) / 60;
    if (!(duration > 0) || !Number.isFinite(wakeDec)) {
      window.alert('Controlla risveglio e durata.');
      return;
    }
    const bedDec = computeBedtimeFromWakeAndDuration(wakeDec, duration);
    onSaveSleep?.({
      editingId: sleepEntry?.id != null ? String(sleepEntry.id) : null,
      wakeTime: wakeDec,
      bedtime: bedDec,
      hours: Math.round(duration * 100) / 100,
      durationMinutes: Math.round(duration * 60),
      quality: Math.max(1, Math.min(5, Math.round(Number(quality) || 3))),
    });
    setEditing(false);
  };

  if (hasSleep && !editing) {
    const wake = formatTimeLabel(sleepEntry.wakeTime ?? sleepEntry.sleepEnd, decimalToTimeStr);
    const q = Number(sleepEntry.quality);
    const stars = Number.isFinite(q) && q >= 1 && q <= 5
      ? `${'★'.repeat(Math.round(q))}${'☆'.repeat(5 - Math.round(q))}`
      : '—';
    return (
      <div className="diary-pillar-panel">
        <div className="diary-pillar-card" style={{ borderColor: pillarColorToRgba(KENTU_PILLARS.SLEEP.color, 0.4) }}>
          <h3 style={{ color: KENTU_PILLARS.SLEEP.color }}>Sonno di oggi</h3>
          <p>Sveglia <strong>{wake}</strong></p>
          <p>Durata <strong>{formatSleepDuration(sleepEntry)}</strong></p>
          <p>Qualità <strong>{stars}</strong></p>
          <button type="button" className="diary-pillar-card__btn" onClick={() => setEditing(true)}>
            Modifica
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="diary-pillar-panel">
      <div className="diary-pillar-card" style={{ borderColor: pillarColorToRgba(KENTU_PILLARS.SLEEP.color, 0.4) }}>
        <h3 style={{ color: KENTU_PILLARS.SLEEP.color }}>
          {hasSleep ? 'Modifica sonno' : 'Registra sonno di oggi'}
        </h3>
        <label className="diary-pillar-field">
          <span>Ora risveglio</span>
          <input type="time" value={wakeStr} onChange={(e) => setWakeStr(e.target.value)} />
        </label>
        <div className="diary-pillar-field-row">
          <label className="diary-pillar-field">
            <span>Ore</span>
            <input type="number" min={0} max={24} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
          </label>
          <label className="diary-pillar-field">
            <span>Minuti</span>
            <input type="number" min={0} max={59} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
          </label>
        </div>
        <p className="diary-pillar-hint">Durata: {durationLabel}</p>
        <span className="diary-pillar-field__label">Qualità</span>
        <div className="diary-pillar-stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={Number(quality) >= star ? 'is-active' : ''}
              onClick={() => setQuality(star)}
            >
              ★
            </button>
          ))}
        </div>
        <div className="diary-pillar-actions">
          {hasSleep ? (
            <button type="button" className="diary-pillar-card__btn diary-pillar-card__btn--ghost" onClick={() => setEditing(false)}>
              Annulla
            </button>
          ) : null}
          <button type="button" className="diary-pillar-card__btn" onClick={handleSave}>
            Salva sonno
          </button>
        </div>
      </div>
    </div>
  );
}

function FastingTabPanel({ fastingData, currentHour, decimalToTimeStr }) {
  const hoursFasted = Math.max(0, Number(fastingData?.hoursFasted) || 0);
  const phaseName = String(fastingData?.phaseName || '').trim();
  const durationLabel = fastingData?.timeString
    || `${Math.floor(hoursFasted)}h ${Math.round((hoursFasted % 1) * 60)}m`;
  const lastMealHour = Number.isFinite(Number(currentHour))
    ? Number(currentHour) - hoursFasted
    : NaN;
  const startedLabel = Number.isFinite(lastMealHour)
    ? formatTimeLabel(((lastMealHour % 24) + 24) % 24, decimalToTimeStr)
    : null;

  return (
    <div className="diary-pillar-panel">
      <div className="diary-pillar-card" style={{ borderColor: pillarColorToRgba(KENTU_PILLARS.FASTING.color, 0.4) }}>
        <h3 style={{ color: KENTU_PILLARS.FASTING.color }}>Digiuno odierno</h3>
        {hoursFasted < 0.25 ? (
          <p className="diary-pillar-hint">Nessuna finestra di digiuno rilevante al momento (pasto recente o dati mancanti).</p>
        ) : (
          <>
            {startedLabel ? <p>Iniziato alle <strong>{startedLabel}</strong></p> : null}
            <p>Durata attuale <strong>{durationLabel}</strong></p>
            {phaseName ? <p>Fase metabolica <strong>{phaseName}</strong></p> : null}
            {fastingData?.phaseDesc ? (
              <p className="diary-pillar-hint">{fastingData.phaseDesc}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Bottom sheet — diario giornaliero unificato a 4 pilastri.
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
  fastingData = null,
  currentHour = 12,
  onEditMeal,
  onEditWorkout,
  onDeleteItem,
  onInspectFood,
  onUpdateWorkoutQuestionnaire,
  onSaveSleep,
}) {
  const [activePillarTab, setActivePillarTab] = useState('NUTRITION');

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setActivePillarTab('NUTRITION');
  }, [isOpen]);

  const mealSections = useMemo(
    () => buildMealSections(groupedFoods, decimalToTimeStr),
    [groupedFoods, decimalToTimeStr],
  );

  const workoutEntries = useMemo(
    () => buildWorkoutEntries(workoutsLog, decimalToTimeStr),
    [workoutsLog, decimalToTimeStr],
  );

  const todaySleepEntry = useMemo(
    () => (activeLog || []).find((e) => String(e?.type).toLowerCase() === 'sleep') || null,
    [activeLog],
  );

  const workoutBurnTotal = useMemo(
    () => workoutEntries.reduce((sum, entry) => sum + entry.burnedKcal, 0),
    [workoutEntries],
  );

  const lastScrollItemKey = useMemo(() => {
    if (activePillarTab === 'TRAINING' && workoutEntries.length > 0) {
      const lastWorkout = workoutEntries[workoutEntries.length - 1]?.workout;
      return lastWorkout?.id != null
        ? `workout-${String(lastWorkout.id)}`
        : `workout-${workoutEntries.length - 1}`;
    }
    if (activePillarTab === 'NUTRITION' && mealSections.length > 0) {
      const lastSection = mealSections[mealSections.length - 1];
      const lastFood = lastSection?.items?.[lastSection.items.length - 1];
      if (!lastFood) return null;
      return lastFood.id != null
        ? `food-${String(lastFood.id)}`
        : `food-${lastSection.slotKey}-${lastSection.items.length - 1}`;
    }
    return null;
  }, [activePillarTab, mealSections, workoutEntries]);

  if (!isOpen) return null;

  const consumedKcal = Math.round(Number(totali?.kcal) || 0);
  const targetKcal = Math.round(Number(dynamicDailyKcal) || 0);
  const hasMeals = mealSections.length > 0;
  const hasWorkouts = workoutEntries.length > 0;

  const resolveFoodRowKey = (food, section) => (
    food.id != null
      ? `food-${String(food.id)}`
      : `food-${section.slotKey}-${section.items.indexOf(food)}`
  );

  const resolveWorkoutRowKey = (workout, index) => (
    workout.id != null ? `workout-${String(workout.id)}` : `workout-${index}`
  );

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

          <div className="diary-pillar-tabs" role="tablist" aria-label="Pilastri diario">
            {PILLAR_IDS.map((pillarId) => {
              const meta = KENTU_PILLARS[pillarId];
              const active = activePillarTab === pillarId;
              return (
                <button
                  key={pillarId}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`diary-pillar-tab${active ? ' is-active' : ''}`}
                  style={{
                    color: meta.color,
                    borderBottomColor: active ? meta.color : 'transparent',
                    background: active ? pillarColorToRgba(meta.color, 0.14) : 'transparent',
                    opacity: active ? 1 : 0.5,
                  }}
                  onClick={() => setActivePillarTab(pillarId)}
                  title={meta.label}
                >
                  <span className="diary-pillar-tab__icon" aria-hidden>{meta.icon}</span>
                  <span className="diary-pillar-tab__label">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </header>

        <div className="diary-details-scroll">
          {activePillarTab === 'NUTRITION' ? (
            <>
              {!hasMeals ? (
                <p className="diary-details-empty">Nessun pasto registrato oggi.</p>
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
                          const rowKey = resolveFoodRowKey(food, section);
                          const menuOpensUp = rowKey === lastScrollItemKey
                            || food === section.items[section.items.length - 1];
                          return (
                            <li
                              key={foodId}
                              className={`diary-details-food-row${menuOpensUp ? ' diary-details-food-row--menu-up' : ''}`}
                            >
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
            </>
          ) : null}

          {activePillarTab === 'TRAINING' ? (
            <>
              {!hasWorkouts ? (
                <p className="diary-details-empty">Nessun allenamento registrato oggi.</p>
              ) : (
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
                    {workoutEntries.map(({ workout, name, meta, timeLabel, burnedKcal }, index) => {
                      const workoutId = workout.id != null ? String(workout.id) : name;
                      const rowKey = resolveWorkoutRowKey(workout, index);
                      const menuOpensUp = rowKey === lastScrollItemKey
                        || index === workoutEntries.length - 1;
                      return (
                        <li
                          key={workoutId}
                          className={`diary-details-food-row diary-details-food-row--workout${menuOpensUp ? ' diary-details-food-row--menu-up' : ''}`}
                        >
                          <div className="diary-details-food-row__stack">
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

                            <WorkoutQuestionnaireForm
                              workout={workout}
                              onSave={onUpdateWorkoutQuestionnaire}
                            />
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
              )}
            </>
          ) : null}

          {activePillarTab === 'SLEEP' ? (
            <SleepTabPanel
              sleepEntry={todaySleepEntry}
              decimalToTimeStr={decimalToTimeStr}
              onSaveSleep={onSaveSleep}
            />
          ) : null}

          {activePillarTab === 'FASTING' ? (
            <FastingTabPanel
              fastingData={fastingData}
              currentHour={currentHour}
              decimalToTimeStr={decimalToTimeStr}
            />
          ) : null}

          <div className="diary-details-scroll__spacer" aria-hidden />
        </div>
      </div>
    </div>,
    document.body,
  );
}
