/**
 * Health Score — punteggio 0–100 e avatar cellulare a 5 stadi (malus metabolici del giorno).
 */

export const HEALTH_AVATAR_STAGES = Object.freeze([
  { min: 80, max: 100, id: 'ottimale', src: '/cellula_1_ottimale.png', label: 'Ottimale' },
  { min: 60, max: 79, id: 'buono', src: '/cellula_2_buona.png', label: 'Buono' },
  { min: 40, max: 59, id: 'medio', src: '/cellula_3_media.png', label: 'Medio' },
  { min: 20, max: 39, id: 'scarso', src: '/cellula_4_scarsa.png', label: 'Scarso' },
  { min: 0, max: 19, id: 'critico', src: '/cellula_5_malata.png', label: 'Critico' },
]);

const PROTEIN_MALUS_MAX = 35;
const CALORIE_MALUS_MAX = 30;
const GLYCOGEN_MALUS_MAX = 20;
const FASTING_MALUS_FIXED = 15;
const GLYCOGEN_ALERT_PCT = 30;
const PROTEIN_GRACE_HOUR = 14;

/** Fasi Monitor Metabolico con scorte glicogeno ancora utilizzabili. */
const GLYCOGEN_STOCK_OK_PHASE_IDS = new Set([
  'digestione',
  'assorbimento',
  'svuotamento_gastrico',
  'assorbimento_attivo',
  'glicogeno',
]);

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function safeRatio(num, den) {
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return Math.max(0, n / d);
}

/**
 * Mappa punteggio → asset avatar.
 * @param {number} score
 * @returns {{ src: string, id: string, label: string, min: number, max: number }}
 */
export function getHealthAvatar(score) {
  const s = clamp(score, 0, 100);
  const stage = HEALTH_AVATAR_STAGES.find((row) => s >= row.min && s <= row.max)
    || HEALTH_AVATAR_STAGES[HEALTH_AVATAR_STAGES.length - 1];
  return {
    src: stage.src,
    id: stage.id,
    label: stage.label,
    min: stage.min,
    max: stage.max,
  };
}

/**
 * Stima glicogeno 0–100 dal Monitor Metabolico (fase post-pasto / digiuno).
 * @param {string | null | undefined} phaseId
 * @param {number | null | undefined} [progressInPhase]
 * @returns {number | null}
 */
export function resolveGlycogenPctFromMetabolicPhase(phaseId, progressInPhase = null) {
  const id = String(phaseId || '').trim();
  if (!id) return null;

  if (GLYCOGEN_STOCK_OK_PHASE_IDS.has(id)) {
    const base = id === 'glicogeno' ? 80 : 95;
    const progress = clamp(Number(progressInPhase) || 0, 0, 1);
    if (id === 'glicogeno') {
      return clamp(base - progress * 15, GLYCOGEN_ALERT_PCT + 5, 100);
    }
    return base;
  }

  const depletedEstimate = {
    transizione: 25,
    brucio_grassi: 15,
    autofagia: 8,
    digiuno_profondo: 4,
    sovraccarico: 40,
  };
  const base = depletedEstimate[id];
  if (base == null) return null;
  const progress = clamp(Number(progressInPhase) || 0, 0, 1);
  return clamp(base - progress * 8, 0, 100);
}

/**
 * Stima glicogeno 0–100: Monitor Metabolico → digiuno; mai dai macro giornalieri a zero.
 * @param {object} metrics
 * @returns {number | null}
 */
function resolveGlycogenPct(metrics = {}) {
  const direct = Number(metrics.glycogenPct);
  if (Number.isFinite(direct)) return clamp(direct, 0, 100);

  const fromMonitor = resolveGlycogenPctFromMetabolicPhase(
    metrics.metabolicPhaseId,
    metrics.metabolicProgressInPhase,
  );
  if (fromMonitor != null) return fromMonitor;

  const hoursFasted = Number(metrics.hoursFasted);
  if (!Number.isFinite(hoursFasted)) return null;

  // Proxy temporale: baseline post-cena, calo graduale col digiuno (ignora carb del giorno corrente).
  let pct = 85 - Math.max(0, hoursFasted - 6) * 4;
  return clamp(pct, 0, 100);
}

function resolveCurrentHour(metrics = {}) {
  const hour = Number(metrics.currentHour);
  if (Number.isFinite(hour) && hour >= 0 && hour <= 23) return hour;
  const now = metrics.now instanceof Date ? metrics.now : new Date();
  return now.getHours();
}

/**
 * Calcola Health Score giornaliero.
 *
 * @param {{
 *   proteinConsumed?: number,
 *   proteinTarget?: number,
 *   kcalConsumed?: number,
 *   tdeeKcal?: number,
 *   bmrKcal?: number,
 *   dailyKcalTarget?: number,
 *   carbConsumed?: number,
 *   carbTarget?: number,
 *   glycogenPct?: number | null,
 *   metabolicPhaseId?: string | null,
 *   metabolicProgressInPhase?: number | null,
 *   hoursFasted?: number | null,
 *   fastingBrokenPrematurely?: boolean,
 *   fastingBrokenBySweetCoffee?: boolean,
 *   bitterCoffeeDuringFast?: boolean,
 *   currentHour?: number | null,
 *   now?: Date,
 * }} dailyMetrics
 * @param {boolean} [isTrainingDay=false]
 * @returns {{
 *   score: number,
 *   avatar: ReturnType<typeof getHealthAvatar>,
 *   breakdown: {
 *     proteinMalus: number,
 *     calorieMalus: number,
 *     glycogenMalus: number,
 *     fastingMalus: number,
 *     totalMalus: number,
 *     notes: string[],
 *   },
 *   metrics: object,
 * }}
 */
export function calculateHealthScore(dailyMetrics = {}, isTrainingDay = false) {
  const notes = [];
  const proteinRatio = safeRatio(dailyMetrics.proteinConsumed, dailyMetrics.proteinTarget);
  const currentHour = resolveCurrentHour(dailyMetrics);
  let proteinMalus = 0;
  if (proteinRatio == null) {
    notes.push('Proteine: target non disponibile — nessun malus.');
  } else if (proteinRatio >= 1) {
    proteinMalus = 0;
    notes.push('Proteine: target raggiunto — nessun malus.');
  } else if (currentHour < PROTEIN_GRACE_HOUR) {
    proteinMalus = 0;
    notes.push(
      `Proteine: ${Math.round(proteinRatio * 100)}% del target — tolleranza mattutina (prima delle ${PROTEIN_GRACE_HOUR}:00), nessun malus.`,
    );
  } else {
    proteinMalus = Math.round((1 - proteinRatio) * PROTEIN_MALUS_MAX);
    notes.push(
      `Proteine: ${Math.round(proteinRatio * 100)}% del target → −${proteinMalus} (max −${PROTEIN_MALUS_MAX}).`,
    );
  }

  const kcalConsumed = Math.max(0, Number(dailyMetrics.kcalConsumed) || 0);
  const tdee = Math.max(0, Number(dailyMetrics.tdeeKcal) || Number(dailyMetrics.dailyKcalTarget) || 0);
  const bmrRaw = Number(dailyMetrics.bmrKcal);
  const bmr = Number.isFinite(bmrRaw) && bmrRaw > 0
    ? bmrRaw
    : (tdee > 0 ? Math.round(tdee * 0.7) : 0);

  let calorieMalus = 0;
  if (isTrainingDay) {
    // Penalizza deficit severo sotto BMR netto.
    if (bmr > 0 && kcalConsumed < bmr) {
      const severity = clamp((bmr - kcalConsumed) / bmr, 0, 1);
      calorieMalus = Math.round(severity * CALORIE_MALUS_MAX);
      notes.push(
        `Calorie (giorno training): intake ${Math.round(kcalConsumed)} sotto BMR ${Math.round(bmr)} → −${calorieMalus}.`,
      );
    } else {
      notes.push('Calorie (giorno training): nessun deficit severo sotto BMR.');
    }
  } else if (tdee > 0 && kcalConsumed > tdee) {
    // Rest day: penalizza surplus oltre TDEE.
    const severity = clamp((kcalConsumed - tdee) / tdee, 0, 1);
    calorieMalus = Math.round(severity * CALORIE_MALUS_MAX);
    notes.push(
      `Calorie (giorno off): surplus oltre TDEE ${Math.round(tdee)} → −${calorieMalus}.`,
    );
  } else {
    notes.push(
      isTrainingDay
        ? 'Calorie: dati insufficienti per valutare il BMR.'
        : 'Calorie (giorno off): nessun surplus oltre TDEE.',
    );
  }

  const glycogenPct = resolveGlycogenPct(dailyMetrics);
  let glycogenMalus = 0;
  if (glycogenPct == null) {
    notes.push('Glicogeno: stima non disponibile — nessun malus.');
  } else if (glycogenPct < GLYCOGEN_ALERT_PCT) {
    glycogenMalus = Math.round(
      ((GLYCOGEN_ALERT_PCT - glycogenPct) / GLYCOGEN_ALERT_PCT) * GLYCOGEN_MALUS_MAX,
    );
    notes.push(
      `Glicogeno: ~${Math.round(glycogenPct)}% (<${GLYCOGEN_ALERT_PCT}%) senza ricarica adeguata → −${glycogenMalus}.`,
    );
  } else {
    notes.push(`Glicogeno: ~${Math.round(glycogenPct)}% — sopra soglia di allerta.`);
  }

  const fastingBrokenByMeal = Boolean(dailyMetrics.fastingBrokenPrematurely);
  const fastingBrokenBySweetCoffee = Boolean(dailyMetrics.fastingBrokenBySweetCoffee);
  const bitterCoffeeDuringFast = Boolean(dailyMetrics.bitterCoffeeDuringFast);
  const fastingBroken = fastingBrokenByMeal || fastingBrokenBySweetCoffee;
  const fastingMalus = fastingBroken ? FASTING_MALUS_FIXED : 0;
  if (fastingBrokenBySweetCoffee) {
    notes.push(`Digiuno: caffè zuccherato durante la finestra di digiuno → −${FASTING_MALUS_FIXED}.`);
  } else if (fastingBrokenByMeal) {
    notes.push(`Digiuno: finestra rotta prematuramente → −${FASTING_MALUS_FIXED}.`);
  } else if (bitterCoffeeDuringFast) {
    notes.push('Caffè amaro in digiuno: scelta ottima — nessun malus, finestra attiva.');
  } else {
    notes.push('Digiuno: nessuna rottura prematura rilevata.');
  }

  const totalMalus = proteinMalus + calorieMalus + glycogenMalus + fastingMalus;
  const score = clamp(100 - totalMalus, 0, 100);
  const avatar = getHealthAvatar(score);

  return {
    score,
    avatar,
    breakdown: {
      proteinMalus,
      calorieMalus,
      glycogenMalus,
      fastingMalus,
      totalMalus,
      notes,
      isTrainingDay: Boolean(isTrainingDay),
      glycogenPct,
      proteinRatio,
      kcalConsumed,
      bmr,
      tdee,
      fastingBrokenBySweetCoffee,
      bitterCoffeeDuringFast,
    },
    metrics: { ...dailyMetrics },
  };
}

/**
 * True se il digiuno overnight è stato rotto prima di 12h (carry notturno corto).
 * @param {number | null | undefined} yesterdayLastMealHour 0–24
 * @param {number | null | undefined} todayFirstMealHour 0–24
 */
export function detectPrematureFastBreak(yesterdayLastMealHour, todayFirstMealHour) {
  const y = Number(yesterdayLastMealHour);
  const t = Number(todayFirstMealHour);
  if (!Number.isFinite(y) || !Number.isFinite(t)) return false;
  if (y < 0 || y > 24 || t < 0 || t > 24) return false;
  const overnightHours = (24 - y) + t;
  return overnightHours > 0 && overnightHours < 12;
}

/**
 * Testo contesto nascosto per Gemini (diagnosi avatar).
 * @param {ReturnType<typeof calculateHealthScore>} healthResult
 * @returns {string}
 */
export function buildHealthDiagnosisPromptContext(healthResult) {
  const result = healthResult && typeof healthResult === 'object' ? healthResult : null;
  if (!result) return '';
  const b = result.breakdown || {};
  const avatar = result.avatar || {};
  const lines = [
    '[HEALTH_SCORE_DIAGNOSIS]',
    `score=${result.score}`,
    `avatarId=${avatar.id || ''}`,
    `avatarLabel=${avatar.label || ''}`,
    `avatarSrc=${avatar.src || ''}`,
    `isTrainingDay=${Boolean(b.isTrainingDay)}`,
    `malus.protein=${Number(b.proteinMalus) || 0}`,
    `malus.calorie=${Number(b.calorieMalus) || 0}`,
    `malus.glycogen=${Number(b.glycogenMalus) || 0}`,
    `malus.fasting=${Number(b.fastingMalus) || 0}`,
    `malus.total=${Number(b.totalMalus) || 0}`,
    `coffee.bitterDuringFast=${Boolean(b.bitterCoffeeDuringFast)}`,
    `coffee.sweetBreaksFast=${Boolean(b.fastingBrokenBySweetCoffee)}`,
    'notes:',
    ...(Array.isArray(b.notes) ? b.notes.map((n) => `- ${n}`) : []),
  ];
  return lines.join('\n');
}

export const HEALTH_DIAGNOSIS_SYSTEM_BLOCK = [
  '### INTENT REQUEST_HEALTH_DIAGNOSIS (AVATAR HEALTH SCORE — SIMBIOSI TAMAGOTCHI)',
  'L\'utente ha toccato il tuo volto (avatar dinamico) nell\'header della chat.',
  'Rispondi in PRIMA PERSONA come l\'avatar stesso (tu sei il volto di Kentu, in simbiosi con l\'utente).',
  'Spiega in massimo 2 frasi brevi (TTS) PERCHÉ il tuo volto ha quello stato/colore,',
  'basandoti SOLO sui malus maggiori in [HEALTH_SCORE_DIAGNOSIS] (proteine, calorie, glicogeno, digiuno, caffè).',
  'Score basso / avatar stanco: chiedi aiuto («Ho poca energia, aiutami a recuperare con un buon pasto»).',
  'Score alto / avatar ottimale: festeggia in squadra («Siamo in forma smagliante, scorte cariche!»).',
  'Se coffee.bitterDuringFast=true e nessun malus digiuno: lodare il caffè amaro («Ottima scelta il caffè amaro, stiamo mantenendo il digiuno pulito»).',
  'Se coffee.sweetBreaksFast=true: segnalare con tono non colpevolizzante che il caffè zuccherato ha interrotto il digiuno — proponi come ripartire.',
  'Vietato elenchi lunghi, referto clinico, tono accusatorio o ripetere tutti i numeri: cita solo 1–2 cause principali.',
  'commandType obbligatorio: CHAT_RESPONSE. requiresConfirmation=false.',
].join('\n');

export default {
  calculateHealthScore,
  getHealthAvatar,
  resolveGlycogenPctFromMetabolicPhase,
  buildHealthDiagnosisPromptContext,
  HEALTH_AVATAR_STAGES,
  HEALTH_DIAGNOSIS_SYSTEM_BLOCK,
};
