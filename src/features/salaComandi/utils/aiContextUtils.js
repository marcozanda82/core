import {
  addDays,
  getLogFromStoricoTree,
  normalizeLogData,
  buildSmartMealPhysioContextSnippet,
  calorieStrategyShortLabelIt,
  normalizeCalorieStrategyTarget,
  normalizeMealFoodsArray,
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

/**
 * Estrae [MEAL_PROPOSAL:{...}] dalla risposta AI e restituisce JSON validato + testo senza il blocco.
 */
export function extractAndStripMealProposal(rawText) {
  const text = rawText == null ? '' : String(rawText);
  const tag = '[MEAL_PROPOSAL:';
  const i = text.indexOf(tag);
  if (i === -1) return { stripped: text, proposal: null };
  const jsonStart = i + tag.length;
  if (text[jsonStart] !== '{') return { stripped: text, proposal: null };
  let depth = 0;
  let j = jsonStart;
  for (; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        j++;
        break;
      }
    }
  }
  if (depth !== 0) return { stripped: text, proposal: null };
  let k = j;
  while (k < text.length && /\s/.test(text[k])) k++;
  const endBlock = k < text.length && text[k] === ']' ? k + 1 : j;
  const jsonStr = text.slice(jsonStart, j);
  let proposal = null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      proposal = {
        title: parsed.title != null ? String(parsed.title) : undefined,
        timeString: parsed.timeString != null ? String(parsed.timeString) : undefined,
        items: parsed.items.map((row, idx) => ({
          id: row.id != null ? String(row.id) : `ing_${idx}`,
          name: String(row.name || row.desc || 'Alimento').trim(),
          qty: Number(row.qty ?? row.weight ?? row.qta) > 0 ? Number(row.qty ?? row.weight ?? row.qta) : 100,
          estKcal: Number.isFinite(Number(row.estKcal ?? row.kcal)) ? Number(row.estKcal ?? row.kcal) : undefined,
          estPro: Number.isFinite(Number(row.estPro ?? row.prot)) ? Number(row.estPro ?? row.prot) : undefined,
          estCar: Number.isFinite(Number(row.estCar ?? row.carb)) ? Number(row.estCar ?? row.carb) : undefined,
          estFat: Number.isFinite(Number(row.estFat ?? row.fat ?? row.fatTotal)) ? Number(row.estFat ?? row.fat ?? row.fatTotal) : undefined,
        })),
      };
    }
  } catch {
    proposal = null;
  }
  const stripped = (text.slice(0, i) + text.slice(endBlock)).replace(/\s+/g, ' ').trim();
  return { stripped, proposal };
}

/** Normalizza orario per input type="time" (HH:mm). */
export function normalizeDailyPlanTimeForInput(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'null') return '';
  const colon = s.match(/^(\d{1,2})\s*[:.h]\s*(\d{2})$/i);
  if (colon) {
    const h = Math.min(23, Math.max(0, parseInt(colon[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(colon[2], 10)));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const n = parseFloat(s.replace(',', '.'));
  if (Number.isFinite(n)) {
    const h = Math.floor(n) % 24;
    const frac = n % 1;
    const min = Math.min(59, Math.round(frac * 60) % 60);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return '';
}

export function normalizeDailyPlanFromToken(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const rawActivities = Array.isArray(parsed.activities) ? parsed.activities : [];
  const activities = rawActivities
    .map((a, idx) => {
      const timeNorm = normalizeDailyPlanTimeForInput(a?.time != null ? String(a.time) : '') || '12:00';
      const desc = String(a?.desc ?? a?.title ?? '').trim() || `Attività ${idx + 1}`;
      return { time: timeNorm, desc };
    })
    .filter((a) => a.desc);
  if (activities.length === 0) return null;
  const targetNorm = normalizeCalorieStrategyTarget(parsed.target);
  const target = targetNorm || 'pari';
  let workoutTime = null;
  if (parsed.workoutTime != null) {
    const ws = String(parsed.workoutTime).trim();
    if (ws && ws.toLowerCase() !== 'null') {
      const wn = normalizeDailyPlanTimeForInput(ws);
      if (wn) workoutTime = wn;
    }
  }
  let ghostMeals = [];
  if (Array.isArray(parsed.ghostMeals)) {
    ghostMeals = parsed.ghostMeals
      .map((g) => {
        const mealType = String(g?.mealType || 'pranzo').toLowerCase().split('_')[0];
        const timeNorm = normalizeDailyPlanTimeForInput(g?.time != null ? String(g.time) : '') || '12:00';
        const title = String(g?.title || 'Pasto pianificato').trim();
        const microDesc = String(g?.microDesc || '').trim();
        const draftFoods = Array.isArray(g?.draftFoods)
          ? g.draftFoods.map((x) => String(x).trim()).filter(Boolean)
          : [];
        if (!title) return null;
        const row = {
          mealType,
          time: timeNorm,
          title,
          microDesc,
          draftFoods,
          foods: normalizeMealFoodsArray(g?.foods),
        };
        return row;
      })
      .filter(Boolean);
  }
  return { target, workoutTime, activities, ghostMeals };
}

/**
 * Estrae [DAILY_PLAN:{...}] dalla risposta AI e restituisce JSON validato + testo senza il blocco.
 */
export function extractAndStripDailyPlan(rawText) {
  const text = rawText == null ? '' : String(rawText);
  const tag = '[DAILY_PLAN:';
  const i = text.indexOf(tag);
  if (i === -1) return { stripped: text, plan: null };
  const jsonStart = i + tag.length;
  if (text[jsonStart] !== '{') return { stripped: text, plan: null };
  let depth = 0;
  let j = jsonStart;
  for (; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        j++;
        break;
      }
    }
  }
  if (depth !== 0) return { stripped: text, plan: null };
  let k = j;
  while (k < text.length && /\s/.test(text[k])) k++;
  const endBlock = k < text.length && text[k] === ']' ? k + 1 : j;
  const jsonStr = text.slice(jsonStart, j);
  let plan = null;
  try {
    const parsed = JSON.parse(jsonStr);
    plan = normalizeDailyPlanFromToken(parsed);
  } catch {
    plan = null;
  }
  const stripped = (text.slice(0, i) + text.slice(endBlock)).replace(/\s+/g, ' ').trim();
  return { stripped, plan };
}

export function parseSmartCompletionFoodsPayload(obj) {
  const foods = obj?.foods;
  if (!Array.isArray(foods) || foods.length === 0) throw new Error('foods vuoto o non valido');
  return foods
    .map((f) => ({
      desc: String(f?.desc ?? f?.name ?? '').trim(),
      weight: Math.max(5, Math.round(Number(f?.weight ?? f?.qty) || 100)),
    }))
    .filter((f) => f.desc.length > 0)
    .slice(0, 20);
}

export function parseSmartCompletionJsonFromAiResponse(raw) {
  const aiText = String(raw || '').trim();
  let obj = null;
  const match = aiText.match(/\[COMPLETION_JSON:\s*(\{[\s\S]*?\})\s*\]/i);
  if (!match) {
    console.log('AI Response:', aiText);
  } else {
    try {
      obj = JSON.parse(match[1]);
    } catch {
      obj = null;
    }
  }
  if (!obj) {
    const i0 = aiText.indexOf('{');
    const i1 = aiText.lastIndexOf('}');
    if (i0 < 0 || i1 <= i0) throw new Error('Token COMPLETION_JSON non trovato o JSON non estraibile');
    try {
      obj = JSON.parse(aiText.slice(i0, i1 + 1));
    } catch (e) {
      throw new Error(e?.message ? String(e.message) : 'JSON non valido (fallback brace)');
    }
  }
  return parseSmartCompletionFoodsPayload(obj);
}
