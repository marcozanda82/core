import { useMemo } from 'react';
import { useBiochimico, computeTotali } from '../useBiochimico';
import { calculateMetabolicVariance } from '../metabolicEngine';

export default function useMetabolicData({
  activeLog,
  dailyLog,
  baseKcal,
  userTargets,
  kentuDailyCalorieStrategy,
  applyCalorieStrategyToProfileKcal,
  bodyMetricsHistory,
  fullHistory,
}) {
  const { totali, obiettiviPasti } = useBiochimico(activeLog, baseKcal);

  const targetKcal = useMemo(() => baseKcal + (totali?.workout ?? 0), [baseKcal, totali]);

  const macroDailyReals = useMemo(() => {
    const t = computeTotali(dailyLog ?? []);
    return t && typeof t === 'object'
      ? t
      : { kcal: 0, prot: 0, carb: 0, fat: 0, fatTotal: 0, fibre: 0, workout: 0 };
  }, [dailyLog]);

  const burnedKcal = useMemo(
    () => (activeLog || []).filter((item) => item.type === 'workout').reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0),
    [activeLog],
  );

  const dynamicDailyKcal = useMemo(
    () => applyCalorieStrategyToProfileKcal(userTargets?.kcal ?? 2000, kentuDailyCalorieStrategy) + burnedKcal,
    [applyCalorieStrategyToProfileKcal, userTargets?.kcal, kentuDailyCalorieStrategy, burnedKcal],
  );

  const metabolicVarianceForAi = useMemo(() => {
    const currentTdeeForAi =
      userTargets?.kcal != null &&
      Number.isFinite(Number(userTargets.kcal)) &&
      Number(userTargets.kcal) > 0
        ? Number(userTargets.kcal)
        : null;
    return calculateMetabolicVariance(bodyMetricsHistory, fullHistory, currentTdeeForAi);
  }, [bodyMetricsHistory, fullHistory, userTargets?.kcal]);

  return {
    totali,
    obiettiviPasti,
    targetKcal,
    macroDailyReals,
    burnedKcal,
    dynamicDailyKcal,
    metabolicVarianceForAi,
  };
}
