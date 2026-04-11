/**
 * Indice di ottimizzazione giornaliero (0–100%) da diario + target.
 * @param {{ kcalConsumed?: number, proteinConsumed?: number, sleepHours?: number }} dailyData
 * @param {{ kcal?: number, prot?: number }} targets — TDEE / proteine target
 * @returns {{ score: number, limitingFactor: 'sleep' | 'protein' | 'calories' | 'perfect' }}
 */
export function calculateOptimizationIndex(dailyData, targets) {
  const tdee = Math.max(1, Number(targets?.kcal) || 2000);
  const kcal = Math.max(0, Number(dailyData?.kcalConsumed) || 0);
  const protTarget = Math.max(1, Number(targets?.prot) || 150);
  const prot = Math.max(0, Number(dailyData?.proteinConsumed) || 0);

  let sleepH = Number(dailyData?.sleepHours);
  if (!Number.isFinite(sleepH) || sleepH < 0) sleepH = 0;

  let penaltyCal = 0;
  if (tdee > 0 && kcal >= 0) {
    const devPct = (Math.abs(kcal - tdee) / tdee) * 100;
    if (devPct > 10) {
      penaltyCal = Math.min(25, ((devPct - 10) / 40) * 25);
    }
  }

  let penaltyProt = 0;
  if (prot < protTarget) {
    const deficitRatio = (protTarget - prot) / protTarget;
    penaltyProt = Math.min(20, deficitRatio * 20);
  }

  let penaltySleep = 0;
  if (sleepH < 7) {
    const missingHalfHours = (7 - sleepH) / 0.5;
    penaltySleep = Math.min(30, missingHalfHours * 5);
  }

  const raw = 100 - penaltyCal - penaltyProt - penaltySleep;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const maxP = Math.max(penaltyCal, penaltyProt, penaltySleep);
  let limitingFactor = 'perfect';
  if (maxP > 0.01) {
    if (penaltyCal >= penaltyProt && penaltyCal >= penaltySleep) limitingFactor = 'calories';
    else if (penaltyProt >= penaltySleep) limitingFactor = 'protein';
    else limitingFactor = 'sleep';
  }

  return { score, limitingFactor };
}

const COACH_BY_FACTOR = {
  sleep:
    'Il motore gira bene, ma il recupero è basso. Per tenere a bada lo stress serale e favorire la riparazione cellulare, punta a dormire di più stasera.',
  protein:
    'Termodinamica sotto controllo, ma siamo in deficit proteico. Stiamo rischiando di smontare massa magra. Aggiungi una fonte proteica solida al prossimo pasto.',
  calories:
    'Oggi i giri del motore sono fuori asse rispetto al budget energetico. Niente panico: riallineiamo l\'Autopilota domani per ripristinare l\'efficienza.',
  perfect:
    'Efficienza di sistema al massimo. Termodinamica, struttura e recupero sono perfettamente allineati. Continua così.',
};

export function optimizationCoachMessage(limitingFactor) {
  return COACH_BY_FACTOR[limitingFactor] || COACH_BY_FACTOR.perfect;
}

/** Estrae kcal/prot totali e ore sonno da un dailyLog giornaliero. */
export function buildOptimizationDailyDataFromLog(dailyLog) {
  const log = Array.isArray(dailyLog) ? dailyLog : [];
  let kcalConsumed = 0;
  let proteinConsumed = 0;
  for (const e of log) {
    if (!e) continue;
    if (e.type === 'food' || e.type === 'recipe' || e.type === 'meal') {
      kcalConsumed += Number(e.kcal || e.cal || 0) || 0;
      proteinConsumed += Number(e.prot || e.proteine || 0) || 0;
    }
  }
  const sleep = log.find((x) => x && x.type === 'sleep');
  const h = Number(sleep?.hours ?? sleep?.duration ?? 0);
  const sleepHours = Number.isFinite(h) && h > 0 ? h : 0;
  return { kcalConsumed, proteinConsumed, sleepHours };
}
