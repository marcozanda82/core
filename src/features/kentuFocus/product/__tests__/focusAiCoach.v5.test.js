import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getDayStatus } from '../../../dayStatus/dayStatus.js';
import { addCalendarDays } from '../../normalize/focusDateUtils.js';
import { realFixtureSkipReason } from '../../__tests__/fixtures/focusDiaryRealOct27.js';
import { buildFocusPeriodBrief } from '../focusPeriodBrief.js';
import { computePeriodScore } from '../../score/computePeriodScore.js';
import { focusPeriodWindow } from '../ui/focusPeriodCursor.js';
import { loadFocusCatalogsFromPublic } from '../loadFocusCatalogsNode.js';
import { composeFocusV5Report } from '../composeFocusV5Report.js';
import { validateFocusAiCoachResponse } from '../validateFocusAiCoachResponse.js';

const require = createRequire(import.meta.url);
const TODAY = '2026-11-10';
const CLOSED = { confirmed: true, approximate: false, paused: false };
const PROFILE = { weight: 70, height: 174, age: 44, gender: 'M' };
const DATES = ['2026-10-24', '2026-10-29', '2026-10-30', '2026-11-09'];

function calibrationRecords(fullHistory) {
  const records = {};
  for (const key of Object.keys(fullHistory || {})) {
    if (!key.startsWith('trackerStorico_')) continue;
    const date = key.slice('trackerStorico_'.length);
    if (date >= TODAY) continue;
    if (getDayStatus(date, { today: TODAY, fullHistory }) === 'unconfirmed') {
      records[date] = CLOSED;
    }
  }
  return records;
}

function reportFor(date, context) {
  const brief = buildFocusPeriodBrief('ieri', date, context);
  const report = composeFocusV5Report(brief);
  const validated = validateFocusAiCoachResponse(JSON.stringify(report), { dossier: { periodBrief: brief } });
  return { brief, report, validated };
}

test('v5 sui quattro giorni del diario', {
  skip: realFixtureSkipReason('focusDiary.2026-11-09.real.json'),
}, async () => {
  const fixture = require('../../__tests__/fixtures/focusDiary.2026-11-09.real.json');
  const catalogs = await loadFocusCatalogsFromPublic();
  const context = {
    today: TODAY,
    fullHistory: fixture.fullHistory,
    profile_targets: fixture.profile_targets,
    profile: fixture.profile_targets?.profile || PROFILE,
    targetKcal: 2456,
    records: calibrationRecords(fixture.fullHistory),
    cylinders: { forza: { enabled: true } },
    catalogs,
  };
  const printed = {};
  for (const date of DATES) {
    const { brief, report, validated } = reportFor(date, context);
    assert.equal(validated.ok, true, `${date} ${validated.reason}`);
    assert.equal(report.schema, 'kentu.focusAiCoachAnalysis.v5');
    assert.equal(report.action.pillar, brief.actionPillar, date);
    if (date === '2026-10-24' || date === '2026-10-30') {
      assert.equal(brief.actionPillar, 'alimentazione', date);
    }
    if (date === '2026-10-29') {
      const ranked = brief.pillars
        .filter((item) => item.value != null)
        .map((item) => ({ id: item.id, impact: (1 - item.value) * ({ alimentazione: 0.45, sonno: 0.30, movimento: 0.25, forza: 0.15 }[item.id]) }))
        .sort((a, b) => b.impact - a.impact);
      assert.equal(ranked[0].id, 'movimento');
      assert.equal(brief.actionPillar, 'movimento');
    }
    if (date === '2026-10-24') {
      const food = brief.pillars.find((item) => item.id === 'alimentazione');
      assert.ok(food.value < 0.45, String(food.value));
      assert.equal(food.status, 'off_track');
      assert.equal(report.pillars.find((item) => item.id === 'alimentazione').tone, 'improve');
    }
    assert.equal(report.action.horizon, 'oggi', date);
    if (date === '2026-11-09') {
      const food = brief.pillars.find((item) => item.id === 'alimentazione');
      assert.ok((food.penalties || []).includes('heavy_late_meal'));
      assert.match(report.pillars.find((item) => item.id === 'alimentazione').line, /cena abbondante/i);
      const week = buildFocusPeriodBrief('settimana', date, context);
      const forza = week.pillars.find((item) => item.id === 'forza');
      assert.match(forza.keyFact, /parte alta(?: \d+ session\w*|: nessuna)/);
      assert.match(forza.keyFact, /parte bassa(?: \d+ session\w*|: nessuna)/);
      if (forza.status === 'off_track') assert.match(forza.keyFact, /ferma da/);
      else assert.doesNotMatch(forza.keyFact, /ferma da/);
      const foodWeek = week.pillars.find((item) => item.id === 'alimentazione');
      assert.match(foodWeek.keyFact, /media \d+ kcal · \d+ giorn\w* su 7 fuori fascia/);
    }
    assert.equal(report.summary, undefined);
    for (const row of report.pillars) {
      const source = brief.pillars.find((item) => item.id === row.id);
      assert.equal(source.active, true, row.id);
      if (source.status === 'on_track') assert.equal(row.tone, 'positive');
      if (source.status === 'off_track') assert.equal(row.tone, 'improve');
      if (source.status === 'halfway') assert.ok(row.tone === 'neutral' || row.tone === 'improve');
    }
    printed[date] = { brief: {
      score: brief.score,
      forceIntensity: brief.forceIntensity,
      dayStatus: brief.dayStatus,
      reliability: brief.reliability,
      actionPillar: brief.actionPillar,
      safety: brief.safety,
      pillars: brief.pillars,
    }, report };
  }
  console.log(JSON.stringify(printed, null, 2));
});

test('un tone diverso dallo stato si corregge al recupero', () => {
  const history = {};
  const date = '2026-11-09';
  history[`trackerStorico_${date}`] = {
    data: date,
    log: [
      { type: 'food', id: 'f', name: 'Piatto', mealType: 'pranzo', mealTime: 13, kcal: 800, prot: 40, carb: 80, fat: 20 },
      { type: 'workout', id: 'w', workoutType: 'camminata', duration: 40 },
    ],
  };
  history.trackerStorico_2026_11_10 = {
    data: '2026-11-10',
    log: [{ type: 'sleep', id: 's', hours: 8, wakeTime: 7, bedtime: 23, bedtimeProvenance: 'recorded' }],
  };
  const brief = buildFocusPeriodBrief('ieri', date, {
    today: TODAY,
    fullHistory: history,
    targetKcal: 2456,
    records: { [date]: CLOSED },
    cylinders: { forza: { enabled: true } },
    profile: PROFILE,
  });
  const report = composeFocusV5Report(brief);
  const broken = { ...report, pillars: report.pillars.map((row) => ({ ...row, tone: 'positive' })) };
  const off = broken.pillars.find((row) => {
    const source = brief.pillars.find((item) => item.id === row.id);
    return source && source.status !== 'on_track';
  });
  assert.ok(off, 'serve un pilastro fuori stato per il recupero del tone');
  {
    const rejected = validateFocusAiCoachResponse(JSON.stringify(broken), { dossier: { periodBrief: brief } });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'pillar_tone_mismatch');
    const saved = validateFocusAiCoachResponse(JSON.stringify(broken), { dossier: { periodBrief: brief }, salvage: true });
    assert.equal(saved.ok, true);
    assert.ok(saved.autoFixes.some((line) => line.startsWith('tone:')));
  }
  const wrongPillar = { ...report, action: { ...report.action, pillar: report.action.pillar === 'sonno' ? 'movimento' : 'sonno' } };
  const rejectedPillar = validateFocusAiCoachResponse(JSON.stringify(wrongPillar), { dossier: { periodBrief: brief } });
  assert.equal(rejectedPillar.reason, 'action_pillar_mismatch');
  const savedPillar = validateFocusAiCoachResponse(JSON.stringify(wrongPillar), { dossier: { periodBrief: brief }, salvage: true });
  assert.equal(savedPillar.analysis.action.pillar, brief.actionPillar);
});

test('restrictive_pattern: niente numeri e un invito a un professionista', () => {
  const date = '2026-11-09';
  const history = {};
  const days = Array.from({ length: 12 }, (_, index) => addCalendarDays(date, -index));
  for (const [index, day] of days.entries()) {
    history[`trackerStorico_${day}`] = {
      data: day,
      log: [{
        type: 'food',
        id: `f-${day}`,
        name: 'Piatto',
        mealType: 'pranzo',
        mealTime: 13,
        kcal: index >= 7 ? 1500 : 3000,
        prot: 140,
        carb: 40,
        fat: 10,
      }],
    };
  }
  const brief = buildFocusPeriodBrief('ieri', date, {
    today: TODAY,
    fullHistory: history,
    targetKcal: 3000,
    profile: PROFILE,
    records: Object.fromEntries(days.map((day) => [day, CLOSED])),
    cylinders: { forza: { enabled: false } },
  });
  const report = composeFocusV5Report(brief);
  const validated = validateFocusAiCoachResponse(JSON.stringify(report), { dossier: { periodBrief: brief } });
  assert.equal(brief.safety.suppressNumbers, true);
  assert.equal(brief.safety.signals.some((item) => item.id === 'restrictive_pattern' && item.level === 'act'), true);
  assert.equal(brief.actionPillar, 'alimentazione');
  assert.equal(validated.ok, true, validated.reason);
  const blob = JSON.stringify(report);
  assert.equal(/\d+(?:[.,]\d+)?\s*(?:kcal|calorie|kg|g\/kg|grammi|\bg\b)/i.test(blob), false);
  assert.match(report.support?.text || '', /professionist|medico|supporto|confront/i);
  assert.doesNotMatch(report.action.text, /professionist|medico|supporto|confront/i);
  assert.doesNotMatch(report.action.text, /^(Oggi|Questa settimana|Questo mese) se ti va/i);
  const foodTone = report.pillars.find((item) => item.id === 'alimentazione')?.tone;
  assert.notEqual(foodTone, 'positive');
  assert.equal(blob.toLowerCase().includes('forza'), false);
  console.log(JSON.stringify({ brief: {
    score: brief.score,
    actionPillar: brief.actionPillar,
    safety: brief.safety,
    reliability: brief.reliability,
  }, report }, null, 2));
});

test('settimana e mese usano lo stesso schema, l’anno no', () => {
  const date = '2026-11-09';
  const history = {
    [`trackerStorico_${date}`]: {
      data: date,
      log: [{ type: 'food', id: 'f', name: 'Piatto', mealType: 'pranzo', mealTime: 13, kcal: 2456, prot: 130, carb: 40, fat: 10 }],
    },
  };
  const context = {
    today: TODAY,
    fullHistory: history,
    targetKcal: 2456,
    records: { [date]: CLOSED },
    profile: PROFILE,
  };
  const week = buildFocusPeriodBrief('settimana', date, context);
  const month = buildFocusPeriodBrief('mese', date, context);
  assert.equal(week.horizon, 'questa settimana');
  assert.equal(month.horizon, 'questo mese');
  assert.equal(composeFocusV5Report(week).schema, 'kentu.focusAiCoachAnalysis.v5');
  assert.equal(composeFocusV5Report(month).schema, 'kentu.focusAiCoachAnalysis.v5');
  assert.equal(buildFocusPeriodBrief('anno', date, context).ai, false);
});

test('la settimana toglie 0,15 all’alimentazione se l’energia è irregolare', () => {
  const end = '2026-11-09';
  const history = {};
  const kcals = [1200, 2800, 1200, 2800, 1200, 2800, 2000];
  kcals.forEach((kcal, index) => {
    const date = addCalendarDays(end, index - 6);
    history[`trackerStorico_${date}`] = {
      data: date,
      log: [
        { type: 'food', id: `f-${date}`, name: 'Piatto', mealType: 'pranzo', mealTime: 13, kcal, prot: 80, carb: 40, fat: 10 },
        { type: 'sleep', id: `s-${date}`, hours: 8, wakeTime: 7, bedtime: 23, bedtimeProvenance: 'recorded' },
      ],
    };
  });
  const records = Object.fromEntries(Object.keys(history).map((key) => [key.slice('trackerStorico_'.length), CLOSED]));
  const context = {
    today: TODAY,
    fullHistory: history,
    targetKcal: 2000,
    records,
    profile: PROFILE,
  };
  const week = buildFocusPeriodBrief('settimana', end, context);
  const food = week.pillars.find((item) => item.id === 'alimentazione');
  assert.equal(food.energyIrregular, true);
  assert.ok(food.value <= 0.85);
  assert.equal(food.status, food.value >= 0.75 ? 'on_track' : food.value >= 0.45 ? 'halfway' : 'off_track');

  const steady = {};
  for (let index = 0; index < 7; index += 1) {
    const date = addCalendarDays(end, index - 6);
    steady[`trackerStorico_${date}`] = history[`trackerStorico_${date}`];
    steady[`trackerStorico_${date}`] = {
      ...history[`trackerStorico_${date}`],
      log: history[`trackerStorico_${date}`].log.map((item) => (
        item.type === 'food' ? { ...item, kcal: 2000 } : item
      )),
    };
  }
  const calm = buildFocusPeriodBrief('settimana', end, { ...context, fullHistory: steady });
  const calmFood = calm.pillars.find((item) => item.id === 'alimentazione');
  assert.equal(calmFood.energyIrregular, undefined);
  assert.equal(calmFood.value, 1);
  assert.equal(calmFood.status, 'on_track');
});

test('il validatore v5 tiene il registro', () => {
  const brief = {
    periodId: 'settimana',
    horizon: 'questa settimana',
    actionPillar: 'movimento',
    reliability: 'high',
    safety: { level: 'none', signals: [], suppressNumbers: false },
    support: null,
    pillars: [{ id: 'movimento', status: 'off_track', value: 0.3, active: true }],
  };
  const base = () => ({
    headline: 'Movimento chiede un aggiustamento',
    pillars: [{ id: 'movimento', line: 'Hai camminato poco in settimana.', tone: 'improve', eventRefs: [] }],
    action: { text: 'Aggiungi una camminata, anche breve.', pillar: 'movimento' },
    support: null,
    deepDive: { lead: 'La settimana ha pochi minuti di cammino.', sections: [], limits: [], evidenceRefs: [] },
  });
  const check = (mutate, reason) => {
    const report = base();
    mutate(report);
    const validated = validateFocusAiCoachResponse(JSON.stringify(report), { dossier: { periodBrief: brief } });
    assert.equal(validated.reason, reason);
    assert.equal(validated.ok, false);
  };
  assert.equal(validateFocusAiCoachResponse(JSON.stringify(base()), { dossier: { periodBrief: brief } }).ok, true);
  check((report) => { report.headline = 'Sopra il target, ma la media resta allineata'; }, 'headline_excuse');
  const praised = base();
  praised.headline = 'Hai centrato i pasti, ma non hai camminato';
  const stripped = validateFocusAiCoachResponse(JSON.stringify(praised), {
    dossier: { periodBrief: brief },
    salvage: true,
  });
  assert.equal(stripped.ok, true);
  assert.equal(stripped.analysis.headline, 'non hai camminato');
  assert.ok(stripped.autoFixes.includes('headline_excuse_stripped'));
  check((report) => { report.action.text = 'Aggiungi una camminata o allunga la cena.'; }, 'action_has_or_alternative');
  check((report) => { report.pillars[0].line = 'Hai dormito 6,5 ore.'; }, 'duration_decimal');
  check((report) => { report.pillars[0].line = 'Hai fatto piu attivita.'; }, 'missing_accent');
  check((report) => { report.pillars[0].line = 'Riposo registrato per 8 ore.'; }, 'register_impersonal');
  check((report) => { report.pillars[0].line = 'Introito a 2400 kcal.'; }, 'banned_user_facing_phrase');
  check((report) => {
    report.deepDive.sections = [{ title: 'Pasti', content: 'Non hai raggiunto la quota prevista.' }];
  }, 'banned_user_facing_phrase');
  check((report) => { report.pillars[0].line = 'Hai dormito 7 ore nell’ultima notte.'; }, 'period_single_day');
  check((report) => { report.pillars[0].line = 'Hai superato il target.'; }, 'banned_user_facing_phrase');
  const withClose = {
    ...brief,
    actionClose: { unit: 'min', minimum: 40, phrase: 'fai due camminate da 20 minuti' },
  };
  const shortAction = base();
  shortAction.action.text = 'Aggiungi una camminata.';
  assert.equal(
    validateFocusAiCoachResponse(JSON.stringify(shortAction), { dossier: { periodBrief: withClose } }).reason,
    'action_quantity_short',
  );
  const enough = base();
  enough.action.text = 'Fai tre camminate da 20 minuti.';
  assert.equal(
    validateFocusAiCoachResponse(JSON.stringify(enough), { dossier: { periodBrief: withClose } }).ok,
    true,
  );
  const missingLimit = base();
  assert.equal(
    validateFocusAiCoachResponse(JSON.stringify(missingLimit), {
      dossier: {
        periodBrief: brief,
        generationLimits: ['Alcuni alimenti non hanno dati sulla lavorazione.'],
      },
    }).reason,
    'unclassified_food_limit',
  );
  const citedBrief = {
    ...brief,
    periodId: 'ieri',
    horizon: 'oggi',
    actionPillar: 'alimentazione',
    pillars: [{
      id: 'alimentazione',
      status: 'on_track',
      value: 0.85,
      active: true,
      penalties: ['heavy_late_meal'],
    }],
  };
  const silent = {
    headline: 'I pasti restano vicini all’obiettivo',
    pillars: [{ id: 'alimentazione', line: 'Hai mangiato 2218 kcal, sotto l’obiettivo.', tone: 'positive', eventRefs: [] }],
    action: { text: 'Oggi tieni la stessa linea sui pasti.', pillar: 'alimentazione' },
    support: null,
    deepDive: { lead: 'I pasti restano vicini.', sections: [], limits: [], evidenceRefs: [] },
  };
  assert.equal(
    validateFocusAiCoachResponse(JSON.stringify(silent), { dossier: { periodBrief: citedBrief } }).reason,
    'pillar_penalty_omitted',
  );
  silent.pillars[0].line = 'Hai mangiato 2218 kcal, sotto l’obiettivo: cena abbondante.';
  assert.equal(
    validateFocusAiCoachResponse(JSON.stringify(silent), { dossier: { periodBrief: citedBrief } }).ok,
    true,
  );
  const day = { ...brief, periodId: 'ieri', horizon: 'oggi' };
  const slept = base();
  slept.pillars[0].line = 'Hai dormito 8 ore.';
  assert.equal(validateFocusAiCoachResponse(JSON.stringify(slept), { dossier: { periodBrief: day } }).ok, true);
});

test('ottobre è il mese di calendario, dal 1 al 31', () => {
  const today = '2026-11-11';
  const window = focusPeriodWindow('mese', today, 0);
  const history = {
    'trackerStorico_2026-10-01': {
      data: '2026-10-01',
      log: [{ type: 'food', id: 'f', name: 'Piatto', mealType: 'pranzo', mealTime: 13, kcal: 2000, prot: 80, carb: 40, fat: 10 }],
    },
  };
  const context = {
    today,
    fullHistory: history,
    targetKcal: 2000,
    periodFrom: window.from,
    periodTo: window.to,
  };
  const brief = buildFocusPeriodBrief('mese', window.analysisDate, context);
  const period = computePeriodScore(window.from, window.to, context);
  assert.equal(window.from, '2026-10-01');
  assert.equal(window.to, '2026-10-31');
  assert.equal(window.analysisDate, '2026-10-31');
  assert.equal(brief.from, '2026-10-01');
  assert.equal(brief.to, '2026-10-31');
  assert.equal(period.from, brief.from);
  assert.equal(period.to, brief.to);
  assert.equal(period.pastDays, 31);
  assert.equal(period.eligibleDays, 1);
  assert.notEqual(brief.pillars.find((item) => item.id === 'alimentazione').status, 'no_data');
  assert.equal(brief.unconfirmedNote, null);
});

test('il titolo segue lo stato del periodo e il movimento il punteggio completo', () => {
  const date = '2026-11-11';
  const history = {};
  [35, 30, 30, 30, 30, 30].forEach((minutes, index) => {
    const day = addCalendarDays(date, -(index + 1));
    history[`trackerStorico_${day}`] = {
      data: day,
      log: [{ type: 'workout', id: `w-${index}`, name: 'camminata', duration: minutes }],
    };
  });
  history[`trackerStorico_${date}`] = {
    data: date,
    log: [
      { type: 'food', id: 'c', name: 'avena', mealType: 'colazione', mealTime: 8, kcal: 230, prot: 8, carb: 30, fat: 6 },
      { type: 'food', id: 'p', name: 'riso e pollo', mealType: 'pranzo', mealTime: 13, kcal: 720, prot: 40, carb: 80, fat: 12 },
      { type: 'food', id: 'd', name: 'verdure e uova', mealType: 'cena', mealTime: 20, kcal: 480, prot: 25, carb: 20, fat: 18 },
    ],
  };
  history[`trackerStorico_${addCalendarDays(date, 1)}`] = {
    data: addCalendarDays(date, 1),
    log: [{ type: 'sleep', id: 's', hours: 7.4, wakeTime: 7, bedtime: 23.6, bedtimeProvenance: 'recorded' }],
  };
  const context = {
    today: '2026-11-12',
    fullHistory: history,
    targetKcal: 2300,
    profile: PROFILE,
    records: { [date]: { confirmed: true, approximate: false, paused: false } },
    cylinders: { forza: { enabled: false } },
  };
  const brief = buildFocusPeriodBrief('ieri', date, context);
  const move = brief.pillars.find((item) => item.id === 'movimento');
  assert.equal(move.status, 'halfway', `${move.status} ${move.value} ${move.keyFact}`);
  assert.ok(move.value >= 0.45 && move.value < 0.75, String(move.value));
  assert.match(move.keyFact, /oggi 0 min/);
  assert.equal(brief.actionPillar, 'alimentazione');
  assert.ok(brief.score >= 0.45 && brief.score < 0.75, String(brief.score));
  const report = composeFocusV5Report(brief);
  const validated = validateFocusAiCoachResponse(JSON.stringify(report), { dossier: { periodBrief: brief } });
  assert.equal(validated.ok, true, `${validated.reason} ${report.headline} ${report.action.text}`);
  assert.equal(report.headline, 'Giornata a metà: pasti sotto l\'obiettivo');
  assert.match(report.action.text, /Oggi aggiungi uno spuntino a metà pomeriggio \(circa 300 kcal\)/);

  const off = composeFocusV5Report({
    periodId: 'ieri',
    horizon: 'oggi',
    score: 0.2,
    actionPillar: 'alimentazione',
    safety: { signals: [] },
    pillars: [{ id: 'alimentazione', status: 'off_track', value: 0.2, active: true, keyFact: '2800 kcal · 500 sopra' }],
    actionClose: { unit: 'kcal', minimum: 200, phrase: 'togli circa 200 kcal dal pranzo' },
  });
  assert.equal(off.headline, 'Giornata fuori rotta: pasti sopra l\'obiettivo');
  assert.match(off.action.text, /Oggi togli circa 200 kcal dal pranzo/);

  const on = composeFocusV5Report({
    periodId: 'settimana',
    horizon: 'questa settimana',
    score: 0.9,
    actionPillar: 'movimento',
    safety: { signals: [] },
    pillars: [{ id: 'movimento', status: 'on_track', value: 0.9, active: true, keyFact: 'in linea' }],
  });
  assert.equal(on.headline, 'Settimana sulla rotta: movimento in linea');
});
