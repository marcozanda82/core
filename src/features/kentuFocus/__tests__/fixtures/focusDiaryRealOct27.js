/**
 * Loader fixture diario reale 2026-10-27 (anonimizzato).
 * Rigenerare con: node scripts/exportFocusDiaryFixture.mjs
 * (o dalla cache browser allineata a RTDB).
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAW = require('./focusDiary.2026-10-27.real.json');

export const FOCUS_REAL_ANALYSIS_DATE = '2026-10-27';
export const FOCUS_REAL_PUBLICATION_DATE = '2026-10-28';

/** Cataloghi minimi per classificazione deterministica nei test (Duchessa = OFF). */
export const FOCUS_REAL_OCT27_CATALOGS = Object.freeze({
  personalDb: {},
  kentuItDb: {
    salmone: {
      italianName: 'Salmone',
      semanticTags: { novaGroup: 1 },
      omega3: 2.5,
      food_group: 'pesci',
    },
    pomodoro: {
      italianName: 'Pomodoro',
      semanticTags: { novaGroup: 1 },
      crea_group: 'verdure',
    },
    'cipolla rossa': {
      italianName: 'Cipolla rossa',
      semanticTags: { novaGroup: 1 },
      food_group: 'verdure',
    },
    'pane integrale con semi e noci': {
      italianName: 'Pane integrale con semi e noci',
      semanticTags: { novaGroup: 1 },
      food_group: 'cereali integrali',
    },
  },
  globalDb: {},
  offDb: {
    // Prodotto OFF (non CREA): chiave come sul diario
    food_1793113115547_Torta_gelato_Duchessa: {
      product_name: 'Torta gelato Duchessa',
      semanticTags: { novaGroup: 4 },
      categories_tags: ['en:desserts', 'en:ice-creams', 'en:sweet-snacks'],
      nova_group: 4,
      nutriscore_grade: 'e',
      nutriments: {
        sugars_100g: 28,
        'saturated-fat_100g': 8,
      },
    },
    'excellence 85% cioccolato rich dark': {
      product_name: 'Excellence 85% Cioccolato Rich Dark',
      semanticTags: { novaGroup: 4 },
      categories_tags: ['en:chocolates'],
      nutriscore_grade: 'c',
      nutriments: {
        sugars_100g: 14,
        'saturated-fat_100g': 22,
      },
    },
  },
  offReady: true,
});

/**
 * @returns {{
 *   analysisDate: string,
 *   publicationDate: string,
 *   fullHistory: object,
 *   userTargets: { kcal: number, prot: number, carb: number, fat: number },
 *   profile_targets: object,
 * }}
 */
export function loadFocusDiaryRealOct27() {
  const analysisDate = String(RAW.analysisDate || FOCUS_REAL_ANALYSIS_DATE);
  const publicationDate = String(RAW.publicationDate || FOCUS_REAL_PUBLICATION_DATE);
  const targets = RAW.profile_targets?.targets || {};
  return {
    analysisDate,
    publicationDate,
    fullHistory: RAW.fullHistory || {},
    profile_targets: RAW.profile_targets || {},
    userTargets: {
      kcal: Number(targets.kcal) || 2456,
      prot: Number(targets.prot) || 127,
      carb: Number(targets.carb) || 282,
      fat: Number(targets.fat) || 65,
    },
    raw: RAW,
  };
}

/**
 * Bozza rapporto v4 coerente col diario reale (dev / test, senza Gemini).
 * @param {object} dossier
 */
export function buildRealOct27ReportJson(dossier) {
  let duchessaEvent = null;
  let salmonId = null;
  for (const meal of dossier.nutrition?.meals || []) {
    for (const it of meal.items || []) {
      if (/duchessa/i.test(it.name || '')) duchessaEvent = it.eventId;
      if (/salmone/i.test(it.name || '') && !salmonId) salmonId = it.eventId;
    }
  }
  const sleepId = dossier.sleep?.day?.eventId
    || (dossier.eventIndex?.ids || []).find((id) => String(id).startsWith('sleep:'));

  const dvr = dossier.editorialReadingContext?.dayVersusRecent;
  const dayKcal = dvr?.day?.intakeKcal ?? null;
  const target = dvr?.declaredTargetKcal ?? null;
  const mean7 = dvr?.recent7dExcludingAnalysisDay?.meanIntakeKcal ?? null;

  const active = new Set(dossier.deterministicSignals?.activeIds || []);
  const heavy = dossier.deterministicSignals?.heavyLateMeal
    || (dossier.deterministicSignals?.signals || []).find((s) => s.id === 'heavy_late_meal' && s.active);
  const dinnerHour = heavy?.clockHour ?? 21.667;
  const hh = Math.floor(dinnerHour);
  const mm = Math.round((dinnerHour - hh) * 60);
  const dinnerClock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  const dolceSubs = dossier.nutrition?.substitutionCandidates?.byOccasion?.dolce
    || dossier.nutrition?.substitutionCandidates?.byOccasion?.dessert
    || [];
  const sub = dolceSubs.find((c) => /^(mela|yogurt)/i.test(String(c.name || '').trim()))
    || dolceSubs.find((c) => /mela|yogurt/i.test(c.name || ''))
    || dolceSubs[0]
    || null;
  const genericDolce = dossier.nutrition?.substitutionCandidates?.genericFallback?.dolce
    || 'frutta fresca';
  const subPhrase = sub
    ? `${sub.displayNameMidSentence || String(sub.name || '').toLowerCase()}${sub.typicalGrams != null ? ` (~${sub.typicalGrams} g)` : ''}`
    : genericDolce;

  const combineSleepMeal = active.has('meal_within_3h_of_bedtime') || active.has('heavy_late_meal');
  const mealBed = (dossier.deterministicSignals?.signals || [])
    .find((s) => s.id === 'meal_within_3h_of_bedtime');
  const approxBed = mealBed?.bedtimeProvenance === 'derived' || mealBed?.bedtimeProvenance === 'calculated';
  const sleepImproveText = combineSleepMeal
    ? (active.has('meal_within_3h_of_bedtime') && approxBed
      ? `Cena alle ${dinnerClock} e notte da circa 6,5 ore`
      : `Cena abbondante alle ${dinnerClock} e notte da 6,5 ore`)
    : 'Sonno a 6,5 ore, sotto le 7';
  const dinnerEventId = heavy?.eventId || salmonId;
  const sleepImproveRefs = [
    ...(sleepId ? [sleepId] : []),
    ...(combineSleepMeal && dinnerEventId ? [dinnerEventId] : []),
  ];

  return {
    summary: {
      headline: 'Pranzo dolce e sonno sotto le 7 ore',
      wentWell: [
        {
          text: dayKcal != null && target != null
            ? `Energia ok: ${dayKcal} kcal vs target ${target}, in linea con la media recente.`
            : 'Energia del giorno vicina al target.',
          area: 'energia',
          eventRefs: [],
        },
        {
          text: 'A cena c’è salmone: grassi buoni utili nella giornata.',
          area: 'qualita',
          eventRefs: salmonId ? [salmonId] : [],
        },
      ],
      toImprove: [
        {
          text: 'A pranzo la torta gelato è un dessert ultra-processato.',
          area: 'qualita',
          eventRefs: duchessaEvent ? [duchessaEvent] : [],
        },
        {
          text: sleepImproveText,
          area: 'sonno',
          eventRefs: sleepImproveRefs,
        },
      ],
      todayAction: {
        text: `A pranzo sostituisci il dessert ultra-processato con ${subPhrase}.`,
        toImproveIndex: 0,
        eventRefs: duchessaEvent ? [duchessaEvent] : [],
        area: 'qualita',
      },
    },
    headline: 'Pranzo dolce e sonno sotto le 7 ore',
    lead: dayKcal != null && target != null && mean7 != null
      ? `Introito ${dayKcal} kcal (target ${target}, media 7g ${mean7}): il margine chiaro resta il dessert a pranzo.`
      : null,
    sections: [
      {
        id: 'qualita',
        title: 'Qualità a pranzo',
        body: 'La Torta gelato Duchessa risulta NOVA 4 dal catalogo Open Food Facts. In diario ci sono già alternative meno lavorate per la stessa occasione.',
      },
      {
        id: 'sonno',
        title: 'Sonno e orari',
        body: `Notte da 6,5 ore. Cena intorno alle ${dinnerClock} con carico elevato: da osservare insieme nei prossimi giorni.`,
      },
    ],
    keyInsight: 'La leva più diretta è il dessert a pranzo, non un taglio calorico generico.',
    recommendedAction: `A pranzo sostituisci il dessert ultra-processato con ${subPhrase}; lascia invariato il resto del pasto.`,
    expectedChange: 'Meno carico ultra-processato a pranzo; calorie giorno da rivedere solo se cambi anche le porzioni.',
    verifyNext: 'Per 7–14 giorni: dessert ultra-processati a pranzo, ora cena e ore di sonno al risveglio.',
    evidenceRefs: [
      'nutrition.foodQuality.day.nova4Items',
      'deterministicSignals.sleep_under_7h',
      ...(active.has('meal_within_3h_of_bedtime')
        ? ['deterministicSignals.meal_within_3h_of_bedtime']
        : []),
      ...(active.has('heavy_late_meal') ? ['deterministicSignals.heavy_late_meal'] : []),
      'nutrition.substitutionCandidates',
    ],
    limits: [
      'Nessuna attività registrata.',
      'Un solo giorno non descrive un’abitudine.',
    ],
    claimLayers: {
      recordedFacts: [
        'Duchessa classificato NOVA 4',
        'Sonno 6,5 h',
        active.has('meal_within_3h_of_bedtime')
          ? (approxBed
            ? 'Ultimo pasto entro circa 3 h dal bedtime (derived)'
            : 'Ultimo pasto entro 3 h dal bedtime')
          : null,
        heavy ? `Cena ${heavy.kcal} kcal` : null,
      ].filter(Boolean),
      generalKnowledge: [],
      foundedInferences: ['Il dessert a pranzo è la leva più chiara del giorno'],
      hypothesesToTest: ['Sostituire il dessert con un’alternativa già in diario migliora la qualità del pranzo'],
    },
    primaryPillarId: 'nutrition',
    quantitativeProposal: null,
  };
}
