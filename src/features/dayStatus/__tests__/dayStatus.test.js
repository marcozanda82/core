import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadFocusDiaryRealOct27 } from '../../kentuFocus/__tests__/fixtures/focusDiaryRealOct27.js';
import {
  buildDayStatusRecord,
  dayStatusPath,
  detectDayGaps,
  getCoverage,
  getDayStatus,
  lateThresholdMs,
  normalizeDayStatusRecord,
} from '../index.js';

const TODAY = '2026-11-10';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function historyWith(date, log, extra = {}) {
  return {
    [`trackerStorico_${date}`]: {
      log,
      ...extra,
    },
  };
}

function food(id, mealType, mealTime, kcal) {
  return {
    type: 'food',
    id,
    name: id,
    mealType,
    mealTime,
    time: mealTime,
    kcal,
    cal: kcal,
  };
}

describe('getDayStatus', () => {
  it('rifiuta una data non valida', () => {
    assert.equal(getDayStatus('27-10-2026', { today: TODAY }), null);
    assert.equal(getDayStatus('2026-11-10', {}), null);
  });

  it('copre gli otto stati', () => {
    const date = '2026-11-01';
    const logged = historyWith(date, [food('a', 'pranzo', 13, 800), food('b', 'cena', 20, 700)]);

    assert.equal(getDayStatus('2026-11-11', { today: TODAY, fullHistory: {} }), 'future');
    assert.equal(getDayStatus(TODAY, { today: TODAY, fullHistory: {} }), 'in_progress');
    assert.equal(getDayStatus('2026-11-09', { today: TODAY, fullHistory: {} }), 'hole');
    assert.equal(getDayStatus(date, { today: TODAY, fullHistory: logged }), 'unconfirmed');
    assert.equal(getDayStatus(date, {
      today: TODAY,
      fullHistory: logged,
      record: { confirmed: true, confirmedAt: 1, approximate: false, paused: false },
    }), 'closed');
    assert.equal(getDayStatus(date, {
      today: TODAY,
      fullHistory: logged,
      record: { confirmed: false, approximate: false, paused: true, pauseReason: 'vacanza' },
    }), 'paused');
    assert.equal(getDayStatus(date, {
      today: TODAY,
      fullHistory: logged,
      record: { confirmed: true, approximate: true, paused: false },
    }), 'approximate');
    assert.equal(getDayStatus(date, {
      today: TODAY,
      fullHistory: logged,
      record: { confirmed: true, approximate: false, paused: false, loggedLateAt: lateThresholdMs(date) + 1000 },
    }), 'late');
  });

  it('oggi in pausa resta paused, non in_progress', () => {
    assert.equal(getDayStatus(TODAY, {
      today: TODAY,
      record: { paused: true, pauseReason: 'malattia', confirmed: false, approximate: false },
    }), 'paused');
  });

  it('un digiuno intenzionale non è un buco', () => {
    const date = '2026-11-02';
    assert.equal(getDayStatus(date, {
      today: TODAY,
      fullHistory: historyWith(date, [], { isIntentionalFast: true }),
    }), 'unconfirmed');
  });

  it('è late se il primo timestamp supera la fine del giorno di 48 ore', () => {
    const date = '2026-10-27';
    const lateAt = lateThresholdMs(date) + 60_000;
    const onTime = lateThresholdMs(date) - 60_000;
    const lateHistory = historyWith(date, [{
      ...food('a', 'cena', 21, 600),
      createdAt: lateAt,
    }]);
    const onTimeHistory = historyWith(date, [{
      ...food('a', 'cena', 21, 600),
      createdAt: onTime,
    }]);
    assert.equal(getDayStatus(date, { today: TODAY, fullHistory: lateHistory }), 'late');
    assert.equal(getDayStatus(date, { today: TODAY, fullHistory: onTimeHistory }), 'unconfirmed');
  });

  it('approximate pesa più di late e di closed', () => {
    const date = '2026-11-03';
    assert.equal(getDayStatus(date, {
      today: TODAY,
      record: {
        confirmed: true,
        approximate: true,
        paused: false,
        loggedLateAt: Date.now(),
      },
    }), 'approximate');
  });
});

describe('detectDayGaps', () => {
  const date = '2026-11-04';
  const targetKcal = 2000;

  it('un solo pasto principale', () => {
    const gaps = detectDayGaps(date, {
      fullHistory: historyWith(date, [
        food('a', 'pranzo', 13, 900),
        food('b', 'pranzo', 13.5, 400),
        food('c', 'snack', 16, 200),
      ]),
      targetKcal,
    });
    assert.equal(gaps.hasGaps, true);
    assert.deepEqual(gaps.reasons, ['singleMainMeal', 'noMealAfter17']);
    assert.deepEqual(gaps.mainMeals, ['pranzo']);
  });

  it('nessun pasto dopo le 17', () => {
    const gaps = detectDayGaps(date, {
      fullHistory: historyWith(date, [
        food('a', 'colazione', 8, 500),
        food('b', 'pranzo', 13, 800),
        food('c', 'cena', 17, 700),
      ]),
      targetKcal,
    });
    assert.ok(gaps.reasons.includes('noMealAfter17'));
    assert.equal(gaps.reasons.includes('singleMainMeal'), false);
    assert.equal(gaps.lastMealHour, 17);
  });

  it('kcal sotto il 50% dell’obiettivo, senza un voto', () => {
    const gaps = detectDayGaps(date, {
      fullHistory: historyWith(date, [
        food('a', 'pranzo', 13.5, 400),
        food('b', 'cena', 20.5, 500),
      ]),
      targetKcal,
    });
    assert.deepEqual(gaps.reasons, ['lowEnergy']);
    assert.equal(gaps.kcal, 900);
    assert.equal(gaps.energyRatio, 0.45);
    assert.equal(JSON.stringify(gaps).includes('male'), false);
    assert.equal(JSON.stringify(gaps).includes('giudiz'), false);
  });

  it('un giorno senza alimenti non inventa buchi', () => {
    const gaps = detectDayGaps(date, { fullHistory: {}, targetKcal });
    assert.equal(gaps.hasGaps, false);
    assert.deepEqual(gaps.reasons, []);
  });

  it('senza obiettivo non segnala l’energia', () => {
    const gaps = detectDayGaps(date, {
      fullHistory: historyWith(date, [
        food('a', 'pranzo', 13, 100),
        food('b', 'cena', 21, 100),
      ]),
    });
    assert.equal(gaps.reasons.includes('lowEnergy'), false);
    assert.equal(gaps.targetKcal, null);
  });
});

describe('getCoverage', () => {
  it('conta registrati, confermati, buchi e pause', () => {
    const coverage = getCoverage('2026-11-08', '2026-11-12', {
      today: TODAY,
      fullHistory: historyWith('2026-11-08', [food('a', 'cena', 20, 700)]),
      records: {
        '2026-11-08': { confirmed: true, approximate: false, paused: false, confirmedAt: 10 },
        '2026-11-09': { confirmed: false, approximate: true, paused: false },
        '2026-11-11': { confirmed: false, approximate: false, paused: true, pauseReason: 'altro' },
      },
    });
    assert.equal(coverage.days, 5);
    assert.equal(coverage.byStatus.closed, 1);
    assert.equal(coverage.byStatus.approximate, 1);
    assert.equal(coverage.byStatus.hole, 1);
    assert.equal(coverage.byStatus.in_progress, 1);
    assert.equal(coverage.byStatus.paused, 1);
    assert.equal(coverage.registered, 2);
    assert.equal(coverage.confirmed, 1);
    assert.equal(coverage.holes, 1);
    assert.equal(coverage.pauses, 1);
  });
});

describe('record e regole', () => {
  it('normalizza il record e costruisce il path per-uid', () => {
    assert.equal(dayStatusPath('abc', '2026-11-01'), 'users/abc/day_status/2026-11-01');
    const stored = buildDayStatusRecord({
      confirmed: true,
      confirmedAt: 1000,
      approximate: false,
      paused: false,
      pauseReason: 'vacanza',
      loggedLateAt: 50,
    });
    assert.equal(stored.pauseReason, undefined);
    assert.equal(stored.loggedLateAt, 50000);
    assert.deepEqual(normalizeDayStatusRecord(stored), {
      confirmed: true,
      confirmedAt: 1000,
      approximate: false,
      paused: false,
      pauseReason: null,
      loggedLateAt: 50000,
    });
  });

  it('le rules RTDB limitano day_status all’uid', () => {
    for (const file of ['database.rules.json', 'database.rules.focus.local.json']) {
      const rules = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
      const node = rules.rules.users.$uid.day_status.$date;
      assert.equal(node['.read'], '$uid === auth.uid');
      assert.equal(node['.write'], '$uid === auth.uid');
      assert.match(node['.validate'], /confirmed/);
      assert.match(node['.validate'], /vacanza/);
      assert.match(node['.validate'], /loggedLateAt/);
    }
  });
});

describe('fixture 27–30 ottobre 2026', () => {
  const { fullHistory, userTargets } = loadFocusDiaryRealOct27();
  const context = {
    today: TODAY,
    fullHistory,
    records: {},
    targetKcal: userTargets.kcal,
  };

  for (const date of ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) {
    it(`${date} è un giorno passato con dati, non confermato`, () => {
      const status = getDayStatus(date, context);
      const gaps = detectDayGaps(date, context);
      assert.equal(status, 'unconfirmed', `${date} → ${status}, kcal ${gaps.kcal}, pasti ${gaps.mainMeals.join(',')}`);
      assert.equal(gaps.hasFood, true);
      assert.equal(typeof gaps.kcal, 'number');
    });
  }

  it('la copertura dei quattro giorni non ha buchi né pause', () => {
    const coverage = getCoverage('2026-10-27', '2026-10-30', context);
    assert.equal(coverage.days, 4);
    assert.equal(coverage.registered, 4);
    assert.equal(coverage.confirmed, 0);
    assert.equal(coverage.holes, 0);
    assert.equal(coverage.pauses, 0);
    assert.equal(coverage.byStatus.unconfirmed, 4);
  });
});
