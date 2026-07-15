import { useEffect, useState } from 'react';

export const TRAINING_GOALS = [
  { id: 'ipertrofia', label: 'Ipertrofia' },
  { id: 'forza', label: 'Forza' },
  { id: 'resistenza', label: 'Resistenza' },
  { id: 'mantenimento', label: 'Mantenimento' },
  { id: 'junk', label: 'Junk Workout' },
];

/**
 * Questionario strutturato allenamento (Obiettivo / RPE / Note).
 * @param {{
 *   workout: Record<string, unknown>,
 *   onSave?: (workoutId: string, patch: Record<string, unknown>) => void,
 * }} props
 */
export function WorkoutQuestionnaireForm({ workout, onSave }) {
  const workoutId = workout?.id != null ? String(workout.id) : '';
  const [goal, setGoal] = useState(() => String(workout?.trainingGoal || workout?.workoutGoal || '').trim());
  const [rpe, setRpe] = useState(() => {
    const n = Number(workout?.rpe);
    return Number.isFinite(n) && n >= 1 && n <= 10 ? Math.round(n) : 5;
  });
  const [notes, setNotes] = useState(() => (
    String(workout?.progressionNote ?? workout?.note ?? '').trim()
  ));

  useEffect(() => {
    setGoal(String(workout?.trainingGoal || workout?.workoutGoal || '').trim());
    const n = Number(workout?.rpe);
    setRpe(Number.isFinite(n) && n >= 1 && n <= 10 ? Math.round(n) : 5);
    setNotes(String(workout?.progressionNote ?? workout?.note ?? '').trim());
  }, [workout?.id, workout?.trainingGoal, workout?.workoutGoal, workout?.rpe, workout?.progressionNote, workout?.note]);

  if (!workoutId) return null;

  const commit = (nextGoal = goal, nextRpe = rpe, nextNotes = notes) => {
    const notesTrim = String(nextNotes || '').trim();
    const questionnaire = {
      goal: nextGoal || null,
      rpe: Math.max(1, Math.min(10, Math.round(Number(nextRpe) || 5))),
      notes: notesTrim,
    };
    onSave?.(workoutId, {
      trainingGoal: nextGoal || '',
      workoutGoal: nextGoal || '',
      rpe: questionnaire.rpe,
      progressionNote: notesTrim,
      note: notesTrim,
      details: notesTrim,
      questionnaire,
    });
  };

  return (
    <div className="diary-workout-questionnaire" onClick={(e) => e.stopPropagation()}>
      <p className="diary-workout-questionnaire__label">Obiettivo</p>
      <div className="diary-workout-questionnaire__pills">
        {TRAINING_GOALS.map((item) => {
          const active = goal === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`diary-workout-questionnaire__pill${active ? ' is-active' : ''}`}
              onClick={() => {
                setGoal(item.id);
                commit(item.id, rpe, notes);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <p className="diary-workout-questionnaire__label">RPE / Fatica percepita · {rpe}/10</p>
      <div className="diary-workout-questionnaire__rpe">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => {
          const active = rpe === value;
          return (
            <button
              key={value}
              type="button"
              className={`diary-workout-questionnaire__rpe-btn${active ? ' is-active' : ''}`}
              onClick={() => {
                setRpe(value);
                commit(goal, value, notes);
              }}
            >
              {value}
            </button>
          );
        })}
      </div>
      <p className="diary-workout-questionnaire__hint">1 passeggiata · 10 cedimento totale</p>

      <label className="diary-workout-questionnaire__notes">
        <span className="diary-workout-questionnaire__label">Note libere</span>
        <textarea
          className="diary-workout-progression__input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => commit(goal, rpe, notes)}
          placeholder='Es. "Panca 30kg × 8"'
          rows={2}
        />
      </label>
    </div>
  );
}
