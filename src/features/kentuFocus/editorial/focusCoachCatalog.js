/**
 * Catalogo Coach Focus — suggerimenti facoltativi, non medici.
 * Vietato proporre automaticamente “mangia meno” / “allenati di più”.
 */

import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';
import { FOCUS_SCORE_THRESHOLDS } from './focusEditorialConfig.js';
import { isCoachTemplateInCooldown } from './focusEditorialMemory.js';

/**
 * @param {object} dossier
 * @param {object[]} selectedNews
 * @param {object|null} memory
 * @param {string} publicationDate
 * @returns {object|null}
 */
export function selectFocusCoach(dossier, selectedNews, memory, publicationDate) {
  const candidates = [
    coachEarlierDinner(dossier),
    coachHitProtein(dossier),
    coachLogConsistency(dossier, memory),
    coachStabilizeWake(dossier),
  ].filter(Boolean);

  const openExperiments = (memory?.activeExperiments || []).filter((e) => e.status === 'open');
  const admissible = candidates.filter((c) => {
    if (isCoachTemplateInCooldown(memory, c.templateId, publicationDate)) return false;
    if (!isCompatibleWithRecovery(dossier, c)) return false;
    if (contradictsOpenExperiment(memory, c.templateId)) return false;
    // Max 1 esperimento aperto: nessun nuovo coach con follow-up finché ne resta uno.
    if (openExperiments.length > 0 && c.horizonDays) return false;
    return c.supportScore >= FOCUS_SCORE_THRESHOLDS.coachMin;
  });

  if (admissible.length === 0) return null;

  admissible.sort((a, b) => {
    if (b.supportScore !== a.supportScore) return b.supportScore - a.supportScore;
    return String(a.templateId).localeCompare(String(b.templateId));
  });

  const best = admissible[0];
  return {
    id: `coach_${best.templateId.toLowerCase()}`,
    templateId: best.templateId,
    textSeed: best.textSeed,
    refs: best.refs,
    horizonDays: best.horizonDays,
    followUp: best.followUp,
    supportScore: best.supportScore,
    suppressed: false,
    suppressReason: null,
    doNotClaim: best.doNotClaim || ['prescrizione medica', 'diagnosi'],
  };
}

function coachEarlierDinner(dossier) {
  const buffer = dossier.sleep?.dinnerSleepBufferH;
  if (buffer?.provenance === FOCUS_PROVENANCE.missing || buffer?.value == null) return null;
  if (buffer.value >= FOCUS_SCORE_THRESHOLDS.dinnerBufferShortH) return null;
  return {
    templateId: 'EARLIER_DINNER',
    textSeed: 'Prova ad anticipare la cena di circa 30–45 minuti per 3 sere.',
    refs: ['sleep.dinnerSleepBufferH', 'day.nutrition.lastMealHour'],
    horizonDays: 3,
    followUp: {
      metricPaths: ['sleep.dinnerSleepBufferH'],
      windowDays: 7,
    },
    supportScore: 70,
    doNotClaim: ['la cena tardi causa insonnia'],
  };
}

function coachHitProtein(dossier) {
  const prot = dossier.day?.nutrition?.totals?.proteinG;
  const target = dossier.day?.nutrition?.targets?.proteinG;
  if (prot?.value == null || target?.value == null || target.value <= 0) return null;
  // Target assenti/missing o non recorded → non affidabili per un intervento.
  if (target.provenance !== FOCUS_PROVENANCE.recorded) return null;
  const ratio = prot.value / target.value;
  if (ratio >= FOCUS_SCORE_THRESHOLDS.proteinNearTargetRatio) return null;
  if (ratio < 0.5) return null; // troppo lontano: non spingere un “hit” irrealistico in un giorno
  return {
    templateId: 'HIT_PROTEIN_PORTION',
    textSeed: 'Aggiungi una porzione proteica a un pasto già previsto (es. yogurt, uova, legumi).',
    refs: ['day.nutrition.totals.proteinG', 'day.nutrition.targets.proteinG'],
    horizonDays: 3,
    followUp: {
      metricPaths: ['day.nutrition.totals.proteinG'],
      windowDays: 7,
    },
    supportScore: 62,
    doNotClaim: ['devi mangiare di meno', 'deficit calorico'],
  };
}

function coachLogConsistency(dossier, memory) {
  if (!dossier.meta?.flags?.incompleteDay) return null;
  if (dossier.meta?.coverage?.analysisDayHasFood) return null;
  // Richiede un contesto edizione (sonno presente): non spingere il log su giornata totalmente vuota.
  if (!dossier.meta?.coverage?.sleepAvailable) return null;
  // Evita ripetitività: ultimo coach pubblicato già LOG_CONSISTENCY → non riproporre.
  const lastCoach = Array.isArray(memory?.recentCoach) ? memory.recentCoach[0] : null;
  if (lastCoach?.templateId === 'LOG_CONSISTENCY') return null;
  const openSame = (memory?.activeExperiments || []).some(
    (e) => e.status === 'open' && e.templateId === 'LOG_CONSISTENCY',
  );
  if (openSame) return null;
  return {
    templateId: 'LOG_CONSISTENCY',
    textSeed: 'Se ti è comodo, registra almeno un pasto principale: aiuta il quotidiano a raccontare la giornata.',
    refs: ['meta.flags.incompleteDay'],
    horizonDays: 5,
    followUp: {
      metricPaths: ['meta.coverage.analysisDayHasFood'],
      windowDays: 7,
    },
    supportScore: 52,
    doNotClaim: ['non sei costante', 'aderenza scarsa'],
  };
}

function coachStabilizeWake(dossier) {
  const wake = dossier.sleep?.wakeTime;
  const hours = dossier.sleep?.hours;
  if (wake?.value == null || hours?.value == null) return null;
  if (hours.value < FOCUS_SCORE_THRESHOLDS.sleepShortHours) return null;
  // Solo se partial/missing bedtime suggerisce timing instabile
  if (!dossier.meta?.flags?.sleepPartial && dossier.sleep?.bedtime?.value != null) {
    return null;
  }
  return {
    templateId: 'STABILIZE_WAKE',
    textSeed: 'Mantieni la stessa fascia di sveglia (±30 min) per qualche giorno, se il ritmo te lo consente.',
    refs: ['sleep.wakeTime'],
    horizonDays: 5,
    followUp: {
      metricPaths: ['sleep.wakeTime'],
      windowDays: 7,
    },
    supportScore: 54,
    doNotClaim: ['cura dell’insonnia'],
  };
}

function isCompatibleWithRecovery(dossier, coach) {
  const hours = dossier.sleep?.hours?.value;
  // Nessun consiglio di carico/allenamento aggiuntivo quando il sonno è corto.
  if (hours != null && hours < FOCUS_SCORE_THRESHOLDS.sleepShortHours) {
    if (coach.templateId === 'EASY_SESSION' || coach.templateId === 'ADD_VOLUME') {
      return false;
    }
  }
  return true;
}

function contradictsOpenExperiment(memory, templateId) {
  const open = (memory?.activeExperiments || []).filter((e) => e.status === 'open');
  if (open.length === 0) return false;
  return open.some((e) => e.templateId === templateId);
}
