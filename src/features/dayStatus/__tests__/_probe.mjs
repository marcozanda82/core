import { loadFocusDiaryRealOct27 } from '../../kentuFocus/__tests__/fixtures/focusDiaryRealOct27.js';
import { getTrackerDayNode } from '../../kentuFocus/lab/buildFocusLabDossier.js';
import { collectDayLogForNutrition } from '../../kentuFocus/normalize/normalizeFoodEvents.js';
import { getDayStatus, detectDayGaps } from '../dayStatus.js';

const { fullHistory, userTargets } = loadFocusDiaryRealOct27();
const keys = Object.keys(fullHistory).filter((k) => k.includes('2026-10-2') || k.includes('2026-10-3'));
console.log('keys', keys);
for (const date of ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) {
  const node = getTrackerDayNode(fullHistory, date);
  const log = collectDayLogForNutrition(node);
  const types = {};
  for (const item of log) {
    const t = item?.type || '(none)';
    types[t] = (types[t] || 0) + 1;
  }
  console.log(date, 'node', Boolean(node), 'logKeys', node ? Object.keys(node) : null, 'n', log.length, types);
  console.log(' status', getDayStatus(date, { today: '2026-11-10', fullHistory }));
  console.log(' gaps', detectDayGaps(date, { fullHistory, targetKcal: userTargets.kcal }));
}

const date = '2026-11-08';
const history = { [`trackerStorico_${date}`]: { log: [{ type: 'food', id: 'a', name: 'a', mealType: 'cena', mealTime: 20, kcal: 700 }] } };
console.log('closed?', getDayStatus(date, {
  today: '2026-11-10',
  fullHistory: history,
  records: { [date]: { confirmed: true, approximate: false, paused: false, confirmedAt: 10 } },
}));
