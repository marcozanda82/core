import React from 'react';

import SleepCoachCard from '@/features/salaComandi/components/SleepCoachCard';
import { useSleepCoach } from '@/features/salaComandi/hooks/useSleepCoach';

const testLog = [
  {
    type: 'sleep',
    bedtime: 23.5,
    wakeTime: 5.5,
    hours: 6,
    quality: 'scarsa',
  },
  {
    type: 'food',
    name: 'caffè',
    time: 17.5,
  },
  {
    type: 'workout',
    time: 21,
    kcal: 400,
  },
];

export default function SleepCoachDebug() {
  const sleepCoach = useSleepCoach({
    activeLog: testLog,
    totali: { kcal: 2000 },
    dynamicDailyKcal: 2500,
    userProfile: {},
  });

  return (
    <div style={{ padding: 24 }}>
      <SleepCoachCard data={sleepCoach} />
      <pre style={{ marginTop: 24 }}>
        {JSON.stringify(sleepCoach, null, 2)}
      </pre>
    </div>
  );
}
