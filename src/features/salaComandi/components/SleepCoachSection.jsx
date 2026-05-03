import React from 'react';

import { useSleepCoach } from '@/features/salaComandi/hooks/useSleepCoach';
import SleepCoachCard from '@/features/salaComandi/components/SleepCoachCard';

export default function SleepCoachSection({
  activeLog,
  totali,
  dynamicDailyKcal,
  userProfile,
}) {
  const sleepCoach = useSleepCoach({
    activeLog,
    totali,
    dynamicDailyKcal,
    userProfile,
  });

  return <SleepCoachCard data={sleepCoach} />;
}
