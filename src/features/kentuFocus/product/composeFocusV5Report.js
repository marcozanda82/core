/**
 * Rapporto v5 scritto dai fatti già decisi. Serve ai test e come lettura
 * del contratto: lo stato non viene giudicato di nuovo.
 */

import { lineWithPenaltyCites } from './focusPenaltyCite.js';
import { PILLAR_STATUS } from '../score/scoreConfig.kds-3.js';

const LABELS = Object.freeze({
  alimentazione: 'Alimentazione',
  sonno: 'Sonno',
  movimento: 'Movimento',
  forza: 'Forza',
});

const ACT_ACTION = Object.freeze({
  energy_very_low_repeated: 'avvicina i pasti all’obiettivo, senza stringere oltre',
  weight_loss_fast: 'rallenta il calo del peso',
  protein_low_in_deficit: 'aggiungi una fonte proteica a un pasto',
  no_rest_streak: 'prendi il riposo come obiettivo e salta la sessione dura',
  load_spike: 'tieni il carico più basso delle settimane precedenti',
  same_district_no_recovery: 'lascia riposare il distretto allenato da poco',
  overreaching: 'tratta una settimana di scarico come un successo',
  restrictive_pattern: 'scegli un pasto semplice, senza stringere',
});

/**
 * @param {object} brief buildFocusPeriodBrief
 */
export function composeFocusV5Report(brief) {
  const active = (brief?.pillars || []).filter((item) => item.active);
  const missing = (brief?.pillars || []).filter((item) => item.status === 'no_data');
  const act = (brief?.safety?.signals || []).find((item) => item.level === 'act');
  const pillar = brief?.actionPillar || 'alimentazione';
  const chosen = active.find((item) => item.id === pillar) || null;
  const low = brief?.reliability === 'low';
  const medium = brief?.reliability === 'medium';
  const quiet = brief?.safety?.suppressNumbers === true;
  const day = brief?.horizon === 'oggi' || brief?.periodId === 'ieri';

  const headline = buildHeadline(brief, chosen, low, act);
  const pillars = active.map((item) => ({
    id: item.id,
    line: clip(pillarLine(item, quiet), 110),
    tone: toneFor(item, brief),
    eventRefs: [],
  }));
  const action = {
    text: clip(buildAction(brief, chosen, act, quiet), 140),
    pillar,
    horizon: brief?.actionHorizon || brief?.horizon || 'oggi',
  };
  const deepDive = {
    lead: clip(buildLead(chosen, quiet, low), 320),
    sections: chosen ? [{
      id: chosen.id,
      title: LABELS[chosen.id] || chosen.id,
      body: clip(quiet ? quietLine(chosen) : (chosen.keyFact || statusLine(chosen)), 320),
    }] : [],
    limits: [
      ...(low ? [day
        ? 'Affidabilità bassa: il giorno è approssimato oppure ha buchi.'
        : 'Affidabilità bassa: ci sono giorni approssimati oppure con buchi.'] : []),
      ...(medium && day ? ['Affidabilità media: il giorno non è confermato.'] : []),
      ...(brief?.unconfirmedNote ? [brief.unconfirmedNote] : []),
      ...(brief?.movementEstimateNote ? [brief.movementEstimateNote] : []),
    ],
    evidenceRefs: [],
  };
  const support = brief?.support
    ? { text: 'Se ti va, confrontati con un professionista.' }
    : null;

  return {
    schema: 'kentu.focusAiCoachAnalysis.v5',
    headline,
    pillars,
    unrecorded: missing.map((item) => ({ id: item.id, line: 'non registrato' })),
    action,
    support,
    deepDive,
  };
}

function buildHeadline(brief, chosen, low, act) {
  const day = brief?.horizon === 'oggi' || brief?.periodId === 'ieri';
  if (low && day) return 'Un giorno da leggere con calma';
  if (act?.id === 'restrictive_pattern') return 'Meglio alleggerire i numeri e il giudizio';
  if (brief?.calibration?.active) {
    const cause = chosen ? impactPhrase(chosen) : 'pochi dati';
    return `Kentu sta imparando: ${cause}`;
  }
  const state = trackWord(brief?.score);
  if (!state) return day ? 'Pochi dati per leggere la giornata' : 'Pochi dati per leggere il periodo';
  if (state === 'sulla rotta') return onTrackHeadline(brief, chosen);
  if (!chosen) return day ? 'Pochi dati per leggere la giornata' : 'Pochi dati per leggere il periodo';
  return `${periodNoun(brief)} ${state}: ${impactPhrase(chosen)}`;
}

/** Prima i pilastri andati bene, poi eventualmente il punto da migliorare. */
function onTrackHeadline(brief, chosen) {
  const noun = periodNoun(brief);
  const active = (brief?.pillars || []).filter((item) => (
    item?.active && item.status && item.status !== 'no_data' && item.status !== 'inactive'
  ));
  const good = active.filter((item) => item.status === 'on_track');
  const improve = active.find((item) => item.status === 'off_track' || item.status === 'halfway')
    || (chosen && chosen.status !== 'on_track' ? chosen : null);

  const goodPart = goodNamesPhrase(good);
  if (goodPart && improve) {
    return `${noun} sulla rotta: ${goodPart}; ${impactPhrase(improve)}`;
  }
  if (goodPart) return `${noun} sulla rotta: ${goodPart}`;
  if (chosen) return `${noun} sulla rotta: ${impactPhrase(chosen)}`;
  return `${noun} sulla rotta`;
}

function goodNamesPhrase(good) {
  const names = good.map((item) => pillarShort(item.id)).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} al suo posto`;
  if (names.length === 2) return `${names[0]} e ${names[1]} al loro posto`;
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]} al loro posto`;
}

function pillarShort(id) {
  if (id === 'alimentazione') return 'pasti';
  if (id === 'sonno') return 'sonno';
  if (id === 'movimento') return 'movimento';
  if (id === 'forza') return 'forza';
  return '';
}

function trackWord(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  if (value >= PILLAR_STATUS.onTrackMin) return 'sulla rotta';
  if (value >= PILLAR_STATUS.halfwayMin) return 'a metà';
  return 'fuori rotta';
}

function periodNoun(brief) {
  if (brief?.periodId === 'mese' || brief?.horizon === 'questo mese') return 'Mese';
  if (brief?.periodId === 'settimana' || brief?.horizon === 'questa settimana') return 'Settimana';
  return 'Giornata';
}

function impactPhrase(chosen) {
  const steady = chosen.status === 'on_track';
  const fact = String(chosen.keyFact || '');
  if (chosen.id === 'alimentazione') {
    if (/\bsotto\b/.test(fact)) return 'pasti sotto l\'obiettivo';
    if (/\bsopra\b/.test(fact)) return 'pasti sopra l\'obiettivo';
    if (/fuori fascia/.test(fact)) return 'pasti fuori fascia';
    return steady ? 'pasti in linea' : 'pasti lontani dall\'obiettivo';
  }
  if (chosen.id === 'movimento') return steady ? 'movimento in linea' : 'poco movimento';
  if (chosen.id === 'sonno') return steady ? 'sonno in fascia' : 'sonno fuori fascia';
  if (chosen.id === 'forza') return steady ? 'forza in linea' : 'forza da riprendere';
  return steady ? 'in linea' : 'da sistemare';
}

function buildAction(brief, chosen, act, quiet) {
  const horizon = brief?.actionHorizon || brief?.horizon;
  if (act?.id === 'restrictive_pattern' || quiet) {
    return withHorizon(horizon, 'scegli un pasto semplice, senza stringere');
  }
  if (act) {
    const verb = ACT_ACTION[act.id] || 'rallenta e tratta il riposo come un obiettivo';
    return withHorizon(horizon, verb);
  }
  if (!chosen) return withHorizon(horizon, 'registra almeno un pasto, così il periodo si può leggere');
  if (chosen.id === 'alimentazione' && brief?.actionClose?.unit === 'causa') {
    return withHorizon(horizon, brief.actionClose.phrase);
  }
  if (chosen.status === 'on_track') return maintainPhrase(chosen.id);
  if (brief?.actionClose?.phrase) return withHorizon(horizon, brief.actionClose.phrase);
  if (chosen.id === 'sonno') return withHorizon(horizon, 'vai a letto 20 minuti prima, stasera');
  if (chosen.id === 'movimento') return withHorizon(horizon, 'fai una camminata di 10 minuti nel pomeriggio');
  if (chosen.id === 'forza') return withHorizon(horizon, 'fai una sessione di parte alta nel pomeriggio');
  return withHorizon(horizon, 'aggiungi uno spuntino a metà pomeriggio (circa 300 kcal)');
}

function maintainPhrase(id) {
  if (id === 'movimento') return 'Continua così con le camminate.';
  if (id === 'sonno') return 'Continua così con il sonno.';
  if (id === 'forza') return 'Continua così con la forza.';
  return 'Continua così con i pasti.';
}

function buildLead(chosen, quiet, low) {
  if (quiet) return 'I numeri di calorie, peso e grammi restano fuori da questo rapporto.';
  if (!chosen) return low ? 'Il periodo ha pochi elementi confermati.' : 'Il periodo ha pochi elementi da raccontare.';
  return chosen.keyFact || statusLine(chosen);
}

function pillarLine(item, quiet) {
  const base = quiet ? quietLine(item) : (item.keyFact || statusLine(item));
  if (quiet) return base;
  return lineWithPenaltyCites(base, item.penalties);
}

function quietLine(item) {
  if (item.id === 'alimentazione') return 'I pasti ci sono: meglio non insistere sulle quantità.';
  return statusLine(item);
}

function statusLine(item) {
  if (item.status === 'on_track') return `${LABELS[item.id]} è sulla rotta.`;
  if (item.status === 'halfway') return `${LABELS[item.id]} è a metà strada.`;
  return `${LABELS[item.id]} chiede un aggiustamento.`;
}

function toneFor(item, brief) {
  if (item.id === 'alimentazione' && restrictiveOn(brief)) {
    return item.status === 'off_track' ? 'improve' : 'neutral';
  }
  if (item.status === 'on_track') return 'positive';
  if (item.status === 'off_track') return 'improve';
  return 'neutral';
}

function restrictiveOn(brief) {
  return (brief?.safety?.signals || []).some((item) => (
    item.id === 'restrictive_pattern' && item.level === 'act'
  ));
}

function withHorizon(horizon, sentence) {
  const body = String(sentence || '')
    .replace(/^(oggi|questa settimana|questo mese|la prossima settimana|a [a-zàèéìòù]+)\s+/i, '')
    .replace(/[.]+$/, '')
    .trim();
  const text = `${horizonLead(horizon)} ${body}`.replace(/\s+/g, ' ').trim();
  return `${text}.`;
}

function horizonLead(horizon) {
  if (horizon === 'questa settimana') return 'Questa settimana';
  if (horizon === 'questo mese') return 'Questo mese';
  if (horizon === 'la prossima settimana') return 'La prossima settimana';
  const month = String(horizon || '').match(/^a ([a-zàèéìòù]+)$/i);
  if (month) return `A ${month[1]}`;
  return 'Oggi';
}

function clip(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}
