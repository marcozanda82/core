import {
  buildSleepCoachPlan,
  buildSleepDataFromDailyHistory,
  isSleepLimitingFactor,
} from './sleepCoachEngine';

/**
 * Allineato a {@link classifyMapPoint} / calculateMetabolicMapPosition (solo lettura, non muta il motore mappa).
 * @param {number} distance
 * @returns {'green' | 'orange' | 'red'}
 */
function zoneFromMapDistance(distance) {
  const d = Number(distance) || 0;
  if (d > 70) return 'red';
  if (d > 35) return 'orange';
  return 'green';
}

/**
 * Access layer coach: preferisce `bundle.metabolicState`, fallback campi legacy sul bundle.
 *
 * @param {Record<string, unknown> | null | undefined} bundle
 * @returns {'green' | 'orange' | 'red'}
 */
export function getCoachZone(bundle) {
  const ms = bundle?.metabolicState;
  const z = ms?.bodyState?.zone;
  if (z === 'green' || z === 'orange' || z === 'red') return z;
  const distMs = Number(ms?.bodyState?.distance);
  if (Number.isFinite(distMs)) return zoneFromMapDistance(distMs);
  return zoneFromMapDistance(bundle?.distance);
}

/**
 * @param {Record<string, unknown> | null | undefined} bundle
 * @returns {string}
 */
export function getCoachDirectionLabel(bundle) {
  const ms = bundle?.metabolicState;
  const fromMs = ms?.metabolicDirection?.displayLabel;
  if (typeof fromMs === 'string' && fromMs.trim()) return fromMs.trim();
  return String(bundle?.compassDisplayLabel ?? '').trim();
}

/**
 * @param {Record<string, unknown> | null | undefined} bundle
 * @returns {'very_weak' | 'weak' | 'moderate' | 'strong' | null}
 */
export function getCoachSignalStrength(bundle) {
  const ms = bundle?.metabolicState;
  const fromMs =
    ms?.metabolicDirection?.signalStrength ?? ms?.confidence?.compassSignalStrength;
  if (
    fromMs === 'very_weak' ||
    fromMs === 'weak' ||
    fromMs === 'moderate' ||
    fromMs === 'strong'
  ) {
    return fromMs;
  }
  const leg = bundle?.mapSignalStrength ?? bundle?.compassSignalStrength;
  if (
    leg === 'very_weak' ||
    leg === 'weak' ||
    leg === 'moderate' ||
    leg === 'strong'
  ) {
    return leg;
  }
  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} bundle
 * @returns {boolean}
 */
export function getCoachSuppressRisk(bundle) {
  const ms = bundle?.metabolicState;
  const pres = ms?.confidence?.mapPresentation ?? bundle?.mapPresentation;
  return pres?.suppressRiskNarrative === true;
}

/**
 * @param {Record<string, unknown> | null | undefined} bundle
 * @returns {number | null}
 */
export function getCoachPersistenceFrac(bundle) {
  const ms = bundle?.metabolicState;
  const p = Number(ms?.persistence?.outsideEnergyDeadbandDayFraction);
  if (Number.isFinite(p)) return p;
  const leg = Number(bundle?.persistFracOutsideDeadband);
  return Number.isFinite(leg) ? leg : null;
}

function isSoftCompassDisplayLabel(label) {
  const s = String(label || '').toLowerCase();
  return (
    s.includes('debole') ||
    s.includes('quasi neutro') ||
    s.includes('tendenza lieve') ||
    s.includes('lieve verso')
  );
}

const DEFAULT_INSIGHT = {
  severity: 'info',
  title: 'Coach metabolico',
  message: 'Aggiungi qualche giorno di diario per un feedback più preciso.',
  guidanceSteps: null,
  actions: null,
  reason: null,
  actionLabel: null,
};

/**
 * @param {object} insight
 * @param {{
 *   mapData: object,
 *   dailyHistory: Array<{ date?: string, sleepHours?: number | null }>,
 *   selectedTimeframe: string,
 * }} ctx
 */
function mergeSleepIfLimiting(insight, ctx) {
  const { mapData, dailyHistory, selectedTimeframe } = ctx;
  const inputs = mapData.metabolicMapInputs || {};
  const raw = mapData.metabolicMapRawDetails || {};
  const sleepBase = buildSleepDataFromDailyHistory(
    Array.isArray(dailyHistory) ? dailyHistory : [],
    selectedTimeframe,
    inputs
  );
  const sleepData = {
    ...sleepBase,
    sleepPenalty: Number(mapData.sleepPenalty) || 0,
  };
  const highTraining = Number(raw.meanTraining01) >= 62;
  if (
    !isSleepLimitingFactor(
      {
        avgHours: sleepData.avgHours,
        lastNightHours: sleepData.lastNightHours,
        hoursByDay: sleepData.hoursByDay,
        sleepPenalty: sleepData.sleepPenalty,
      },
      highTraining
    )
  ) {
    return { ...insight, actions: null };
  }

  const plan = buildSleepCoachPlan({
    sleepData,
    recentHabits: { highTrainingLoad: highTraining },
    currentTime: new Date(),
  });
  if (!plan) {
    return { ...insight, actions: null };
  }

  const actions = plan.actions.length ? [...plan.actions] : null;
  if (plan.priority === 'critical') {
    return {
      ...insight,
      title: plan.title,
      message: plan.message,
      actions,
    };
  }

  const msg = [insight.message, plan.message].filter(Boolean).join(' ');
  return {
    ...insight,
    message: msg,
    actions,
  };
}

/**
 * Messaggio coach puro da stato mappa + bussola (nessuna modifica a TDEE / target).
 *
 * @param {{
 *   mapData?: object | null,
 *   userTargets?: { kcal?: number } | null,
 *   selectedTimeframe?: string,
 *   dailyHistory?: Array<{ date?: string, sleepHours?: number | null }>,
 * }} param0
 * @returns {{
 *   severity: 'info' | 'warning' | 'good',
 *   title: string,
 *   message: string,
 *   guidanceSteps: string[] | null,
 *   actions: string[] | null,
 *   reason: string | null,
 *   actionLabel: string | null,
 * }}
 */
export function buildMetabolicCoachInsight({
  mapData = null,
  userTargets = null,
  selectedTimeframe = '7d',
  dailyHistory = [],
} = {}) {
  const tf = selectedTimeframe != null ? String(selectedTimeframe) : '7d';

  if (!mapData || typeof mapData !== 'object') {
    return { ...DEFAULT_INSIGHT };
  }

  const sleepCtx = { mapData, dailyHistory, selectedTimeframe: tf };

  const ms = mapData.metabolicState ?? null;
  const usingMetabolicState = ms != null && typeof ms === 'object';

  const strength = getCoachSignalStrength(mapData);
  const displayLabel = getCoachDirectionLabel(mapData);
  const suppressRisk = getCoachSuppressRisk(mapData);
  const zone = getCoachZone(mapData);
  const persistenceFrac = getCoachPersistenceFrac(mapData);

  if (import.meta.env.DEV) {
    console.log('[metabolicCoach:DEV]', {
      usingMetabolicState,
      zone,
      displayLabel,
      signalStrength: strength,
      persistence: persistenceFrac,
    });
  }

  const glycemic = Number(mapData.glycemic ?? mapData.metabolicMapInputs?.glycemicInstability ?? 0) || 0;
  const longevity = Number(mapData.longevityScore);
  const kcalTarget = userTargets?.kcal;

  if (strength === 'very_weak') {
    const inputs = mapData.metabolicMapInputs || {};
    const validDays = Number(inputs.totalWindowDays) || 0;
    const instab = Number(mapData.glycemic ?? inputs.glycemicInstability ?? 0) || 0;

    const guidanceSteps = [
      'Mantieni un apporto calorico coerente per almeno 3–5 giorni',
      'Evita variazioni brusche di allenamento',
      'Continua a registrare sonno e alimentazione con precisione',
    ];

    if (validDays < 5) {
      guidanceSteps.push('Servono più giorni di dati per una valutazione affidabile');
    }

    if (instab > 48) {
      guidanceSteps.push(
        'Riduci la variabilità giornaliera per migliorare la lettura del trend',
      );
    }

    return mergeSleepIfLimiting(
      {
        severity: 'info',
        title: 'Nessuna direzione chiara',
        message: 'I dati non indicano ancora una direzione metabolica chiara.',
        guidanceSteps,
        reason: `Periodo analizzato: ${tf}`,
        actionLabel: null,
      },
      sleepCtx
    );
  }

  if (strength === 'weak' || isSoftCompassDisplayLabel(displayLabel)) {
    return mergeSleepIfLimiting(
      {
        severity: 'info',
        title: 'Quadro in evoluzione',
        message:
          displayLabel ||
          'Il segnale è ancora leggero: un po’ più di dati consecutivi aiuta a definire il trend.',
        guidanceSteps: null,
        reason: kcalTarget ? `${tf} · obiettivo ${Math.round(kcalTarget)} kcal` : `Periodo: ${tf}`,
        actionLabel: null,
      },
      sleepCtx
    );
  }

  const strongEnough = strength === 'moderate' || strength === 'strong';
  const riskVisible = !suppressRisk && strongEnough;

  if (riskVisible && (zone === 'red' || zone === 'orange' || glycemic > 55)) {
    const parts = [];
    if (zone === 'red') parts.push('distanza dalla Blue Zone elevata');
    else if (zone === 'orange') parts.push('transizione verso una zona di maggiore adattamento');
    if (glycemic > 55) parts.push('instabilità glicemica teorica sopra la media');

    return mergeSleepIfLimiting(
      {
        severity: 'warning',
        title: 'Spazio di miglioramento',
        message:
          'Con il segnale attuale vale la pena osservare recupero, bilancio e qualità del sonno nella finestra selezionata.',
        reason: parts.length ? parts.join(' · ') : `Mappa · ${tf}`,
        actionLabel: 'Controlla diario e sonno',
        guidanceSteps: null,
      },
      sleepCtx
    );
  }

  if (strongEnough && zone === 'green') {
    const lowGly = glycemic <= 50;
    return mergeSleepIfLimiting(
      {
        severity: 'good',
        title: lowGly ? 'Profilo ordinato' : 'Buon equilibrio',
        message:
          displayLabel && !isSoftCompassDisplayLabel(displayLabel)
            ? lowGly
              ? `${displayLabel} — la mappa resta nella Blue Zone con segnale sufficiente.`
              : `${displayLabel} — zona favorevole con qualche fattore da osservare (es. bilancio).`
            : lowGly
              ? 'Bussola e mappa concordano su un profilo complessivamente controllato.'
              : 'Posizione vicina al centro: ottima base, monitora comunque glicemia teorica e carico.',
        reason:
          Number.isFinite(longevity) && longevity > 0
            ? `Longevity indicativa ${Math.round(longevity)} · ${tf}`
            : `Finestra ${tf}`,
        actionLabel: lowGly ? 'Continua con costanza' : null,
        guidanceSteps: null,
      },
      sleepCtx
    );
  }

  return mergeSleepIfLimiting(
    {
      severity: 'info',
      title: 'Monitoraggio',
      message: displayLabel || 'Segui il trend nei prossimi giorni con logging regolare.',
      reason: tf,
      actionLabel: null,
      guidanceSteps: null,
    },
    sleepCtx
  );
}
