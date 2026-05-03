import React from 'react';

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
    <div
      style={{
        padding: 20,
        color: 'rgba(248,250,252,0.94)',
        background: '#0f1118',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.45,
        minHeight: '100%',
        boxSizing: 'border-box',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontFamily: 'system-ui, sans-serif' }}>
        Sleep Coach Debug
      </h2>
      <pre
        style={{
          margin: 0,
          padding: 12,
          overflow: 'auto',
          borderRadius: 8,
          background: '#151823',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {JSON.stringify(sleepCoach, null, 2)}
      </pre>
    </div>
  );
}
