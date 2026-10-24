/**
 * Bussola preventiva Kentu Focus — «Le abitudini che stai costruendo».
 * Cardio per tutti; forza solo se documentata; priorità motivate (non NOVA-first).
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { normalizeFoodEvents, collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import { normalizeWorkoutEvents } from '../normalize/normalizeWorkoutEvents.js';

const MIN_FOOD_DAYS = 4;
const MIN_HABIT_DAYS = 3;
const MIN_SLEEP_NIGHTS = 4;
const HOURS_SPREAD_IRREGULAR = 1.5;
const BEDTIME_SPREAD_IRREGULAR_H = 1.5;
const ADULT_MODERATE_MIN = 150;
const ADULT_MODERATE_MAX = 300;
const ADULT_VIGOROUS_MIN = 75;

/** Fonti vegetali riconoscibili dal nome (euristica conservativa, non NOVA). */
const PLANT_NAME_RE = /\b(insalat\w*|verdure?|broccoli|spinac\w*|zucchine?|carot\w*|peperon\w*|cetriol\w*|melanzan\w*|fagiol\w*|lenticch\w*|ceci|pisell\w*|avocado|mela|mele|banan\w*|arancia|kiwi|fragol\w*|mirtill\w*|pera|uva|frutta|avena|fiocchi|riso\s+integr\w*|quinoa|pane\s+integr\w*|patate|patata)\b/i;

const DIRECTION = Object.freeze({
  favorable: 'favorable',
  correct: 'correct',
  watch: 'watch',
  insufficient: 'insufficient',
});

const DIRECTION_IT = Object.freeze({
  favorable: 'favorevole',
  correct: 'da correggere',
  watch: 'da osservare',
  insufficient: 'dati insufficienti',
});

const CARDIO_REFERENCE = 'Riferimento generale adulti: 150–300 min/sett. di attività aerobica moderata, oppure 75–150 min vigorosa, o combinazione equivalente.';

/**
 * @param {object|null|undefined} tags
 */
function readNovaGroup(tags) {
  if (!tags || typeof tags !== 'object') return null;
  const raw = tags.novaGroup ?? tags.nova ?? tags.NOVA ?? null;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} item
 */
function foodDisplayName(item) {
  return String(item?.name || item?.desc || item?.label || item?.foodName || '').trim();
}

/**
 * @param {string} periodId
 */
function resolveWindowDays(periodId) {
  return periodId === 'mese' ? 30 : 7;
}

/**
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 */
function collectWindowFoods(fullHistory, analysisDate, windowDays) {
  /** @type {Map<string, { name: string, days: Set<string>, occasions: number, nova4Days: Set<string>, plantDays: Set<string>, taggedNova: boolean }>} */
  const byKey = new Map();
  let daysWithFood = 0;
  let itemsWithNovaTag = 0;
  let itemsTotal = 0;

  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) continue;
    const pack = normalizeFoodEvents(node);
    if (!pack.hasFood) continue;
    daysWithFood += 1;

    const dayLog = collectDayLogForNutrition(node);
    for (const item of dayLog) {
      if (item?.type !== 'food' && item?.type !== 'recipe' && item?.type) continue;
      const name = foodDisplayName(item);
      if (!name) continue;
      itemsTotal += 1;
      const key = name.toLowerCase();
      let row = byKey.get(key);
      if (!row) {
        row = {
          name,
          days: new Set(),
          occasions: 0,
          nova4Days: new Set(),
          plantDays: new Set(),
          taggedNova: false,
        };
        byKey.set(key, row);
      }
      row.days.add(date);
      row.occasions += 1;

      const nova = readNovaGroup(item.semanticTags);
      if (nova != null) {
        itemsWithNovaTag += 1;
        row.taggedNova = true;
        if (nova >= 4) row.nova4Days.add(date);
      }
      if (PLANT_NAME_RE.test(name)) row.plantDays.add(date);
    }
  }

  const foods = [...byKey.values()].map((r) => ({
    name: r.name,
    distinctDays: r.days.size,
    occasions: r.occasions,
    nova4Days: r.nova4Days.size,
    plantDays: r.plantDays.size,
    taggedNova: r.taggedNova,
    persistent: r.days.size >= MIN_HABIT_DAYS,
  }));

  const minFoodDays = windowDays >= 28 ? 10 : MIN_FOOD_DAYS;

  return {
    daysWithFood,
    daysInWindow: windowDays,
    foods,
    itemsTotal,
    itemsWithNovaTag,
    coverageOk: daysWithFood >= minFoodDays,
    minFoodDays,
  };
}

/**
 * Aggrega attività aerobica/forza dalla normalizzazione esistente.
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 */
function collectWindowActivity(fullHistory, analysisDate, windowDays) {
  let aerobicMinutesDocumented = 0;
  let walkingMinutesUnclassified = 0;
  let moderateMinutes = 0;
  let vigorousMinutes = 0;
  let strengthSessions = 0;
  let aerobicSessions = 0;
  /** @type {object[]} */
  const strengthWorkouts = [];
  /** @type {{ weekEnd: string, aerobicDoc: number, equivMod: number|null }[]} */
  const weekBuckets = [];

  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) continue;
    const pack = normalizeWorkoutEvents(node);
    if (!pack.hasWorkout) continue;

    const aero = Number(pack.activity?.aerobicMinutes?.value);
    if (Number.isFinite(aero) && aero > 0) aerobicMinutesDocumented += aero;

    const walk = Number(pack.activity?.walkingMinutes?.value);
    const mod = Number(pack.activity?.moderateIntensityMinutes?.value);
    const vig = Number(pack.activity?.vigorousIntensityMinutes?.value);
    const dayHasIntensity = (Number.isFinite(mod) && mod > 0) || (Number.isFinite(vig) && vig > 0);

    if (Number.isFinite(mod) && mod > 0) moderateMinutes += mod;
    if (Number.isFinite(vig) && vig > 0) vigorousMinutes += vig;

    // Camminate senza intensità: restano in "documentati" ma non in classificabili.
    if (!dayHasIntensity && Number.isFinite(walk) && walk > 0) {
      walkingMinutesUnclassified += walk;
    }

    for (const w of pack.activity?.workouts || []) {
      const kind = w.activityKind?.value;
      if (kind === 'strength') {
        strengthSessions += 1;
        strengthWorkouts.push({
          date,
          label: w.label,
          durationMin: w.durationMin?.value ?? null,
          muscleGroups: Array.isArray(w.muscleGroups?.value) ? w.muscleGroups.value : [],
        });
      }
      if (kind === 'aerobic') aerobicSessions += 1;
    }
  }

  // Bucket settimanali per mese (andamento)
  if (windowDays >= 28) {
    for (let w = 0; w < 4; w += 1) {
      const weekEndOffset = w * 7;
      let aero = 0;
      let mod = 0;
      let vig = 0;
      let anyInt = false;
      for (let d = 0; d < 7; d += 1) {
        const date = addCalendarDays(analysisDate, -(weekEndOffset + d));
        const node = getTrackerDayNode(fullHistory, date);
        if (!node) continue;
        const pack = normalizeWorkoutEvents(node);
        const a = Number(pack.activity?.aerobicMinutes?.value);
        if (Number.isFinite(a) && a > 0) aero += a;
        const m = Number(pack.activity?.moderateIntensityMinutes?.value);
        const v = Number(pack.activity?.vigorousIntensityMinutes?.value);
        if (Number.isFinite(m) && m > 0) {
          mod += m;
          anyInt = true;
        }
        if (Number.isFinite(v) && v > 0) {
          vig += v;
          anyInt = true;
        }
      }
      weekBuckets.unshift({
        weekEnd: addCalendarDays(analysisDate, -weekEndOffset),
        aerobicDoc: Math.round(aero * 10) / 10,
        equivMod: anyInt ? Math.round((mod + vig * 2) * 10) / 10 : null,
      });
    }
  }

  const anyIntensity = moderateMinutes > 0 || vigorousMinutes > 0;
  const equivalentModerateMinutes = anyIntensity
    ? Math.round((moderateMinutes + vigorousMinutes * 2) * 10) / 10
    : null;

  return {
    aerobicMinutesDocumented: Math.round(aerobicMinutesDocumented * 10) / 10,
    walkingMinutesUnclassified: Math.round(walkingMinutesUnclassified * 10) / 10,
    moderateMinutes: anyIntensity ? Math.round(moderateMinutes * 10) / 10 : null,
    vigorousMinutes: vigorousMinutes > 0 ? Math.round(vigorousMinutes * 10) / 10 : null,
    equivalentModerateMinutes,
    intensityDocumented: anyIntensity,
    strengthSessions,
    aerobicSessions,
    strengthWorkouts,
    weekBuckets,
    referenceAdult: CARDIO_REFERENCE,
  };
}

/**
 * @param {ReturnType<typeof collectWindowFoods>} foodPack
 */
function evaluateFoodHabit(foodPack) {
  const limits = [];
  if (!foodPack.coverageOk) {
    return {
      id: 'food_model_direction',
      pillar: 'food',
      pillarLabel: 'Alimentazione',
      habitObserved: `Copertura alimentare ${foodPack.daysWithFood}/${foodPack.daysInWindow} giorni.`,
      direction: DIRECTION.insufficient,
      directionLabel: DIRECTION_IT.insufficient,
      motivation: 'Con così pochi giorni alimentari non distinguo un’abitudine da un episodio isolato.',
      evidence: [`Giorni con cibo: ${foodPack.daysWithFood} su ${foodPack.daysInWindow}.`],
      limits: [
        `Servono almeno ${foodPack.minFoodDays} giorni con pasti registrati nella finestra.`,
        'I giorni senza log non contano come digiuno o dieta “pulita”.',
      ],
      proposal: null,
      verifyIn: 'Nei prossimi 7–14 giorni registra i pasti principali con continuità.',
      healthRelevance: 35,
      persistence: 0,
      actionability: 0,
      dataQuality: foodPack.daysWithFood / foodPack.daysInWindow,
    };
  }

  const persistent = foodPack.foods.filter((f) => f.persistent);
  const plantPersistent = foodPack.foods.filter((f) => f.plantDays >= MIN_HABIT_DAYS);
  const uniquePlantNames = foodPack.foods.filter((f) => f.plantDays > 0).map((f) => f.name);
  const nova4Persistent = foodPack.foods.filter((f) => f.nova4Days >= MIN_HABIT_DAYS && f.taggedNova);
  const hasReliableNova = foodPack.itemsWithNovaTag > 0;

  if (!hasReliableNova) {
    limits.push('Nessuna classificazione NOVA attendibile: non invento categorie da nomi incerti.');
  }
  limits.push('Non uso giudizi antinfiammatori né score clinici.');

  const evidence = [
    `Giorni con cibo: ${foodPack.daysWithFood}/${foodPack.daysInWindow}.`,
    `Alimenti ricorrenti (≥${MIN_HABIT_DAYS} giorni): ${persistent.length}.`,
  ];
  if (uniquePlantNames.length) {
    evidence.push(`Fonti vegetali riconoscibili: ${uniquePlantNames.slice(0, 6).join(', ')}.`);
  }
  if (nova4Persistent.length) {
    evidence.push(`NOVA 4 documentata in ≥${MIN_HABIT_DAYS} giorni: ${nova4Persistent.map((f) => f.name).join(', ')}.`);
  }

  let direction = DIRECTION.watch;
  let motivation = 'Il modello alimentare è documentato, ma la direzione non è ancora netta.';
  let proposal = null;
  let healthRelevance = 40;
  let persistence = persistent.length >= 2 ? 0.7 : 0.4;

  if (nova4Persistent.length >= 1) {
    direction = DIRECTION.correct;
    motivation = 'Compare un’abitudine persistente ad alimenti fortemente processati (NOVA 4 documentata), non un singolo episodio.';
    proposal = `Quando puoi, sostituisci una porzione di «${nova4Persistent[0].name}» con un’alternativa già presente nel diario e meno processata.`;
    healthRelevance = 55;
    persistence = Math.min(1, nova4Persistent[0].nova4Days / 7);
  } else if (plantPersistent.length >= 2 && persistent.length >= 3) {
    direction = DIRECTION.favorable;
    motivation = 'Ricorrono più fonti vegetali riconoscibili e una varietà sufficiente nei giorni registrati.';
    proposal = 'Mantieni la varietà vegetale già presente nel diario; non serve un target fisso di porzioni.';
    healthRelevance = 45;
    persistence = 0.85;
  } else if (plantPersistent.length >= 1) {
    direction = DIRECTION.favorable;
    motivation = 'C’è almeno una fonte vegetale ricorrente; il segnale è positivo ma ancora sottile.';
    proposal = `Continua a includere «${plantPersistent[0].name}» fra gli alimenti che già usi, senza quote settimanali inventate.`;
    healthRelevance = 42;
    persistence = 0.6;
  } else if (persistent.length <= 1) {
    direction = DIRECTION.watch;
    motivation = 'Pochi alimenti distinti ricorrenti: difficile parlare di modello consolidato.';
    proposal = 'Ampia un po’ la varietà riusando alimenti già registrati in altri giorni.';
    healthRelevance = 35;
  }

  return {
    id: 'food_model_direction',
    pillar: 'food',
    pillarLabel: 'Alimentazione',
    habitObserved: persistent.length
      ? `${persistent.length} alimenti ricorrenti (≥${MIN_HABIT_DAYS} giorni) su ${foodPack.daysWithFood} giorni alimentari.`
      : `Pasti in ${foodPack.daysWithFood} giorni, senza alimenti ancora ricorrenti come abitudine.`,
    direction,
    directionLabel: DIRECTION_IT[direction],
    motivation,
    evidence,
    limits,
    proposal,
    verifyIn: 'Tra 7–14 giorni: ricorrenza vegetali e, se taggati, frequenza NOVA 4.',
    healthRelevance,
    persistence,
    actionability: proposal ? 0.7 : 0,
    dataQuality: hasReliableNova || plantPersistent.length ? 0.75 : 0.55,
  };
}

/**
 * Cardio: sempre presente in Settimana (anche senza pesi).
 * @param {ReturnType<typeof collectWindowActivity>} act
 * @param {number} windowDays
 */
function evaluateCardioHabit(act, windowDays) {
  const scale = windowDays >= 28 ? windowDays / 7 : 1;
  const targetMod = ADULT_MODERATE_MIN * scale;
  const limits = [
    CARDIO_REFERENCE,
    'Assenza di registrazioni ≠ sedentarietà dimostrata.',
    'I minuti aerobici documentati non coincidono automaticamente con minuti classificabili (moderati/vigorosi).',
    'Il cardio non si riduce alle calorie bruciate.',
  ];

  const evidence = [
    `Minuti aerobici documentati (label): ${act.aerobicMinutesDocumented}.`,
  ];
  if (act.walkingMinutesUnclassified > 0) {
    evidence.push(
      `Di cui camminate/passeggiate senza intensità affidabile: ${act.walkingMinutesUnclassified} min (non conteggiati come moderati).`,
    );
  }
  if (act.intensityDocumented) {
    evidence.push(
      `Classificabili: moderati ${act.moderateMinutes ?? 0} min · vigorosi ${act.vigorousMinutes ?? 0} min · equivalente moderato ${act.equivalentModerateMinutes} min (vigorosi×2, senza doppio conteggio).`,
    );
  } else {
    evidence.push('Nessuna intensità moderata/vigorosa documentata in modo affidabile.');
  }

  if (act.aerobicMinutesDocumented <= 0 && !act.intensityDocumented) {
    return {
      id: 'cardio_weekly',
      pillar: 'exercise',
      pillarLabel: 'Attività aerobica',
      habitObserved: 'Nessuna attività aerobica registrata nella finestra.',
      direction: DIRECTION.insufficient,
      directionLabel: DIRECTION_IT.insufficient,
      motivation: 'Senza log aerobici non valuto il livello di attività; non deduco sedentarietà.',
      evidence,
      limits,
      proposal: null,
      verifyIn: 'Se fai camminate o cardio, registrali con durata; l’intensità solo se la conosci.',
      healthRelevance: 70,
      persistence: 0,
      actionability: 0,
      dataQuality: 0.2,
      cardioMetrics: act,
    };
  }

  const equiv = act.equivalentModerateMinutes;
  let direction = DIRECTION.watch;
  let motivation = 'Attività aerobica presente; la classificazione rispetto al riferimento adulti è ancora incompleta.';
  let proposal = null;
  let healthRelevance = 75;
  let persistence = act.aerobicSessions >= 3 ? 0.7 : 0.45;

  if (equiv != null && equiv >= targetMod) {
    direction = DIRECTION.favorable;
    motivation = `I minuti classificabili raggiungono il riferimento settimanale adulti (≈${equiv} min-eq. moderati; soglia ~${Math.round(targetMod)}).`;
    proposal = 'Mantieni questa continuità aerobica; non serve aumentare solo per “fare numero”.';
    healthRelevance = 80;
    persistence = 0.9;
  } else if (equiv != null && equiv > 0 && equiv < targetMod) {
    direction = DIRECTION.favorable;
    motivation = `Progresso aerobico documentato (≈${equiv} min-eq. moderati) ancora sotto il riferimento (~${Math.round(targetMod)}): il miglioramento conta anche se l’obiettivo non è raggiunto.`;
    proposal = 'Se ti è comodo, aggiungi una sessione aerobica già nel tuo repertorio o annota l’intensità quando la conosci.';
    healthRelevance = 78;
    persistence = 0.65;
  } else if (!act.intensityDocumented && act.aerobicMinutesDocumented > 0) {
    direction = DIRECTION.watch;
    motivation = `Hai ${act.aerobicMinutesDocumented} min aerobici documentati, ma senza intensità affidabile non li attribuisco automaticamente come moderati.`;
    proposal = 'Nelle prossime uscite, se conosci lo sforzo, registra intensità moderata o vigorosa: migliora il confronto col riferimento.';
    healthRelevance = 72;
    persistence = 0.5;
  }

  return {
    id: 'cardio_weekly',
    pillar: 'exercise',
    pillarLabel: 'Attività aerobica',
    habitObserved: act.intensityDocumented
      ? `${act.aerobicMinutesDocumented} min aerobici documentati · ${equiv} min-eq. classificabili`
      : `${act.aerobicMinutesDocumented} min aerobici documentati · intensità non classificata`,
    direction,
    directionLabel: DIRECTION_IT[direction],
    motivation,
    evidence,
    limits,
    proposal,
    verifyIn: 'Tra 7–14 giorni: minuti documentati e, se disponibili, minuti classificabili.',
    healthRelevance,
    persistence,
    actionability: proposal ? 0.75 : 0.3,
    dataQuality: act.intensityDocumented ? 0.85 : 0.5,
    cardioMetrics: act,
  };
}

/**
 * Forza: solo se ci sono sessioni di forza documentate.
 * @param {ReturnType<typeof collectWindowActivity>} act
 * @param {object|null|undefined} userTargets
 * @param {number} windowDays
 */
function evaluateStrengthHabit(act, userTargets, windowDays) {
  if (act.strengthSessions < 1) {
    return null;
  }

  const limits = [
    'Non invento serie, ripetizioni, carichi, progressione o ipertrofia.',
    'Minuti di allenamento non equivalgono a forza o bulk/cut.',
  ];
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const w of act.strengthWorkouts) {
    for (const g of w.muscleGroups || []) {
      const key = String(g || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const muscleFreq = [...counts.entries()]
    .map(([group, sessions]) => ({ group, sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.group.localeCompare(b.group, 'it'));

  const evidence = [
    `Sessioni di forza documentate: ${act.strengthSessions} nella finestra (${windowDays} giorni).`,
  ];
  if (muscleFreq.length) {
    evidence.push(`Gruppi: ${muscleFreq.slice(0, 6).map((r) => `${r.group} (${r.sessions})`).join(', ')}.`);
  } else {
    evidence.push('Gruppi muscolari non indicati.');
    limits.push('Senza chip muscolari non valuto la distribuzione.');
  }
  if (userTargets?.kcal != null) {
    evidence.push(`Contesto energetico di sessione: ~${Math.round(Number(userTargets.kcal))} kcal (non score di fase).`);
  } else {
    limits.push('Nessun obiettivo di fase (bulk/cut) esplicito in Focus: non lo invento.');
  }

  if (act.strengthSessions < 2) {
    return {
      id: 'strength_stimulus',
      pillar: 'exercise',
      pillarLabel: 'Forza',
      habitObserved: `1 sessione di forza documentata.`,
      direction: DIRECTION.watch,
      directionLabel: DIRECTION_IT.watch,
      motivation: 'Segnale di forza presente ma ancora troppo sottile per parlare di continuità.',
      evidence,
      limits,
      proposal: null,
      verifyIn: 'Registra almeno un’altra sessione di forza con gruppi muscolari.',
      healthRelevance: 55,
      persistence: 0.3,
      actionability: 0,
      dataQuality: 0.45,
    };
  }

  const dominant = muscleFreq[0];
  const unbalanced = muscleFreq.length === 1 && act.strengthSessions >= 3;
  const balanced = muscleFreq.length >= 3 && act.strengthSessions >= 3;

  let direction = DIRECTION.watch;
  let motivation = 'Continuità di forza presente; la distribuzione merita osservazione.';
  let proposal = null;
  let healthRelevance = 60;
  let persistence = Math.min(1, act.strengthSessions / 5);

  if (balanced) {
    direction = DIRECTION.favorable;
    motivation = windowDays >= 28
      ? 'Nel periodo emergono più gruppi muscolari sulle sessioni di forza: stimolo distribuito.'
      : 'Continuità di forza con più gruppi muscolari documentati.';
    proposal = `Mantieni la varietà sui gruppi già usati (${muscleFreq.slice(0, 3).map((r) => r.group).join(', ')}).`;
    healthRelevance = 62;
    persistence = 0.85;
  } else if (unbalanced && dominant) {
    direction = DIRECTION.correct;
    motivation = `Le sessioni di forza ripetono soprattutto «${dominant.group}»: squilibrio evidente nei gruppi documentati.`;
    proposal = `Nella prossima sessione di forza includi un gruppo diverso da «${dominant.group}», se fa parte della tua routine.`;
    healthRelevance = 58;
    persistence = 0.8;
  } else if (!muscleFreq.length) {
    direction = DIRECTION.watch;
    motivation = 'Buona continuità di log di forza, ma senza gruppi non valuto la distribuzione.';
    proposal = 'Quando registri pesi, indica anche i gruppi muscolari.';
    healthRelevance = 50;
  } else {
    direction = DIRECTION.favorable;
    motivation = 'Continuità sufficiente sulle sessioni di forza registrate.';
    proposal = 'Mantieni la frequenza e, se puoi, completa i gruppi muscolari nel log.';
    healthRelevance = 58;
  }

  return {
    id: 'strength_stimulus',
    pillar: 'exercise',
    pillarLabel: 'Forza',
    habitObserved: `${act.strengthSessions} sessioni di forza`
      + (muscleFreq.length ? ` · ${muscleFreq.slice(0, 4).map((r) => r.group).join(', ')}` : ''),
    direction,
    directionLabel: DIRECTION_IT[direction],
    motivation,
    evidence,
    limits,
    proposal,
    verifyIn: 'Tra 7–14 giorni: frequenza forza e copertura gruppi.',
    healthRelevance,
    persistence,
    actionability: proposal ? 0.7 : 0.2,
    dataQuality: muscleFreq.length ? 0.8 : 0.5,
  };
}

/**
 * Nota discreta se non c’è forza (non programma culturista).
 * @param {ReturnType<typeof collectWindowActivity>} act
 */
function evaluateGeneralMovementHint(act) {
  if (act.strengthSessions > 0) return null;
  if (act.aerobicMinutesDocumented <= 0) return null;
  return {
    id: 'general_strength_opportunity',
    pillar: 'exercise',
    pillarLabel: 'Movimento',
    habitObserved: 'Attività aerobica presente, senza sessioni di forza registrate.',
    direction: DIRECTION.watch,
    directionLabel: DIRECTION_IT.watch,
    motivation: 'Se ti interessa, un rafforzamento leggero e generale può affiancare il cardio: non è un programma di ipertrofia.',
    evidence: [`Aerobico documentato: ${act.aerobicMinutesDocumented} min.`],
    limits: [
      'Nessun commento su bulk, cut, catabolismo o gruppi muscolari senza log di forza.',
      'Suggerimento discreto, non un piano da palestra.',
    ],
    proposal: null,
    verifyIn: 'Solo se registri forza in futuro, valuterò stimolo e distribuzione.',
    healthRelevance: 25,
    persistence: 0.2,
    actionability: 0,
    dataQuality: 0.4,
    softOnly: true,
  };
}

/**
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 * @param {object|null|undefined} sleepPillar
 */
function evaluateSleepHabit(fullHistory, analysisDate, windowDays, sleepPillar) {
  /** @type {{ date: string, wakeDate: string, hours: number|null, bedtime: number|null }[]} */
  const nights = [];
  const minNights = windowDays >= 28 ? 8 : MIN_SLEEP_NIGHTS;

  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const day = addCalendarDays(analysisDate, -i);
    const wakeDate = addCalendarDays(day, 1);
    const node = getTrackerDayNode(fullHistory, wakeDate);
    const pack = normalizeSleepNight(node, { publicationDate: wakeDate, lastMealHour: null });
    if (!pack.sleepAvailable) continue;
    nights.push({
      date: day,
      wakeDate,
      hours: pack.sleep?.hours?.value ?? null,
      bedtime: pack.sleep?.bedtime?.value ?? null,
    });
  }

  const limits = [
    'Non invento fasi del sonno, cause dei risvegli o qualità soggettiva assente.',
    'Allineamento: notte della giornata D conclusa al risveglio D+1.',
  ];

  if (nights.length < minNights) {
    return {
      id: 'sleep_regularity',
      pillar: 'sleep',
      pillarLabel: 'Sonno',
      habitObserved: `${nights.length} notti registrate su ${windowDays}.`,
      direction: DIRECTION.insufficient,
      directionLabel: DIRECTION_IT.insufficient,
      motivation: 'Troppo poche notti per giudicare regolarità o durata come abitudine.',
      evidence: [
        `Notti con risveglio allineato: ${nights.length}/${windowDays}.`,
        sleepPillar?.detailNote || null,
      ].filter(Boolean),
      limits,
      proposal: null,
      verifyIn: 'Registra più notti nei prossimi 7–14 giorni.',
      healthRelevance: 90,
      persistence: 0,
      actionability: 0,
      dataQuality: nights.length / windowDays,
    };
  }

  const hoursList = nights.map((n) => n.hours).filter((h) => h != null && Number.isFinite(h));
  const bedList = nights.map((n) => n.bedtime).filter((h) => h != null && Number.isFinite(h));
  const avgH = hoursList.length
    ? Math.round((hoursList.reduce((a, b) => a + b, 0) / hoursList.length) * 10) / 10
    : null;
  const hoursSpread = hoursList.length >= 3 ? Math.max(...hoursList) - Math.min(...hoursList) : null;
  let bedSpread = null;
  if (bedList.length >= 3) {
    let maxGap = 0;
    for (let i = 0; i < bedList.length; i += 1) {
      for (let j = i + 1; j < bedList.length; j += 1) {
        const raw = Math.abs(bedList[i] - bedList[j]);
        const gap = Math.min(raw, 24 - raw);
        if (gap > maxGap) maxGap = gap;
      }
    }
    bedSpread = Math.round(maxGap * 10) / 10;
  }

  const evidence = [`Notti registrate: ${nights.length}/${windowDays}.`];
  if (avgH != null) evidence.push(`Durata media: ${avgH} ore.`);
  if (hoursSpread != null) evidence.push(`Escursione durata: ${Math.round(hoursSpread * 10) / 10} ore.`);
  if (bedSpread != null) evidence.push(`Escursione bedtime (orologio 24h): ${bedSpread} ore.`);

  const shortNights = hoursList.filter((h) => h < 6).length;
  const irregularHours = hoursSpread != null && hoursSpread > HOURS_SPREAD_IRREGULAR;
  const irregularBed = bedSpread != null && bedSpread > BEDTIME_SPREAD_IRREGULAR_H;
  const stableHours = hoursSpread != null && hoursSpread <= HOURS_SPREAD_IRREGULAR;
  const goodDuration = avgH != null && avgH >= 7 && avgH <= 9;

  let direction = DIRECTION.watch;
  let motivation = 'Il sonno è documentato; la direzione non è ancora netta.';
  let proposal = null;
  let healthRelevance = 85;
  let persistence = Math.min(1, nights.length / windowDays);

  if ((irregularHours || irregularBed) && shortNights >= 2) {
    direction = DIRECTION.correct;
    motivation = 'Durata o orari risultano irregolari su più notti, non su un episodio isolato.';
    proposal = 'Scegli un orario di addormentamento già riuscito in una notte registrata e ripetilo per alcune sere consecutive.';
    healthRelevance = 95;
    persistence = 0.9;
  } else if (irregularHours || irregularBed) {
    direction = DIRECTION.correct;
    motivation = 'Gli orari o la durata oscillano oltre una fascia stabile.';
    proposal = 'Riduci lo scarto di addormentamento tenendo un bedtime vicino a quello più frequente già registrato.';
    healthRelevance = 90;
    persistence = 0.75;
  } else if (stableHours && goodDuration) {
    direction = DIRECTION.favorable;
    motivation = 'Durata media nella fascia abituale e andamento abbastanza regolare.';
    proposal = 'Mantieni la stessa fascia di addormentamento e durata.';
    healthRelevance = 70;
    persistence = 0.85;
  } else if (stableHours) {
    direction = DIRECTION.watch;
    motivation = 'Regolarità accettabile; la durata media merita ancora osservazione.';
    proposal = avgH != null && avgH < 7
      ? 'Prova ad anticipare leggermente un bedtime già registrato.'
      : 'Continua a registrare orari e durata.';
    healthRelevance = 75;
  }

  return {
    id: 'sleep_regularity',
    pillar: 'sleep',
    pillarLabel: 'Sonno',
    habitObserved: avgH != null
      ? `${nights.length} notti · media ${avgH} ore`
      : `${nights.length} notti registrate`,
    direction,
    directionLabel: DIRECTION_IT[direction],
    motivation,
    evidence,
    limits,
    proposal,
    verifyIn: 'Tra 7–14 giorni: escursione durata/orari e media ore.',
    healthRelevance,
    persistence,
    actionability: proposal ? 0.8 : 0.2,
    dataQuality: nights.length >= minNights ? 0.85 : 0.4,
  };
}

/**
 * Priorità: salute × persistenza × qualità dati × azionabilità — non NOVA-first fisso.
 * @param {object[]} evaluations
 * @param {object|null|undefined} mealManeuver
 */
function pickPriorities(evaluations, mealManeuver) {
  const rank = (e) => {
    const base = (Number(e.healthRelevance) || 40)
      * (0.35 + 0.65 * (Number(e.persistence) || 0))
      * (0.4 + 0.6 * (Number(e.dataQuality) || 0.5));
    const dirBoost = e.direction === DIRECTION.correct ? 1.35
      : e.direction === DIRECTION.favorable ? 1.1
        : e.direction === DIRECTION.watch ? 0.85
          : 0.2;
    const actionBoost = e.proposal ? (0.85 + 0.3 * (Number(e.actionability) || 0.5)) : 0.7;
    return base * dirBoost * actionBoost;
  };

  const usable = evaluations.filter((e) => e && e.direction !== DIRECTION.insufficient && !e.softOnly);
  const favorable = usable
    .filter((e) => e.direction === DIRECTION.favorable)
    .sort((a, b) => rank(b) - rank(a));
  const toCorrect = usable
    .filter((e) => e.direction === DIRECTION.correct)
    .sort((a, b) => rank(b) - rank(a));

  const encourage = favorable[0]
    ? {
      pillar: favorable[0].pillarLabel,
      text: favorable[0].motivation,
      evaluationId: favorable[0].id,
      rank: Math.round(rank(favorable[0])),
    }
    : null;

  const correct = toCorrect[0]
    ? {
      pillar: toCorrect[0].pillarLabel,
      text: toCorrect[0].motivation,
      evaluationId: toCorrect[0].id,
      rank: Math.round(rank(toCorrect[0])),
    }
    : null;

  /** @type {object[]} */
  const actionCandidates = [];
  for (const e of [...toCorrect, ...favorable, ...usable.filter((x) => x.direction === DIRECTION.watch)]) {
    if (!e.proposal) continue;
    actionCandidates.push({
      pillar: e.pillarLabel,
      text: e.proposal,
      evaluationId: e.id,
      source: 'habit_evaluation',
      priority: rank(e) * (e.direction === DIRECTION.correct ? 1.2 : 1),
      reasonBits: {
        healthRelevance: e.healthRelevance,
        persistence: e.persistence,
        dataQuality: e.dataQuality,
        direction: e.direction,
      },
    });
  }

  if (mealManeuver?.suggested && mealManeuver?.suggestedChange?.text) {
    actionCandidates.push({
      pillar: 'Alimentazione',
      text: mealManeuver.suggestedChange.text,
      evaluationId: 'meal_maneuver',
      source: 'meal_maneuver',
      priority: 55,
      reasonBits: { note: 'manovra pasti già giustificata' },
    });
  }

  actionCandidates.sort((a, b) => b.priority - a.priority);

  /** @type {string|null} */
  let conflictNote = null;
  if (actionCandidates.length >= 2) {
    const a = actionCandidates[0];
    const b = actionCandidates[1];
    if (a.evaluationId !== b.evaluationId) {
      conflictNote = `Priorità a ${a.pillar.toLowerCase()} (rilevanza/persistenza/dati: score ${Math.round(a.priority)}) rispetto a ${b.pillar.toLowerCase()} (score ${Math.round(b.priority)}): non è un ordine fisso (es. NOVA sempre prima).`;
    }
  }

  const primaryAction = actionCandidates[0]
    ? {
      pillar: actionCandidates[0].pillar,
      text: actionCandidates[0].text,
      evaluationId: actionCandidates[0].evaluationId,
      source: actionCandidates[0].source,
    }
    : null;

  return { encourage, correct, primaryAction, conflictNote };
}

/**
 * @param {{
 *   periodId?: string,
 *   fullHistory?: object|null,
 *   analysisDate?: string|null,
 *   publicationDate?: string|null,
 *   wellness?: object|null,
 *   nutritionView?: object|null,
 *   userTargets?: object|null,
 *   mealManeuver?: object|null,
 *   uid?: string|null,
 * }} input
 */
export function buildFocusWeeklyHabitCompass(input) {
  const periodId = String(input.periodId || '').toLowerCase();
  if (periodId !== 'settimana' && periodId !== 'mese') {
    return {
      schema: 'kentu.focusWeeklyHabitCompass.v1',
      available: false,
      reason: 'period_not_settimana_or_mese',
      title: null,
      evaluations: [],
      highlights: null,
      cardio: null,
      policy: { weekOrMonthOnly: true },
    };
  }

  const { fullHistory, analysisDate, publicationDate } = input;
  if (!fullHistory || !isIsoDateString(analysisDate) || !isIsoDateString(publicationDate)) {
    return {
      schema: 'kentu.focusWeeklyHabitCompass.v1',
      available: false,
      reason: 'missing_history_or_dates',
      title: 'Le abitudini che stai costruendo',
      evaluations: [],
      highlights: null,
      cardio: null,
      policy: { weekOrMonthOnly: true },
    };
  }

  if (!input.wellness?.ok) {
    return {
      schema: 'kentu.focusWeeklyHabitCompass.v1',
      available: false,
      reason: 'wellness_unavailable',
      title: 'Le abitudini che stai costruendo',
      evaluations: [],
      highlights: null,
      cardio: null,
      policy: { weekOrMonthOnly: true },
    };
  }

  const windowDays = resolveWindowDays(periodId);
  const foodPack = collectWindowFoods(fullHistory, analysisDate, windowDays);
  const activity = collectWindowActivity(fullHistory, analysisDate, windowDays);

  const foodEv = evaluateFoodHabit(foodPack);
  const cardioEv = evaluateCardioHabit(activity, windowDays);
  const strengthEv = evaluateStrengthHabit(activity, input.userTargets, windowDays);
  const softMove = evaluateGeneralMovementHint(activity);
  const sleepEv = evaluateSleepHabit(
    fullHistory,
    analysisDate,
    windowDays,
    input.wellness.pillarsById?.sleep,
  );

  /** @type {object[]} */
  const evaluations = [foodEv, cardioEv];
  if (strengthEv) evaluations.push(strengthEv);
  else if (softMove) evaluations.push(softMove);
  evaluations.push(sleepEv);

  // Mese: se weekBuckets troppo vuoti, non inventare trend
  let monthTrendNote = null;
  if (periodId === 'mese') {
    const weeksWithData = (activity.weekBuckets || []).filter((w) => w.aerobicDoc > 0 || (w.equivMod != null && w.equivMod > 0));
    if (weeksWithData.length >= 2) {
      monthTrendNote = `Andamento aerobico per settimane (fine settimana → doc / eq.): ${
        activity.weekBuckets.map((w) => `${w.weekEnd}: ${w.aerobicDoc} min`
          + (w.equivMod != null ? ` / ${w.equivMod} eq.` : ' / intensità n/d')).join(' · ')
      }`;
    } else {
      monthTrendNote = 'Andamento mensile aerobico insufficiente: mi astengo da conclusioni sulle settimane.';
    }
  }

  const highlights = pickPriorities(evaluations, input.mealManeuver);
  const judged = evaluations.filter((e) => e.direction !== DIRECTION.insufficient && !e.softOnly);
  const allInsufficient = judged.length === 0;

  return {
    schema: 'kentu.focusWeeklyHabitCompass.v1',
    available: true,
    reason: allInsufficient ? 'insufficient_coverage' : 'ok',
    title: 'Le abitudini che stai costruendo',
    subtitle: periodId === 'mese'
      ? `Mese che termina il ${analysisDate} · stimolo e abitudini nel tempo (a kent'annusu)`
      : `Settimana che termina il ${analysisDate} · direzione verso abitudini sostenibili (a kent'annusu)`,
    periodId,
    windowDays,
    analysisDate,
    publicationDate,
    uid: input.uid || null,
    cardio: {
      reference: CARDIO_REFERENCE,
      aerobicMinutesDocumented: activity.aerobicMinutesDocumented,
      walkingMinutesUnclassified: activity.walkingMinutesUnclassified,
      moderateMinutes: activity.moderateMinutes,
      vigorousMinutes: activity.vigorousMinutes,
      equivalentModerateMinutes: activity.equivalentModerateMinutes,
      intensityDocumented: activity.intensityDocumented,
      strengthSessions: activity.strengthSessions,
      weekBuckets: activity.weekBuckets,
      monthTrendNote,
    },
    evaluations,
    highlights,
    policy: {
      weekOrMonthOnly: true,
      noClinicalScore: true,
      noLifeYears: true,
      noBussolaDial: true,
      noInventedNova: true,
      noInflammationClaims: true,
      cardioForEveryone: true,
      strengthOnlyIfLogged: true,
      noFixedNovaPriority: true,
      maxEncourage: 1,
      maxCorrect: 1,
      maxPrimaryAction: 1,
      showPositives: true,
      weakSignal: true,
      persistenceDays: MIN_HABIT_DAYS,
      simulationOnlyAdvice: true,
    },
  };
}
