import { getWorkoutActivityTypeDef } from '../activityCatalog';

export function workoutActivityRequiresStrengthDetailNote(typeId) {
  if (typeId === 'pesi') return false;
  const def = getWorkoutActivityTypeDef(typeId);
  if (def?.category === 'strength') return true;
  const raw = String(typeId || '').toLowerCase();
  return raw.includes('strength') || raw.includes('bodybuilding');
}
