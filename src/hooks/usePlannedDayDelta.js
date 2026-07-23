/**
 * Piano giornaliero da `users/{uid}/current_wave.schedule[dateKey]`.
 */
import { useMemo } from 'react';
import useTrainingWave from './useTrainingWave';
import { waveDayToDayBlock } from '../features/training/waveSchema';

/**
 * @param {object} params
 * @param {import('firebase/database').Database | null | undefined} params.db
 * @param {{ uid?: string } | null | undefined} params.user
 * @param {string | null | undefined} params.dateKey — ISO YYYY-MM-DD
 * @param {number} [params.profileKcal]
 * @param {boolean} [params.isSimulationMode]
 */
export default function usePlannedDayDelta({
  db = null,
  user = null,
  dateKey = null,
  profileKcal = 2000,
}) {
  const userUid = user?.uid || null;
  const refIso = String(dateKey || '').trim().slice(0, 10) || undefined;

  const { wave, todayProfile, isBeforeStart, isLoading } = useTrainingWave({
    db,
    userUid,
    referenceDate: refIso,
  });

  const normalizedProfileKcal = (() => {
    const n = Math.round(Number(profileKcal));
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  return useMemo(() => {
    const entry =
      (refIso && wave?.schedule?.[refIso])
      || (!isBeforeStart && todayProfile?.activityId ? todayProfile : null);

    const todayPlanBlock =
      entry && refIso ? waveDayToDayBlock(entry, refIso) : null;

    const burn = Number(todayPlanBlock?.activity?.estimatedBurnKcal) || 0;

    return {
      plannedDelta: 0,
      hasPlannedBlock: Boolean(todayPlanBlock),
      plannedTargetKcal: normalizedProfileKcal,
      todayPlanBlock,
      dayPlanBlock: todayPlanBlock,
      mesocycleSettings: {
        startDate: wave?.startDate || null,
        loadWeeks: 0,
        deloadWeeks: 0,
      },
      plannedBurnKcal: burn,
      isLoading: Boolean(isLoading),
    };
  }, [
    wave,
    todayProfile,
    isBeforeStart,
    isLoading,
    refIso,
    normalizedProfileKcal,
  ]);
}
