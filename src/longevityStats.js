import { addDays } from './calendarDateUtils';

export function scoreFromHistoryRecord(r) {
  if (typeof r?.score === 'number' && !Number.isNaN(r.score)) return r.score;
  if (typeof r?.masterScore === 'number' && !Number.isNaN(r.masterScore)) return r.masterScore;
  return null;
}

export function buildScoreDateMap(history) {
  const byDate = new Map();
  if (!Array.isArray(history)) return byDate;
  for (const r of history) {
    const key = r?.date;
    const s = scoreFromHistoryRecord(r);
    if (key && s != null) byDate.set(key, s);
  }
  return byDate;
}

/**
 * Media punteggi su `daysLength` giorni di calendario consecutivi.
 * La fine del periodo è `addDays(anchorDate, -offsetDays)` (1 = periodo che termina “ieri” rispetto all’anchor).
 * Se `liveTodayScore` è valorizzato, per il giorno uguale ad `anchorDate` si usa quello; con `null` solo storico.
 */
export function getAverageForPeriod(history, daysLength, offsetDays, anchorDate, liveTodayScore) {
  if (!anchorDate || daysLength < 1) return null;
  const live =
    typeof liveTodayScore === 'number' && !Number.isNaN(liveTodayScore)
      ? liveTodayScore
      : null;
  const byDate = buildScoreDateMap(history);
  const periodEnd = addDays(anchorDate, -offsetDays);

  if (daysLength === 1) {
    if (offsetDays === 0) {
      return live != null ? live : null;
    }
    const s = byDate.get(periodEnd);
    return s != null && !Number.isNaN(s) ? s : null;
  }

  const values = [];
  for (let h = 0; h < daysLength; h++) {
    const dayStr = addDays(periodEnd, -h);
    if (dayStr === anchorDate) {
      if (live != null) values.push(live);
    } else if (byDate.has(dayStr)) {
      values.push(byDate.get(dayStr));
    }
  }
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/** Media su finestra che termina ieri (anchor−1), solo storico — il giorno tracker non entra. */
export function calculateConsolidatedAverageScore(days, anchorDate, scoreHistory) {
  const raw = getAverageForPeriod(scoreHistory, days, 1, anchorDate, null);
  if (raw == null) return null;
  return Math.round(raw);
}

export function calculateProjectedAge(age, score) {
  if (!age || typeof age !== 'number' || typeof score !== 'number') return null;
  const maxAge = 100;
  const baseAge = 85;
  const minAge = age + age * 0.1;

  if (score >= 50) {
    return baseAge + ((score - 50) / 50) * (maxAge - baseAge);
  }
  return minAge + (score / 50) * (baseAge - minAge);
}

/**
 * Paragrafo opzionale per il system prompt Kentu AI (composizione corporea + longevità).
 * Gestisce valori mancanti senza placeholder vuoti.
 */
export function buildKentuAiVitalsContextParagraph({
  weightKg,
  bodyFatPct,
  projectedAge,
  avgScore30,
  avgScore7,
  longevityMasterScoreFallback,
}) {
  const vitals = [];
  if (weightKg != null && Number.isFinite(Number(weightKg))) {
    vitals.push(`Peso ${Number(weightKg).toFixed(1)} kg`);
  }
  const bfRaw = bodyFatPct != null && bodyFatPct !== '' ? Number(bodyFatPct) : NaN;
  if (Number.isFinite(bfRaw)) {
    vitals.push(`Massa grassa ${bfRaw.toFixed(1)}%`);
  }

  let longevityBit = '';
  if (projectedAge != null && Number.isFinite(Number(projectedAge))) {
    longevityBit = ` Età Proiettata attuale: ${Number(projectedAge).toFixed(1)} anni (trend basato sugli ultimi giorni consolidati, oggi escluso).`;
  } else if (avgScore30 != null) {
    longevityBit = ` Punteggio longevità medio (ultimi ~30 giorni consolidati, oggi escluso): ${avgScore30}/100.`;
  } else if (avgScore7 != null) {
    longevityBit = ` Punteggio longevità medio (ultimi ~7 giorni consolidati, oggi escluso): ${avgScore7}/100.`;
  } else if (
    longevityMasterScoreFallback != null &&
    Number.isFinite(Number(longevityMasterScoreFallback))
  ) {
    longevityBit = ` Punteggio longevità (snapshot giorno in vista): ${Math.round(Number(longevityMasterScoreFallback))}/100.`;
  }

  const vitalsLine =
    vitals.length > 0 ? `Dati vitali attuali: ${vitals.join(', ')}.` : '';

  if (!vitalsLine && !longevityBit) return '';

  const tail =
    ' Usa questi dati storici per personalizzare i tuoi consigli su nutrizione e stile di vita.';
  return `${vitalsLine}${longevityBit}${tail}`.trim();
}

/**
 * Blocco testuale per il system prompt Kentu AI: twin metabolico e ricomposizione FM/FFM
 * (output di `calculateMetabolicVariance`). Stringa vuota se i dati non bastano.
 */
export function buildKentuAiMetabolicRecompositionContext(metabolicVariance) {
  if (!metabolicVariance || typeof metabolicVariance !== 'object') return '';

  const w = Number(metabolicVariance.actualWeightDelta);
  const th = Number(metabolicVariance.theoreticalWeightDelta);
  const v = Number(metabolicVariance.variance);
  if (!Number.isFinite(w) || !Number.isFinite(th) || !Number.isFinite(v)) return '';

  const fmt = (n) => Number(n).toFixed(2);

  const fatD = metabolicVariance.actualFatDelta;
  const leanD = metabolicVariance.actualLeanDelta;
  const hasFmFfm =
    fatD != null &&
    leanD != null &&
    Number.isFinite(Number(fatD)) &&
    Number.isFinite(Number(leanD));

  if (hasFmFfm) {
    return `=== ANALISI RICOMPOSIZIONE CORPOREA (Ultime due misurazioni) ===
- Variazione Peso Totale: ${fmt(w)} kg
- Variazione Massa Grassa (FM): ${fmt(fatD)} kg
- Variazione Massa Magra (FFM/Acqua): ${fmt(leanD)} kg
- Calo Teorico Atteso (da deficit kcal): ${fmt(th)} kg
- Discrepanza Metabolica: ${fmt(v)} kg

DIRETTIVE SPECIALI PER L'IA SULLA RICOMPOSIZIONE:
1. Non lodare mai la perdita di peso se la Variazione Massa Magra (FFM) è fortemente negativa (catabolismo). In tal caso, avvisa l'utente e consiglia di aumentare proteine, idratazione o allenamento di resistenza.
2. Se la Massa Grassa scende ma il Peso Totale è stabile (ricomposizione), congratulati esplicitamente, spiegando che l'allenamento sta preservando il muscolo.
3. Se la Discrepanza Metabolica è molto positiva (> 0.5kg) e l'utente chiede perché non dimagrisce, spiegagli il concetto di "adattamento metabolico" o di "ritenzione idrica da stress/cortisolo", suggerendo un ricalcolo del TDEE o tecniche di scarico dello stress.`;
  }

  return `=== ANDAMENTO PESO E BILANCIO ENERGETICO (Ultime due misurazioni, senza scomposizione FM/FFM) ===
- Variazione Peso Osservata: ${fmt(w)} kg
- Variazione Teorica Attesa (da deficit/surplus kcal cumulato): ${fmt(th)} kg
- Discrepanza Metabolica: ${fmt(v)} kg

DIRETTIVA: Se l'utente chiede perché il peso non scende nonostante il deficit, spiega in modo sobrio possibili cause (adattamento metabolico, ritenzione idrica, errori di stima del fabbisogno) e suggerisci di rivalutare il TDEE e lo stress/sonno, senza inventare valori oltre ai numeri forniti.`;
}
