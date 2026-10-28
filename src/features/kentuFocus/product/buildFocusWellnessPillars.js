/**
 * Tre pilastri benessere Focus (alimentazione, esercizio, sonno) + coach sintetico.
 * Card: un dato principale + una frase breve. Dettagli lunghi solo negli approfondimenti.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { normalizeWorkoutEvents } from '../normalize/normalizeWorkoutEvents.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import { buildFocusPrivateNutritionView } from './buildFocusPrivateNutritionView.js';

const KIND_IT = Object.freeze({
  strength: 'forza',
  aerobic: 'aerobico',
  other_activity: 'altra attività',
  unclassified: 'non classificato',
});

/**
 * @param {number|null|undefined} hour
 */
function formatClock(hour) {
  if (hour == null || !Number.isFinite(Number(hour))) return null;
  const h = Math.floor(Number(hour)) % 24;
  const m = Math.round((Number(hour) - Math.floor(Number(hour))) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * @param {Partial<object>} extra
 */
function pillarBase(extra) {
  return {
    tone: 'muted',
    primaryValue: 'Dati insufficienti',
    shortPhrase: 'Niente di sufficiente da mostrare qui.',
    hasEvidence: false,
    attention: false,
    positive: false,
    detailNote: null,
    metrics: [],
    ...extra,
  };
}

/**
 * @param {object|null} nutritionView
 * @param {string} periodId
 */
function buildNutritionPillar(nutritionView, periodId) {
  if (periodId === 'ieri') {
    const ieri = nutritionView?.ieri;
    if (!ieri?.hasFood) {
      return pillarBase({
        id: 'nutrition',
        title: 'Alimentazione',
        primaryValue: 'Non registrato',
        shortPhrase: 'Nessun pasto nel diario di ieri.',
        detailKey: 'nutrition',
        detailNote: 'Evidenze alimentari insufficienti per questo giorno.',
      });
    }

    const kcal = ieri.totals?.kcal?.value;
    const mealCount = (ieri.meals || []).length;
    const itemFlags = (ieri.toVerify || []).filter((t) => t.scope === 'item');
    const dayFlags = (ieri.toVerify || []).filter((t) => t.scope === 'day');
    const attention = itemFlags.length > 0 || dayFlags.length > 0;

    const primaryValue = kcal != null
      ? `${Math.round(kcal)} kcal`
      : (mealCount > 0 ? `${mealCount} past${mealCount === 1 ? 'o' : 'i'}` : 'Dati insufficienti');

    let shortPhrase = mealCount === 1 ? 'Un pasto registrato.' : `${mealCount} pasti registrati.`;
    if (attention) shortPhrase = 'Qualche valore da verificare.';
    else if (kcal != null) shortPhrase = 'Giornata alimentare registrata.';

    return pillarBase({
      id: 'nutrition',
      title: 'Alimentazione',
      tone: attention ? 'warn' : 'good',
      primaryValue,
      shortPhrase,
      hasEvidence: true,
      attention,
      positive: !attention && mealCount > 0 && kcal != null,
      detailKey: 'nutrition',
      detailNote: ieri.comment?.text || null,
      metrics: kcal != null ? [`${Math.round(kcal)} kcal`] : [],
    });
  }

  const trends = nutritionView?.trends;
  const windowLabel = periodId === 'mese' ? 'mese' : 'settimana';
  if (!trends?.available) {
    return pillarBase({
      id: 'nutrition',
      title: 'Alimentazione',
      primaryValue: 'Dati insufficienti',
      shortPhrase: `Pochi pasti nella ${windowLabel}.`,
      detailKey: 'nutrition',
      detailNote: trends?.note || 'Nessun giorno con cibo nella finestra.',
    });
  }

  const daysWithFood = trends.daysWithFood;
  const daysInWindow = trends.daysInWindow;
  const avgK = trends.averagesFromRecordedDaysOnly?.kcal;

  return pillarBase({
    id: 'nutrition',
    title: 'Alimentazione',
    tone: 'good',
    primaryValue: `${daysWithFood}/${daysInWindow} giorni`,
    shortPhrase: avgK != null
      ? `Media sui giorni registrati: ${Math.round(avgK)} kcal.`
      : `Copertura nella ${windowLabel}.`,
    hasEvidence: true,
    attention: false,
    positive: daysWithFood >= Math.ceil(daysInWindow * 0.4),
    detailKey: 'nutrition',
    detailNote: trends.note
      || 'Medie solo sui giorni con cibo; i giorni mancanti non contano come zero.',
    metrics: [`${daysWithFood}/${daysInWindow} giorni`],
  });
}

/**
 * @param {object} w — workout normalizzato
 * @param {string|null} [date]
 */
function mapWorkoutForPillar(w, date = null) {
  const kind = w.activityKind?.value || 'unclassified';
  const muscleGroups = Array.isArray(w.muscleGroups?.value) ? w.muscleGroups.value : [];
  const clockHour = w.clockHour?.value ?? null;
  const intensitySupported = Boolean(w.intensitySupported);
  return {
    id: w.id,
    date: date || null,
    label: w.label || 'Allenamento',
    durationMin: w.durationMin?.value ?? null,
    kcalBurn: w.kcalBurn?.value ?? null,
    clockHour,
    clockLabel: formatClock(clockHour),
    muscleGroups,
    workoutTypeId: w.workoutTypeId?.value ?? null,
    kind,
    kindLabel: KIND_IT[kind] || kind,
    isWalking: Boolean(w.isWalking?.value),
    intensityDocumented: intensitySupported,
    intensityBand: intensitySupported ? (w.intensityBand || null) : null,
  };
}

/**
 * @param {object[]} workouts
 */
function summarizeMuscleGroups(workouts) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const w of workouts) {
    for (const m of w.muscleGroups || []) {
      const key = String(m || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([group, sessions]) => ({ group, sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.group.localeCompare(b.group, 'it'));
}

/**
 * @param {object} dayNode
 * @param {string|null} [date]
 */
function buildExerciseDayPillar(dayNode, date = null) {
  const pack = normalizeWorkoutEvents(dayNode);
  if (!pack.hasWorkout) {
    return pillarBase({
      id: 'exercise',
      title: 'Esercizio',
      primaryValue: 'Non registrato',
      shortPhrase: 'Nessun allenamento nel diario.',
      detailKey: 'exercise',
      detailNote: 'Assenza di registrazioni non significa inattività: mancano solo le evidenze.',
      workouts: [],
      muscleGroupFrequency: [],
    });
  }

  const workouts = (pack.activity?.workouts || []).map((w) => mapWorkoutForPillar(w, date));
  const muscleGroupFrequency = summarizeMuscleGroups(workouts);

  const totalMin = workouts.reduce((s, w) => s + (Number(w.durationMin) || 0), 0);
  const primaryValue = totalMin > 0
    ? `${Math.round(totalMin)} min`
    : `${workouts.length} session${workouts.length === 1 ? 'e' : 'i'}`;

  const strengthN = workouts.filter((w) => w.kind === 'strength').length;
  const aerobicN = workouts.filter((w) => w.kind === 'aerobic').length;
  const muscleNames = muscleGroupFrequency.map((r) => r.group);
  let shortPhrase = workouts.length === 1 ? 'Sessione registrata.' : 'Sessioni registrate.';
  if (muscleNames.length) {
    shortPhrase = muscleNames.length <= 3
      ? `Gruppi: ${muscleNames.join(', ')}.`
      : `Gruppi: ${muscleNames.slice(0, 3).join(', ')} e altri.`;
  } else if (strengthN && !aerobicN) {
    shortPhrase = 'Attività di forza.';
  } else if (aerobicN && !strengthN) {
    shortPhrase = 'Attività aerobica.';
  } else if (strengthN && aerobicN) {
    shortPhrase = 'Forza e aerobico.';
  }

  const moderate = pack.activity?.moderateIntensityMinutes?.value;
  const vigorous = pack.activity?.vigorousIntensityMinutes?.value;
  const aerobicMin = pack.activity?.aerobicMinutes?.value;
  const intensityDocumented = (moderate != null && moderate > 0) || (vigorous != null && vigorous > 0);

  return pillarBase({
    id: 'exercise',
    title: 'Esercizio',
    tone: 'good',
    primaryValue,
    shortPhrase,
    hasEvidence: true,
    attention: false,
    positive: true,
    detailKey: 'exercise',
    detailNote: intensityDocumented
      ? 'Intensità documentata in almeno una sessione. Minuti e calorie non sono equivalenti. Gruppi muscolari dal diario, non esercizi singoli.'
      : 'Intensità non documentata. Minuti e calorie non sono equivalenti. Gruppi muscolari dal diario, non esercizi singoli.',
    workouts,
    muscleGroupFrequency,
    strengthSessionCount: strengthN,
    cardio: {
      aerobicMinutesDocumented: aerobicMin != null ? aerobicMin : 0,
      moderateMinutes: moderate != null ? moderate : null,
      vigorousMinutes: vigorous != null ? vigorous : null,
      intensityDocumented,
    },
    metrics: [primaryValue],
  });
}

/**
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 * @param {string} periodId
 */
function buildExerciseTrendPillar(fullHistory, analysisDate, windowDays, periodId) {
  /** @type {object[]} */
  const series = [];
  /** @type {object[]} */
  const workouts = [];
  let daysWithWorkout = 0;
  let totalSessions = 0;
  let totalMin = 0;
  let aerobicMinutesDocumented = 0;
  let moderateMinutes = 0;
  let vigorousMinutes = 0;
  let anyIntensity = false;
  const windowLabel = periodId === 'mese' ? 'mese' : 'settimana';

  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) {
      series.push({ date, status: 'missing_node', sessions: 0, muscleGroups: [] });
      continue;
    }
    const pack = normalizeWorkoutEvents(node);
    if (!pack.hasWorkout) {
      series.push({ date, status: 'no_workout_log', sessions: 0, muscleGroups: [] });
      continue;
    }
    daysWithWorkout += 1;
    const dayWorkouts = (pack.activity?.workouts || []).map((w) => mapWorkoutForPillar(w, date));
    const n = dayWorkouts.length;
    totalSessions += n;
    for (const w of dayWorkouts) {
      workouts.push(w);
      totalMin += Number(w.durationMin) || 0;
    }
    const aero = Number(pack.activity?.aerobicMinutes?.value);
    if (Number.isFinite(aero) && aero > 0) aerobicMinutesDocumented += aero;
    const mod = Number(pack.activity?.moderateIntensityMinutes?.value);
    const vig = Number(pack.activity?.vigorousIntensityMinutes?.value);
    if (Number.isFinite(mod) && mod > 0) {
      moderateMinutes += mod;
      anyIntensity = true;
    }
    if (Number.isFinite(vig) && vig > 0) {
      vigorousMinutes += vig;
      anyIntensity = true;
    }
    const dayMuscles = [...new Set(dayWorkouts.flatMap((w) => w.muscleGroups || []))];
    series.push({
      date,
      status: 'recorded',
      sessions: n,
      durationMinTotal: dayWorkouts.reduce((s, w) => s + (Number(w.durationMin) || 0), 0) || null,
      muscleGroups: dayMuscles,
      workouts: dayWorkouts,
      aerobicMinutes: Number.isFinite(aero) ? aero : 0,
      moderateMinutes: Number.isFinite(mod) ? mod : null,
      vigorousMinutes: Number.isFinite(vig) ? vig : null,
    });
  }

  const muscleGroupFrequency = summarizeMuscleGroups(workouts);
  const strengthSessionCount = workouts.filter((w) => w.kind === 'strength').length;
  const equivModerate = Math.round((moderateMinutes + vigorousMinutes * 2) * 10) / 10;

  if (daysWithWorkout === 0) {
    return pillarBase({
      id: 'exercise',
      title: 'Esercizio',
      primaryValue: 'Non registrato',
      shortPhrase: `Nessun allenamento nella ${windowLabel}.`,
      detailKey: 'exercise',
      detailNote: 'Assenza di log ≠ inattività dichiarata.',
      series,
      workouts: [],
      muscleGroupFrequency: [],
      strengthSessionCount: 0,
      cardio: {
        aerobicMinutesDocumented: 0,
        moderateMinutes: null,
        vigorousMinutes: null,
        equivalentModerateMinutes: null,
        intensityDocumented: false,
        referenceAdult: '150–300 min moderati / 75–150 vigorosi (o equivalente) a settimana',
      },
    });
  }

  const strengthBit = strengthSessionCount > 0
    ? (muscleGroupFrequency.length
      ? ` Gruppi (forza): ${muscleGroupFrequency.slice(0, 5).map((r) => r.group).join(', ')}.`
      : ' Sessioni di forza registrate.')
    : '';
  const cardioBit = aerobicMinutesDocumented > 0
    ? ` Aerobico documentato: ${Math.round(aerobicMinutesDocumented)} min`
      + (anyIntensity ? ` · classificabili ≈ ${equivModerate} min-eq. moderati.` : ' (intensità non classificata).')
    : '';

  return pillarBase({
    id: 'exercise',
    title: 'Esercizio',
    tone: 'good',
    primaryValue: `${daysWithWorkout}/${windowDays} giorni`,
    shortPhrase: (totalSessions === 1
      ? `Una sessione nella ${windowLabel}.`
      : `${totalSessions} sessioni nella ${windowLabel}.`) + strengthBit + cardioBit,
    hasEvidence: true,
    attention: false,
    positive: daysWithWorkout >= 2,
    detailKey: 'exercise',
    detailNote: `Continuità basata sulle registrazioni (${Math.round(totalMin)} min totali). I giorni senza log non contano come riposo dimostrato. Cardio ≠ sole calorie. Gruppi = chip del diario.`
      + (strengthSessionCount === 0 ? ' Nessuna sessione di forza documentata: non commento bulk/cut né distribuzione muscolare.' : ''),
    series,
    workouts,
    muscleGroupFrequency: strengthSessionCount > 0 ? muscleGroupFrequency : [],
    strengthSessionCount,
    cardio: {
      aerobicMinutesDocumented: Math.round(aerobicMinutesDocumented * 10) / 10,
      moderateMinutes: anyIntensity ? Math.round(moderateMinutes * 10) / 10 : null,
      vigorousMinutes: anyIntensity && vigorousMinutes > 0
        ? Math.round(vigorousMinutes * 10) / 10
        : null,
      equivalentModerateMinutes: anyIntensity ? equivModerate : null,
      intensityDocumented: anyIntensity,
      referenceAdult: '150–300 min moderati / 75–150 vigorosi (o equivalente) a settimana',
    },
    metrics: [`${daysWithWorkout}/${windowDays} giorni`, `${totalSessions} sessioni`],
  });
}

/**
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {string} publicationDate
 */
function buildSleepDayPillar(fullHistory, analysisDate, publicationDate) {
  const sleepNode = getTrackerDayNode(fullHistory, publicationDate);
  const pack = normalizeSleepNight(sleepNode, { publicationDate, lastMealHour: null });
  const sleep = pack.sleep || {};

  if (!pack.sleepAvailable) {
    return pillarBase({
      id: 'sleep',
      title: 'Sonno',
      primaryValue: 'Non registrato',
      shortPhrase: 'Nessuna notte conclusa registrata.',
      detailKey: 'sleep',
      detailNote: `Nessun sonno per il risveglio del ${publicationDate}.`,
      nightEndedOn: publicationDate,
      analysisDay: analysisDate,
    });
  }

  const hours = sleep.hours?.value ?? null;
  const wake = formatClock(sleep.wakeTime?.value);
  // Mostra addormentamento per recorded e derived (wake−hours).
  const bedProvenance = String(sleep.bedtime?.provenance || '').trim().toLowerCase();
  const bedRaw = sleep.bedtime?.value;
  const bedUsable = (bedProvenance === 'recorded'
    || bedProvenance === 'derived'
    || bedProvenance === 'calculated')
    && bedRaw != null
    && Number.isFinite(Number(bedRaw));
  const bed = bedUsable ? formatClock(bedRaw) : null;
  const qualityStars = sleep.qualityStars?.value ?? null;
  const qualityOk = sleep.qualityStars?.provenance === 'recorded' && qualityStars != null;
  const stagesOk = sleep.deepMin?.provenance === 'recorded'
    && sleep.remMin?.provenance === 'recorded'
    && !String(sleep.stagesNote || '').includes('placeholder');

  const attention = hours != null && hours < 6;
  const primaryValue = hours != null ? `${hours} ore` : 'Registrato';

  let shortPhrase = 'Notte conclusa al risveglio.';
  if (hours != null && hours >= 7 && hours <= 9) shortPhrase = 'Durata nella fascia abituale.';
  else if (hours != null && hours < 6) shortPhrase = 'Durata più breve del solito.';
  else if (hours != null) shortPhrase = 'Durata fuori dalla fascia tipica.';

  /** @type {string[]} */
  const metrics = [];
  if (hours != null) metrics.push(`${hours} ore`);
  if (bed) metrics.push(`addormentamento ${bed}`);
  if (wake) metrics.push(`risveglio ${wake}`);
  if (qualityOk) metrics.push(`qualità ${qualityStars}/5`);

  let detailNote = `Notte conclusa al risveglio del ${publicationDate} (dopo la giornata ${analysisDate}).`;
  if (!qualityOk) detailNote += ' Qualità soggettiva non disponibile in modo affidabile.';
  if (!stagesOk) detailNote += ' Fasi del sonno non usate (assenti o non affidabili).';

  return pillarBase({
    id: 'sleep',
    title: 'Sonno',
    tone: attention ? 'warn' : 'good',
    primaryValue,
    shortPhrase,
    hasEvidence: true,
    attention,
    positive: !attention && hours != null,
    detailKey: 'sleep',
    detailNote,
    nightEndedOn: publicationDate,
    analysisDay: analysisDate,
    metrics,
  });
}

/**
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 * @param {string} periodId
 */
function buildSleepTrendPillar(fullHistory, analysisDate, windowDays, periodId) {
  /** @type {object[]} */
  const series = [];
  let nightsLogged = 0;
  /** @type {number[]} */
  const hoursList = [];
  const windowLabel = periodId === 'mese' ? 'mese' : 'settimana';

  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const day = addCalendarDays(analysisDate, -i);
    const wakeDate = addCalendarDays(day, 1);
    const node = getTrackerDayNode(fullHistory, wakeDate);
    const pack = normalizeSleepNight(node, { publicationDate: wakeDate, lastMealHour: null });
    if (!pack.sleepAvailable) {
      series.push({ date: day, wakeDate, status: 'no_sleep_log', hours: null });
      continue;
    }
    nightsLogged += 1;
    const h = pack.sleep?.hours?.value ?? null;
    if (h != null) hoursList.push(h);
    series.push({ date: day, wakeDate, status: 'recorded', hours: h });
  }

  if (nightsLogged === 0) {
    return pillarBase({
      id: 'sleep',
      title: 'Sonno',
      primaryValue: 'Non registrato',
      shortPhrase: `Nessuna notte nella ${windowLabel}.`,
      detailKey: 'sleep',
      detailNote: 'Evidenze insufficienti sul sonno nel periodo.',
      series,
    });
  }

  const avg = hoursList.length
    ? Math.round((hoursList.reduce((a, b) => a + b, 0) / hoursList.length) * 10) / 10
    : null;
  let regularity = 'non valutabile';
  if (hoursList.length >= 3) {
    const min = Math.min(...hoursList);
    const max = Math.max(...hoursList);
    regularity = (max - min) <= 1.5 ? 'abbastanza regolare' : 'variabile';
  }

  return pillarBase({
    id: 'sleep',
    title: 'Sonno',
    tone: regularity === 'variabile' ? 'warn' : 'good',
    primaryValue: avg != null ? `media ${avg} ore` : `${nightsLogged}/${windowDays} notti`,
    shortPhrase: regularity === 'non valutabile'
      ? `${nightsLogged} notti nella ${windowLabel}.`
      : `Andamento ${regularity}.`,
    hasEvidence: true,
    attention: regularity === 'variabile',
    positive: nightsLogged >= Math.ceil(windowDays * 0.4) && regularity !== 'variabile',
    detailKey: 'sleep',
    detailNote: `Risvegli nella ${windowLabel}: ${nightsLogged}/${windowDays} notti. Regolarità: ${regularity}.`,
    series,
    metrics: [`${nightsLogged}/${windowDays} notti`, regularity],
  });
}

/**
 * Coach: tre osservazioni brevi — bene / osservare / azione.
 * Non ripete i numeri delle card; niente causalità certe fra pilastri.
 * @param {{ nutrition: object, exercise: object, sleep: object }} pillars
 * @param {{
 *   periodId?: string,
 *   dayKcal?: number|null,
 *   dayTargetKcal?: number|null,
 * }} [opts]
 */
export function buildDeterministicWellnessCoach(pillars, opts = {}) {
  const list = [pillars.nutrition, pillars.exercise, pillars.sleep].filter(Boolean);
  const positives = list.filter((p) => p.positive && p.hasEvidence);
  const attentions = list.filter((p) => p.attention && p.hasEvidence);
  const missing = list.filter((p) => !p.hasEvidence);
  const evidenced = list.filter((p) => p.hasEvidence);
  const periodId = String(opts.periodId || '').toLowerCase();

  let wentWell = 'Ancora pochi elementi solidi su cui basarmi.';
  if (positives.length) {
    const names = positives.slice(0, 2).map((p) => p.title.toLowerCase());
    wentWell = names.length === 1
      ? `${names[0].charAt(0).toUpperCase() + names[0].slice(1)} risulta ben documentata.`
      : `${names.map((n) => n.charAt(0).toUpperCase() + n.slice(1)).join(' e ')} risultano ben documentati.`;
  } else if (evidenced.length) {
    wentWell = 'Hai delle registrazioni utili; i punti di forza emergono poco ancora.';
  }

  let needsAttention = 'Niente di critico dai dati disponibili.';
  if (attentions.length) {
    needsAttention = `Vale la pena osservare ${attentions[0].title.toLowerCase()} nei prossimi giorni.`;
  } else if (missing.length === 3) {
    needsAttention = 'Mancano basi sufficienti su tutti e tre i pilastri.';
  } else if (missing.length >= 2) {
    needsAttention = `Copertura ancora scarsa su ${missing.map((p) => p.title.toLowerCase()).join(' e ')}.`;
  } else if (missing.length === 1) {
    needsAttention = `${missing[0].title} non ha ancora evidenze in questo periodo.`;
  }

  let concreteAction = 'Continua a registrare i tre pilastri in modo completo.';
  /** @type {string[]} */
  const crossPillarNotes = [];

  const dayKcal = opts.dayKcal != null && Number.isFinite(Number(opts.dayKcal))
    ? Number(opts.dayKcal)
    : null;
  const dayTarget = opts.dayTargetKcal != null && Number.isFinite(Number(opts.dayTargetKcal))
    ? Number(opts.dayTargetKcal)
    : null;
  const workoutDone = Boolean(pillars.exercise?.hasEvidence && (pillars.exercise.workouts || []).length);
  const sleepShort = Boolean(
    pillars.sleep?.hasEvidence
    && (pillars.sleep.attention || /breve|6|5\./i.test(String(pillars.sleep.primaryValue || ''))),
  );
  const energyApparentlyLow = dayKcal != null && (
    (dayTarget != null && dayKcal < dayTarget * 0.55)
    || dayKcal < 1000
  );

  // Ieri: contesto pasti/sonno rispetto a un allenamento GIÀ registrato — prudenza, mai «spingi».
  if (periodId === 'ieri' && workoutDone && (sleepShort || energyApparentlyLow)) {
    needsAttention = sleepShort && energyApparentlyLow
      ? 'Sonno corto e apporto energetico apparentemente basso rispetto a un allenamento già registrato.'
      : sleepShort
        ? 'Sonno più corto del solito accanto a un allenamento già registrato.'
        : 'Apporto energetico della giornata apparentemente contenuto rispetto all’allenamento registrato.';
    concreteAction = 'Per le prossime sessioni valuta un carico più leggero o più riposo se ti senti scarico: non è un divieto automatico.';
    crossPillarNotes.push(
      'Interpretazione sul contesto di ieri (pasto/sonno/allenamento già svolto), non un verdetto settimanale di forza.',
    );
  } else if (evidenced.length === 0) {
    concreteAction = 'Per ora non ho basi sufficienti per un consiglio concreto.';
  } else if (attentions[0]?.id === 'sleep') {
    concreteAction = 'Nei prossimi giorni osserva soprattutto orario e durata del sonno.';
  } else if (attentions[0]?.id === 'nutrition') {
    concreteAction = 'Rivedi i valori segnalati come da verificare nei pasti.';
  } else if (attentions[0]?.id === 'exercise') {
    concreteAction = 'Quando ti alleni, registra durata e tipo di sessione.';
  } else if (missing[0]?.id === 'exercise') {
    concreteAction = 'Se fai attività, registrala: senza log non la vedo.';
  } else if (missing[0]?.id === 'sleep') {
    concreteAction = 'Registra il risveglio per chiudere il quadro del recupero.';
  } else if (missing[0]?.id === 'nutrition') {
    concreteAction = 'Registra i pasti principali quando puoi.';
  } else if (positives[0]) {
    concreteAction = `Mantieni la continuità su ${positives[0].title.toLowerCase()}.`;
  }

  // Vietato linguaggio «sei pronto a spingere» anche se sonno/kcal sembrano ok.
  if (/pronto a spingere|spingi al massimo/i.test(concreteAction)) {
    concreteAction = 'Continua a registrare i tre pilastri in modo completo.';
  }

  const focusPillar = attentions[0] || missing[0] || positives[0] || list[0];

  return {
    schema: 'kentu.focusWellnessCoach.v1',
    title: 'Commento del coach',
    wentWell,
    needsAttention,
    concreteAction,
    wentWellLines: [wentWell],
    needsAttentionLines: [needsAttention],
    primaryPillarId: focusPillar?.id || null,
    crossPillarNotes,
    policy: {
      noHealthScore: true,
      noCausalClaims: true,
      noDeficiencyDiagnosis: true,
      noDemoEditorialReuse: true,
      equalPillars: true,
      shortCardCopy: true,
      maxCoachObservations: 3,
      noPushReadinessClaim: true,
      ieriNotWeeklyStrength: true,
    },
  };
}

/**
 * @param {{
 *   periodId: string,
 *   fullHistory: object,
 *   analysisDate: string,
 *   publicationDate: string,
 *   nutritionView?: object|null,
 *   uid?: string|null,
 *   userTargets?: object|null,
 * }} input
 */
export function buildFocusWellnessPillars(input) {
  const periodId = String(input.periodId || 'ieri').toLowerCase();
  const { fullHistory, analysisDate, publicationDate } = input;
  const userTargets = input.userTargets && typeof input.userTargets === 'object'
    ? input.userTargets
    : null;
  if (!fullHistory || !isIsoDateString(analysisDate) || !isIsoDateString(publicationDate)) {
    return {
      ok: false,
      pillars: null,
      coach: null,
      reason: 'missing_dates_or_history',
    };
  }

  const nutritionView = input.nutritionView || buildFocusPrivateNutritionView({
    periodId,
    uid: input.uid,
    fullHistory,
    analysisDate,
    publicationDate,
    source: 'handoff',
  });

  const nutrition = buildNutritionPillar(nutritionView, periodId);

  let exercise;
  let sleep;
  if (periodId === 'ieri') {
    const dayNode = getTrackerDayNode(fullHistory, analysisDate);
    exercise = buildExerciseDayPillar(dayNode, analysisDate);
    sleep = buildSleepDayPillar(fullHistory, analysisDate, publicationDate);
  } else {
    const windowDays = periodId === 'mese' ? 30 : 7;
    exercise = buildExerciseTrendPillar(fullHistory, analysisDate, windowDays, periodId);
    sleep = buildSleepTrendPillar(fullHistory, analysisDate, windowDays, periodId);
  }

  const pillars = { nutrition, exercise, sleep };
  const dayKcal = periodId === 'ieri' && nutritionView?.ieri?.totals?.kcal?.usableForJudgement
    ? Number(nutritionView.ieri.totals.kcal.value)
    : null;
  const dayTargetKcal = userTargets?.kcal != null ? Number(userTargets.kcal) : null;
  const coach = buildDeterministicWellnessCoach(pillars, {
    periodId,
    dayKcal: Number.isFinite(dayKcal) ? dayKcal : null,
    dayTargetKcal: Number.isFinite(dayTargetKcal) ? dayTargetKcal : null,
  });

  return {
    ok: true,
    periodId,
    analysisDate,
    publicationDate,
    pillars: [nutrition, exercise, sleep],
    pillarsById: pillars,
    coach,
    nutritionView,
  };
}
