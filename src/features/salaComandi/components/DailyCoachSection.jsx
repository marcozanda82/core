import DailyCoachCard from '@/features/salaComandi/components/DailyCoachCard';
import { useSleepCoach } from '@/features/salaComandi/hooks/useSleepCoach';
import useMetabolicCoach from '@/features/salaComandi/hooks/useMetabolicCoach';
import { useDailyCoach } from '@/features/salaComandi/hooks/useDailyCoach';

/**
 * @param {{
 *   activeLog?: unknown[] | null,
 *   totali?: object | null,
 *   dynamicDailyKcal?: number | null,
 *   userProfile?: unknown,
 *   metabolicMapData?: object | null,
 *   userTargets?: object | null,
 *   metabolicCompassTimeframe?: string,
 *   metabolicCompassDailyHistory?: unknown[],
 *   energyAt20Percent?: number | null,
 *   kentuDailyCalorieStrategy?: string | null,
 *   aiDayCoach?: object | null,
 * }} props
 */
export default function DailyCoachSection({
  activeLog,
  totali,
  dynamicDailyKcal,
  userProfile,
  metabolicMapData,
  userTargets,
  metabolicCompassTimeframe,
  metabolicCompassDailyHistory,
  energyAt20Percent,
  kentuDailyCalorieStrategy,
  aiDayCoach,
}) {
  const sleepCoach = useSleepCoach({
    activeLog,
    totali,
    dynamicDailyKcal,
    userProfile,
  });

  const metabolicCoach = useMetabolicCoach({
    mapData: metabolicMapData,
    userTargets,
    selectedTimeframe: metabolicCompassTimeframe,
    dailyHistory: metabolicCompassDailyHistory,
  });

  const dailyCoach = useDailyCoach({
    sleepCoach,
    metabolicCoach,
    totali,
    energyAt20Percent,
    kentuDailyCalorieStrategy,
    aiDayCoach,
  });

  return <DailyCoachCard data={dailyCoach} />;
}
