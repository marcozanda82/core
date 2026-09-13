/**
 * Dizionario azioni + selezione della sola primaryAction.
 * Filtra sulle driver dominanti (ranking), poi prende la priorità massima.
 */

import { ACTION_IDS, DRIVER_DIRECTIONS, DRIVER_IDS } from '../contracts/healthSystem.types.js';

/**
 * @typedef {object} ActionCandidate
 * @property {string} id
 * @property {string} text
 * @property {number} priority
 * @property {string[]} driverIds
 * @property {boolean} [allowPositive]
 * @property {boolean} [fallback]
 */

/** @type {ActionCandidate[]} */
export const ACTION_CANDIDATES = Object.freeze([
  Object.freeze({
    id: ACTION_IDS.LOG_SLEEP,
    text: 'Registra il sonno di stanotte',
    priority: 100,
    driverIds: [DRIVER_IDS.SLEEP_DATA_MISSING],
  }),
  Object.freeze({
    id: ACTION_IDS.PROTECT_RECOVERY,
    text: 'Priorità al sonno: punta ad almeno 7 ore stanotte',
    priority: 90,
    driverIds: [DRIVER_IDS.SLEEP_DURATION, DRIVER_IDS.SLEEP_QUALITY],
  }),
  Object.freeze({
    id: ACTION_IDS.REDUCE_LOAD,
    text: 'Riduci il volume di allenamento oggi e privilegia il recupero',
    priority: 85,
    driverIds: [DRIVER_IDS.SYSTEMIC_FATIGUE],
  }),
  Object.freeze({
    id: ACTION_IDS.EARLIER_DINNER,
    text: 'Anticipa la cena di 45 min',
    priority: 80,
    driverIds: [DRIVER_IDS.DINNER_SLEEP_BUFFER],
  }),
  Object.freeze({
    id: ACTION_IDS.STABILIZE_WAKE,
    text: 'Stabilizza l’orario di risveglio (±30 min)',
    priority: 70,
    driverIds: [DRIVER_IDS.WAKE_REGULARITY],
  }),
  Object.freeze({
    id: ACTION_IDS.HIT_PROTEIN,
    text: 'Chiudi il gap proteico con una porzione da 25–30 g',
    priority: 65,
    driverIds: [DRIVER_IDS.PROTEIN_ADHERENCE],
  }),
  Object.freeze({
    id: ACTION_IDS.ADD_FIBER,
    text: 'Aumenta le fibre a pranzo con verdura o legumi',
    priority: 55,
    driverIds: [DRIVER_IDS.FIBER_ADHERENCE],
  }),
  Object.freeze({
    id: ACTION_IDS.ADD_CARDIO,
    text: 'Aggiungi circa 45 min di cardio nei prossimi giorni',
    priority: 60,
    driverIds: [DRIVER_IDS.CARDIO_LOAD_7D],
  }),
  Object.freeze({
    id: ACTION_IDS.STIMULATE_LAG_MUSCLE,
    text: 'Programma una sessione sul distretto meno stimolato',
    priority: 50,
    driverIds: [DRIVER_IDS.MUSCLE_STIMULUS],
  }),
  Object.freeze({
    id: ACTION_IDS.MAINTAIN_COURSE,
    text: 'Mantieni il ritmo attuale: nessun intervento urgente',
    priority: 1,
    driverIds: [],
    fallback: true,
  }),
]);

/**
 * @param {import('../contracts/healthSystem.types.js').DriverRankRow[]} ranked
 * @param {Array<{ driver: import('../contracts/healthSystem.types.js').Driver, pillar: string }>} tagged
 * @param {number} [horizon=5]
 * @returns {{ action: import('../contracts/healthSystem.types.js').Action | null, rejected: Array<{ id: string, reason: string }> }}
 */
export function selectPrimaryAction(ranked, tagged, horizon = 5) {
  const rejected = [];
  const top = (ranked || []).slice(0, horizon);
  void tagged;

  const fallback = ACTION_CANDIDATES.find((c) => c.fallback) || null;
  const actionable = ACTION_CANDIDATES.filter((c) => !c.fallback);

  actionable.forEach((candidate) => {
    rejected.push({
      id: candidate.id,
      reason: `in attesa: driver ${candidate.driverIds.join('|')} non ancora selezionato`,
    });
  });

  for (let i = 0; i < top.length; i += 1) {
    const row = top[i];
    if (row.direction !== DRIVER_DIRECTIONS.NEGATIVE) continue;
    const matches = actionable
      .filter((c) => c.driverIds.includes(row.id))
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return String(a.id).localeCompare(String(b.id));
      });
    if (matches.length === 0) continue;

    const chosen = matches[0];
    const nextRejected = ACTION_CANDIDATES
      .filter((c) => !c.fallback && c.id !== chosen.id)
      .map((c) => ({
        id: c.id,
        reason: c.driverIds.includes(row.id)
          ? `superata da ${chosen.id} sullo stesso driver ${row.id}`
          : `driver dominante ${row.id} (rank ${i + 1}) ha selezionato ${chosen.id}`,
      }));

    return {
      action: {
        id: chosen.id,
        text: chosen.text,
        priority: chosen.priority,
      },
      rejected: nextRejected,
    };
  }

  return {
    action: fallback
      ? { id: fallback.id, text: fallback.text, priority: fallback.priority }
      : null,
    rejected: rejected.filter((r) => r.id !== fallback?.id),
  };
}
