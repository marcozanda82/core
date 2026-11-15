/**
 * Costanza mm-1 — mappa, merge, giorni, scia (puro, nessuna rete).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  __chipMapKeysForTests,
  mapChipToMuscles,
  mergeMuscleWeights,
  sessionMuscleWeights,
  sessionTrainedMuscleIds,
} from '../muscleMap.mm-1.js';
import {
  computeCostanzaForza,
  computeWeekStreak,
  coverageStatusFromSum,
  lastTrainedDate,
  strengthDaySet,
  strengthSessionsByDay,
  weekMondayOf,
} from '../costanzaForza.js';
import { forceLoadConsistency } from '../forceConsistency.ci-1.js';
import { FORCE_CI_GROUP_IDS, MUSCLE_IDS } from '../muscleIds.mm-1.js';

function dayNode(date, workouts) {
  return {
    data: date,
    log: workouts.map((w, i) => ({
      type: 'workout',
      id: `w-${date}-${i}`,
      workoutType: w.workoutType || 'pesi',
      muscles: w.muscles,
      durationMinutes: w.durationMinutes || 40,
      __dateKey: date,
    })),
  };
}

function history(map) {
  const out = {};
  for (const [date, workouts] of Object.entries(map)) {
    out[`trackerStorico_${date}`] = dayNode(date, workouts);
  }
  return out;
}

describe('muscleMap.mm-1 chip', () => {
  it('mappa ogni chip del catalogo', () => {
    const keys = __chipMapKeysForTests();
    assert.deepEqual(keys, [
      'Core',
      'Dorso',
      'Gambe',
      'Petto',
      'Spalle',
      'Total Body',
      'abs',
      'avambracci',
      'bicipiti',
      'tricipiti',
    ]);
    for (const chip of keys) {
      const rows = mapChipToMuscles(chip);
      assert.ok(rows.length > 0, chip);
      for (const row of rows) {
        assert.ok(MUSCLE_IDS.includes(row.muscleId), `${chip}→${row.muscleId}`);
        assert.ok(row.weight === 1 || row.weight === 0.5);
      }
    }
  });

  it('Petto: pettorali 1, tricipiti e deltoidi anteriori 0.5', () => {
    const w = mergeMuscleWeights(mapChipToMuscles('Petto'));
    assert.equal(w.pettorali, 1);
    assert.equal(w.tricipiti, 0.5);
    assert.equal(w.deltoidi_anteriori, 0.5);
  });

  it('0.5 + 0.5 nella stessa sessione → 1', () => {
    const w = mergeMuscleWeights([
      { muscleId: 'tricipiti', weight: 0.5 },
      { muscleId: 'tricipiti', weight: 0.5 },
    ]);
    // max(0.5, 0.5) = 0.5 — la regola «allenato+coinvolto→1» è max, non somma.
    // Due coinvolgimenti nella STESSA sessione restano 0.5; copertura 7g somma sessioni.
    assert.equal(w.tricipiti, 0.5);

    // Petto + Tricipiti nella stessa sessione: tricipiti diventa 1
    const session = sessionMuscleWeights({
      type: 'workout',
      workoutType: 'pesi',
      muscles: ['Petto', 'tricipiti'],
    });
    assert.equal(session.pettorali, 1);
    assert.equal(session.tricipiti, 1);
  });

  it('fallback alzate_sedia → Gambe', () => {
    const w = sessionMuscleWeights({ type: 'workout', workoutType: 'alzate_sedia' });
    assert.equal(w.quadricipiti, 1);
    assert.equal(w.glutei, 1);
  });
});

describe('costanza copertura e «da quanto»', () => {
  it('coperto se somma pesi ≥1 (due coinvolgimenti)', () => {
    assert.equal(coverageStatusFromSum(1), 'coperto');
    assert.equal(coverageStatusFromSum(0.5), 'toccato');
    assert.equal(coverageStatusFromSum(0), 'vuoto');

    const h = history({
      '2026-11-08': [{ muscles: ['Petto'] }], // tricipiti 0.5
      '2026-11-09': [{ muscles: ['Petto'] }], // tricipiti 0.5 → sum 1
    });
    const snap = computeCostanzaForza({ fullHistory: h, asOfDate: '2026-11-09' });
    assert.equal(snap.muscles.tricipiti.status, 'coperto');
    assert.equal(snap.muscles.pettorali.status, 'coperto');
  });

  it('giorni dall’ultima volta ignorano il coinvolgimento', () => {
    const h = history({
      '2026-11-01': [{ muscles: ['tricipiti'] }], // allenato
      '2026-11-08': [{ muscles: ['Petto'] }], // tricipiti solo 0.5
    });
    const byDay = strengthSessionsByDay(h, '2026-11-09');
    assert.equal(lastTrainedDate(byDay, 'tricipiti', '2026-11-09'), '2026-11-01');
    const snap = computeCostanzaForza({ fullHistory: h, asOfDate: '2026-11-09' });
    assert.equal(snap.muscles.tricipiti.lastTrained, '2026-11-01');
    assert.equal(snap.muscles.tricipiti.daysSinceTrained, 8);
  });
});

describe('obiettivo e scia settimanale', () => {
  it('lunedì della settimana', () => {
    // 2026-11-09 è lunedì
    assert.equal(weekMondayOf('2026-11-09'), '2026-11-09');
    assert.equal(weekMondayOf('2026-11-11'), '2026-11-09');
    assert.equal(weekMondayOf('2026-11-15'), '2026-11-09');
  });

  it('conta giorni forza e non spezza la scia in settimana aperta', () => {
    const h = history({
      // settimana precedente (lun 2 – dom 8 nov): 2 giorni
      '2026-11-03': [{ muscles: ['Gambe'] }],
      '2026-11-05': [{ muscles: ['Petto'] }],
      // settimana corrente (lun 9): 1 giorno — non chiusa
      '2026-11-09': [{ muscles: ['Dorso'] }],
    });
    const snap = computeCostanzaForza({
      fullHistory: h,
      asOfDate: '2026-11-10',
      weeklyGoalDays: 2,
    });
    assert.equal(snap.forceDaysThisWeek, 1);
    assert.equal(snap.weekStreak, 1, 'settimana precedente ok; corrente aperta non spezza');
  });

  it('scia si interrompe se la settimana chiusa manca l’obiettivo', () => {
    const days = new Set(['2026-11-03']); // solo 1 giorno nella sett 2–8
    assert.equal(computeWeekStreak(days, '2026-11-10', 2), 0);
  });
});

describe('force-ci-1', () => {
  it('combina giorni settimana e gruppi coperti', () => {
    const h = history({
      '2026-11-09': [{ muscles: ['Petto'] }],
      '2026-11-10': [{ muscles: ['Gambe'] }],
    });
    // 2/2 giorni → 0.5; Petto+Gambe coperti su 5 → 0.2; totale 0.7
    const v = forceLoadConsistency('2026-11-10', h, { weeklyGoalDays: 2 });
    assert.equal(v, 0.7);
    assert.equal(FORCE_CI_GROUP_IDS.length, 5);
  });
});

describe('sessionTrainedMuscleIds', () => {
  it('elenca solo peso 1', () => {
    const ids = sessionTrainedMuscleIds({
      type: 'workout',
      workoutType: 'pesi',
      muscles: ['Petto'],
    });
    assert.deepEqual(ids, ['pettorali']);
  });
});
