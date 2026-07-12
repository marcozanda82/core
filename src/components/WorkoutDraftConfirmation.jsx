import React from 'react';
import { KentuButton } from './kentuos/KentuOSUI';
import { expandWorkoutPayloadExercises } from '../features/commandTerminal/conversation/conversationState.js';

function normalizeTimeValue(exactTime, timeString) {
  const raw = String(exactTime || timeString || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '12:00';
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

/**
 * Bozza interattiva in chat: orario, nome, durata, kcal, esercizi, conferma o annulla.
 * Pattern visivo allineato a MealDraftConfirmation (McDrive inline).
 */
export default function WorkoutDraftConfirmation({
  workoutDraft,
  draftId,
  onConfirm,
  onCancel,
  onRemoveExercise,
  onUpdateWorkoutMeta,
  onUpdateExercise,
}) {
  const payload = workoutDraft?.payload || {};
  const exercises = expandWorkoutPayloadExercises(payload);
  const workoutName = String(payload.workoutName || '').trim() || 'Allenamento';
  const durationMinutes = Math.max(1, Math.round(Number(payload.durationMinutes) || 45));
  const timeValue = normalizeTimeValue(payload.exactTime, payload.timeString);
  const estimatedKcal = Number(payload.estimatedKcal ?? payload.kcal);
  const kcalValue = Number.isFinite(estimatedKcal) && estimatedKcal > 0
    ? Math.round(estimatedKcal)
    : '';

  if (!workoutName && !exercises.length) return null;

  const handleExerciseField = (index, field, value) => {
    onUpdateExercise?.(draftId, index, { [field]: value });
  };

  return (
    <div className="kentu-meal-draft kentu-workout-draft">
      <div className="kentu-meal-draft__header">
        <span className="kentu-meal-draft__badge">Bozza</span>
        <div className="kentu-meal-draft__meta">
          <label className="kentu-meal-draft__meta-field">
            <span className="kentu-meal-draft__meta-label">Orario</span>
            <input
              type="time"
              className="kentu-meal-draft__time-input"
              value={timeValue}
              onChange={(e) => onUpdateWorkoutMeta?.(draftId, { exactTime: e.target.value })}
              aria-label="Orario allenamento"
            />
          </label>
          <label className="kentu-meal-draft__meta-field">
            <span className="kentu-meal-draft__meta-label">Nome</span>
            <input
              type="text"
              className="kentu-meal-draft__select"
              value={workoutName}
              onChange={(e) => onUpdateWorkoutMeta?.(draftId, { workoutName: e.target.value })}
              aria-label="Nome allenamento"
            />
          </label>
          <label className="kentu-meal-draft__meta-field">
            <span className="kentu-meal-draft__meta-label">Durata</span>
            <div className="kentu-meal-draft__edit-inline">
              <input
                type="number"
                min={1}
                step={1}
                className="kentu-meal-draft__grams-input"
                value={durationMinutes}
                onChange={(e) => onUpdateWorkoutMeta?.(draftId, { durationMinutes: e.target.value })}
                aria-label="Durata allenamento in minuti"
              />
              <span className="kentu-meal-draft__grams-suffix">min</span>
            </div>
          </label>
          <label className="kentu-meal-draft__meta-field">
            <span className="kentu-meal-draft__meta-label">Kcal</span>
            <input
              type="number"
              min={0}
              step={1}
              className="kentu-meal-draft__grams-input"
              value={kcalValue}
              onChange={(e) => onUpdateWorkoutMeta?.(draftId, { estimatedKcal: e.target.value })}
              aria-label="Calorie stimate allenamento"
            />
          </label>
        </div>
      </div>

      {exercises.length > 0 ? (
        <ul className="kentu-meal-draft__list">
          {exercises.map((exercise, index) => {
            const name = String(exercise.exerciseName || '').trim() || 'Esercizio';
            const sets = exercise.sets ?? '';
            const reps = exercise.reps ?? '';
            const weightKg = exercise.weightKg ?? '';

            return (
              <li key={`${draftId}_${index}_${name}`} className="kentu-meal-draft__row">
                <div className="kentu-meal-draft__row-main">
                  <label className="kentu-meal-draft__food-field">
                    <span className="kentu-meal-draft__meta-label">Esercizio</span>
                    <input
                      type="text"
                      className="kentu-meal-draft__select kentu-meal-draft__food-select"
                      value={name}
                      onChange={(e) => handleExerciseField(index, 'exerciseName', e.target.value)}
                      aria-label={`Nome esercizio ${index + 1}`}
                    />
                  </label>
                  <label className="kentu-meal-draft__meta-field" style={{ minWidth: 72 }}>
                    <span className="kentu-meal-draft__meta-label">Serie</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="kentu-meal-draft__grams-input"
                      value={sets}
                      onChange={(e) => handleExerciseField(index, 'sets', e.target.value)}
                      aria-label={`Serie ${name}`}
                    />
                  </label>
                  <label className="kentu-meal-draft__meta-field" style={{ minWidth: 72 }}>
                    <span className="kentu-meal-draft__meta-label">Reps</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="kentu-meal-draft__grams-input"
                      value={reps}
                      onChange={(e) => handleExerciseField(index, 'reps', e.target.value)}
                      aria-label={`Ripetizioni ${name}`}
                    />
                  </label>
                  <label className="kentu-meal-draft__meta-field" style={{ minWidth: 72 }}>
                    <span className="kentu-meal-draft__meta-label">Kg</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="kentu-meal-draft__grams-input"
                      value={weightKg}
                      onChange={(e) => handleExerciseField(index, 'weightKg', e.target.value)}
                      aria-label={`Carico ${name}`}
                    />
                  </label>
                </div>
                <div className="kentu-meal-draft__actions">
                  <button
                    type="button"
                    className="kentu-meal-draft__icon-btn kentu-meal-draft__icon-btn--danger"
                    onClick={() => onRemoveExercise?.(draftId, index)}
                    aria-label={`Rimuovi ${name}`}
                    title="Rimuovi"
                  >
                    🗑
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="kentu-meal-draft__footer">
        <KentuButton
          variant="primary"
          className="kentu-meal-draft__confirm"
          onClick={() => onConfirm?.(draftId)}
        >
          Conferma inserimento
        </KentuButton>
        <KentuButton
          variant="secondary"
          className="kentu-meal-draft__cancel"
          onClick={() => onCancel?.(draftId)}
        >
          Annulla
        </KentuButton>
      </div>
    </div>
  );
}
