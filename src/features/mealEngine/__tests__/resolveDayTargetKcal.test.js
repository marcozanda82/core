/**
 * resolveDayTargetKcal + Autopilota lookback (base + burn contato).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countWorkoutBurnKcal,
  formatEnergyDayKeyFact,
  formatWorkoutBurnLabel,
  inferKcalSource,
  resolveDayTargetKcal,
  resolveKcalSourceForSave,
  resolveLookbackDayTargetKcal,
  KCAL_SOURCE,
} from '../resolveDayTargetKcal.js';

describe('formatEnergyDayKeyFact', () => {
  it('aggiunge «contate» solo se burn parziale; autopilota con segno', () => {
    assert.equal(
      formatEnergyDayKeyFact({
        intake: 2378,
        total: 2516,
        base: 2456,
        burnRaw: 120,
        burnCounted: 60,
      }),
      '2378 su 2516 (base 2456 + allenamento 120, contate 60)',
    );
    assert.equal(
      formatEnergyDayKeyFact({
        intake: 2772,
        total: 2808,
        base: 2456,
        burnRaw: 330,
        burnCounted: 165,
        autopilot: 187,
      }),
      '2772 su 2808 (base 2456 + allenamento 330, contate 165 + autopilota +187)',
    );
    assert.equal(
      formatEnergyDayKeyFact({
        intake: 2400,
        total: 2856,
        base: 2456,
        burnRaw: 400,
        burnCounted: 400,
      }),
      '2400 su 2856 (base 2456 + allenamento 400)',
    );
  });
});

describe('kcalSource e conteggio burn', () => {
  it('senza fonte esplicita → estimated al 50%', () => {
    assert.equal(inferKcalSource({ kcal: 400 }), KCAL_SOURCE.ESTIMATED);
    const c = countWorkoutBurnKcal({ kcal: 400 });
    assert.equal(c.counted, 200);
    assert.equal(
      formatWorkoutBurnLabel({ burnRaw: 400, burnCounted: 200, kcalSource: 'estimated' }),
      'Allenamento 400 (stimate, contate 200)',
    );
  });

  it('user 75%, device 100%', () => {
    assert.equal(countWorkoutBurnKcal({ kcal: 400, kcalSource: 'user' }).counted, 300);
    assert.equal(countWorkoutBurnKcal({ kcal: 400, kcalSource: 'device' }).counted, 400);
  });

  it('salvataggio: edit rispetto al suggerimento → user, altrimenti estimated', () => {
    assert.equal(resolveKcalSourceForSave({ kcal: 300, suggestedKcal: 300 }), 'estimated');
    assert.equal(resolveKcalSourceForSave({ kcal: 450, suggestedKcal: 300 }), 'user');
    assert.equal(resolveKcalSourceForSave({ fromChat: true, kcal: 450, suggestedKcal: 300 }), 'estimated');
    assert.equal(resolveKcalSourceForSave({ fromDevice: true, kcal: 500 }), 'device');
  });
});

describe('resolveDayTargetKcal', () => {
  it('somma base + burn contato + autopilota; preferisce snapshot', () => {
    const history = {
      'trackerStorico_2026-11-14': {
        data: '2026-11-14',
        log: [{ type: 'workout', id: 'w1', kcal: 400 }],
        autopilotCorrection: 59,
      },
    };
    const live = resolveDayTargetKcal({
      date: '2026-11-14',
      fullHistory: history,
      settingsBaseKcal: 2456,
      autopilotKcal: 59,
      preferSnapshot: false,
    });
    assert.equal(live.burnRaw, 400);
    assert.equal(live.burnCounted, 200);
    assert.equal(live.total, 2456 + 200 + 59);

    history['trackerStorico_2026-11-14'].dayTargetSnapshot = {
      base: 2456,
      burnRaw: 400,
      burnCounted: 200,
      kcalSource: 'estimated',
      autopilot: 59,
      strategy: 0,
      compensation: 0,
      total: 2715,
      rulesVersion: 'dtr-1',
    };
    const frozen = resolveDayTargetKcal({
      date: '2026-11-14',
      fullHistory: history,
      settingsBaseKcal: 9999,
      preferSnapshot: true,
    });
    assert.equal(frozen.fromSnapshot, true);
    assert.equal(frozen.total, 2715);
  });
});

describe('Autopilota: surplus → abbassa il target successivo', () => {
  it('esempio 3×+300: delta negativo (stessa formula di resolveAutopilotZoneStrategy)', () => {
    const tdee = 2456;
    const netDebt = 900; // 3 giorni × +300 sopra (base+burn contato)
    const deadband = Math.round(tdee * 0.05); // 123
    const cap = Math.round(tdee * 0.11); // 270
    assert.ok(Math.abs(netDebt) > deadband);
    const abs = Math.abs(netDebt);
    let dailyCorrection = 0;
    if (abs / 2 <= cap) dailyCorrection = Math.round(abs / 2);
    else if (abs / 3 <= cap) dailyCorrection = Math.round(abs / 3);
    else dailyCorrection = cap;
    if (netDebt < 0) dailyCorrection = -dailyCorrection;
    const autoCompensationDelta = -dailyCorrection;
    // |900|/3 = 300 > 270 → cap → dailyCorrection +270 → delta −270
    assert.equal(dailyCorrection, 270);
    assert.equal(autoCompensationDelta, -270);
    assert.ok(autoCompensationDelta < 0, 'surplus → ABBASSA il target successivo');
  });

  it('lookback target include burn contato, non solo base', () => {
    const history = {
      'trackerStorico_2026-11-14': {
        data: '2026-11-14',
        log: [{ type: 'workout', id: 'w', kcal: 400, kcalSource: 'estimated' }],
      },
    };
    const t = resolveLookbackDayTargetKcal({
      date: '2026-11-14',
      fullHistory: history,
      settingsBaseKcal: 2456,
    });
    assert.equal(t, 2456 + 200);
  });

  it('senza snapshot: base da targetHistory, ignora baseKcal corrente, niente fallback 2000', () => {
    const history = {
      'trackerStorico_2026-11-17': {
        data: '2026-11-17',
        log: [],
        autopilotCorrection: 123,
      },
    };
    const targets = {
      baseKcal: 2210,
      kcal: 2456,
      targetHistory: [
        {
          effectiveDate: '2026-10-02',
          targets: { kcal: 2456, prot: 127 },
        },
      ],
    };
    const resolved = resolveDayTargetKcal({
      date: '2026-11-17',
      fullHistory: history,
      targets,
      preferSnapshot: true,
    });
    assert.equal(resolved.baseMissing, false);
    assert.equal(resolved.base, 2456);
    assert.equal(resolved.autopilot, 123);
    assert.equal(resolved.total, 2456 + 123);
    assert.match(String(resolved.baseSource || ''), /targetHistory/);

    const missing = resolveDayTargetKcal({
      date: '2026-11-17',
      fullHistory: history,
      targets: { baseKcal: 2210, kcal: 2456, targetHistory: [] },
      preferSnapshot: true,
    });
    assert.equal(missing.baseMissing, true);
    assert.equal(missing.base, null);
    assert.equal(missing.total, null);
  });
});
