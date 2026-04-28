import {
  addDays,
  getLogFromStoricoTree,
  normalizeLogData,
  buildSmartMealPhysioContextSnippet,
  calorieStrategyShortLabelIt,
} from '../../../coreEngine';

/** Rimuove il prefisso iniettato per l'API dalla cronologia conversazione inviata all'API. */
export function stripInvisibleContextFromVisibleUserText(text) {
  if (text == null || typeof text !== 'string') return text;
  return text
    .replace(/\[CONTEXT_LIVE:[^\]]*\]\s*/gi, '')
    .replace(/\[CONTESTO DI SISTEMA INVISIBILE:[^\]]*\]\s*/gi, '')
    .trim();
}

/**
 * Ultimi N alimenti/ricette distinti dai log degli ultimi `numDays` giorni (più recenti per primi).
 */
export function collectDispensaProbableFoods(fullHistory, anchorDateStr, maxDistinct, numDays) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr || maxDistinct <= 0) return 'n/d';
  const seen = new Set();
  const out = [];
  const days = Math.max(1, Math.min(14, numDays || 4));
  for (let d = 0; d < days; d++) {
    const dStr = addDays(anchorDateStr, -d);
    const rawLog = getLogFromStoricoTree(fullHistory, dStr) || [];
    const log = normalizeLogData(Array.isArray(rawLog) ? rawLog : Object.values(rawLog));
    for (let i = 0; i < log.length; i++) {
      const item = log[i];
      if (!item || (item.type !== 'food' && item.type !== 'recipe')) continue;
      const raw = (item.desc || item.name || '').trim();
      if (!raw) continue;
      const key = raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(raw.length > 48 ? `${raw.slice(0, 45)}…` : raw);
      if (out.length >= maxDistinct) return out.join(', ');
    }
  }
  return out.length ? out.join(', ') : 'nessun dato recente';
}

/**
 * Contesto live iniettato nell'ultimo messaggio utente verso l'API (non mostrato in UI se non salvato nel testo).
 */
export function getInvisibleContext({
  bodyBatteryPercent,
  dynamicDailyKcal,
  totali,
  userTargets,
  fullHistory,
  anchorDateStr,
  trainingWaveSnippet,
  mealTypeForSmart,
  dailyLogForSmart,
  kentuCalorieStrategy,
}) {
  const bb = Math.round(Number(bodyBatteryPercent) || 0);
  const dynK = Number(dynamicDailyKcal) || 0;
  const eatenK = Number(totali?.kcal) || 0;
  const kcalSurplus = eatenK > dynK ? Math.round(eatenK - dynK) : 0;
  const resKcal = Math.round(Math.max(0, dynK - eatenK));
  const kcalBalanceSnippet =
    kcalSurplus > 0 ? `SURPLUS +${kcalSurplus} kcal` : `Residuo: ${resKcal}kcal`;
  const tProt = Number(userTargets?.prot ?? 150);
  const tCarb = Number(userTargets?.carb ?? 200);
  const tFat = Number(userTargets?.fatTotal ?? userTargets?.fat ?? 65);
  const eProt = Number(totali?.prot) || 0;
  const eCarb = Number(totali?.carb) || 0;
  const eFat = Number(totali?.fatTotal ?? totali?.fat) || 0;
  const rProt = Math.max(0, Math.round((tProt - eProt) * 10) / 10);
  const rCarb = Math.max(0, Math.round((tCarb - eCarb) * 10) / 10);
  const rFat = Math.max(0, Math.round((tFat - eFat) * 10) / 10);
  const dispensa = collectDispensaProbableFoods(fullHistory, anchorDateStr, 10, 4);
  const nota =
    'L\'utente soffre di problemi di cortisolo alto quando chiede consigli sulla cena.';
  const wave = trainingWaveSnippet ? ` ${trainingWaveSnippet}` : '';
  const smartPhysio =
    mealTypeForSmart && dailyLogForSmart && userTargets
      ? buildSmartMealPhysioContextSnippet(mealTypeForSmart, dailyLogForSmart, userTargets)
      : '';
  const smartPart = smartPhysio ? ` Smart: ${smartPhysio}.` : '';
  const stratPart =
    kentuCalorieStrategy != null && String(kentuCalorieStrategy).trim() !== ''
      ? ` Strategia kcal oggi: ${calorieStrategyShortLabelIt(kentuCalorieStrategy)}.`
      : '';
  return `[CONTEXT_LIVE: BB: ${bb}%, ${kcalBalanceSnippet}, ${rProt}P/${rCarb}C/${rFat}F. Dispensa: ${dispensa}. Nota: ${nota}.${smartPart}${stratPart}${wave}]`;
}
