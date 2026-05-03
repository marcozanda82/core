/**
 * Smoke test manuale per sleepCoachEngine (senza UI / SalaComandi).
 *
 * Node non risolve `coreEngine.jsx`; esegui dalla root progetto:
 *
 * npx esbuild ./src/dev/testSleepCoach.js --bundle --platform=node --format=esm ^
 *   "--alias:@=./src" --loader:.jsx=jsx --outfile=./src/dev/.sleepCoachTestRun.mjs && node ./src/dev/.sleepCoachTestRun.mjs
 *
 * (su bash: continuare la riga con `\` al posto di `^`).
 * Aggiungi `.sleepCoachTestRun.mjs` a .gitignore se non vuoi committarlo.
 */

import {
  analyzeSleepCoach,
  buildSleepCoachInputFromDailyLog,
} from '@/features/salaComandi/engines/sleepCoachEngine';

/** Campi sonno compatibili col motore: wakeHour, bedtimeApprox, sleepStartHour, hours, quality… */
const testCases = [
  {
    name: 'caffeina + workout serale',
    log: [
      {
        type: 'sleep',
        bedtimeApprox: 23.5,
        wakeHour: 5.5,
        hours: 6,
        quality: 'scarsa',
      },
      {
        type: 'food',
        /** `desc` con "coffee": il regex caffeina sul label con accenti può non matchare `\b` in tutti i motori */
        desc: 'coffee',
        name: 'caffè',
        time: 17.5,
      },
      {
        type: 'workout',
        desc: 'HIIT',
        time: 21,
        kcal: 400,
        duration: 40,
      },
    ],
  },
  {
    name: 'sonno buono, nessuna causa',
    log: [
      {
        type: 'sleep',
        bedtimeApprox: 23,
        wakeHour: 7,
        hours: 8,
        quality: 'buona',
      },
    ],
  },
  {
    name: 'pasto pesante + alcol',
    log: [
      {
        type: 'sleep',
        /** mezzanotte come 0 h (24 non è nel range clamp 0–24 esclusivo) */
        bedtimeApprox: 0,
        wakeHour: 6,
        hours: 6,
        quality: 'scarsa',
      },
      {
        type: 'food',
        name: 'pizza',
        time: 22,
        kcal: 900,
      },
      {
        type: 'food',
        name: 'vino',
        time: 22.5,
      },
    ],
  },
];

function runTests() {
  console.log('=== SLEEP COACH TEST ===');

  testCases.forEach((test) => {
    const input = buildSleepCoachInputFromDailyLog(test.log);
    const result = analyzeSleepCoach(input);

    console.log(`\n--- ${test.name} ---`);
    console.log('status:', result.status);
    console.log('cause:', result.likelyCauses.map((c) => c.id));
    console.log('confidence:', result.confidence);
    console.log('narrative:', result.narrative);
  });
}

runTests();
