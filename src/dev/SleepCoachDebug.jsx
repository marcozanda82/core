import React from 'react';

import {
  analyzeSleepCoach,
  buildSleepCoachInputFromDailyLog,
} from '@/features/salaComandi/engines/sleepCoachEngine';

/** Mock giornaliero: `wakeHour` / `bedtimeApprox` sono i campi letti dal motore (equiv. a bedtime/wakeTime numerici dell’intent). */
const testLog = [
  {
    type: 'sleep',
    bedtimeApprox: 23.5,
    wakeHour: 5.5,
    hours: 6,
    quality: 'scarsa',
  },
  {
    type: 'food',
    name: 'caffè',
    desc: 'coffee',
    time: 17.5,
  },
  {
    type: 'workout',
    time: 21,
    kcal: 400,
    duration: 40,
    desc: 'HIIT',
  },
];

export default function SleepCoachDebug() {
  const result = analyzeSleepCoach(buildSleepCoachInputFromDailyLog(testLog));

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
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
