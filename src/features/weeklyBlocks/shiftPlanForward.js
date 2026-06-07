/**
 * Effetto domino su Blocchi Indivisibili (workout + calorieStrategy).
 * Posticipa il blocco di `startDateKey` e scala in avanti tutti i giorni
 * fino al primo slot REST/RECOVERY consumato nella settimana Mon–Sun.
 */

import { ref, set } from 'firebase/database';
import {
  createRestDayBlock,
  getWeekDateKeysLocal,
  isRestOrRecoverySlot,
  sanitizeWeeklyBlockPlanFromFirebase,
  weeklyBlockPlanToFirebasePayload,
} from './weeklyBlockSchema.js';

/**
 * @typedef {object} ShiftPlanForwardResult
 * @property {boolean} success
 * @property {import('./weeklyBlockSchema.js').WeeklyBlockPlan | null} plan — piano aggiornato
 * @property {string | null} consumedRestDate — data dello slot REST/RECOVERY che ha fermato il domino
 * @property {string[]} shiftedDates — date i cui blocchi sono stati spostati di +1
 * @property {string} [reason] — messaggio se success === false
 */

/**
 * Trova il primo indice REST/RECOVERY dopo `startIndex` (solo avanti, senza wrap).
 * @param {string[]} dateKeys
 * @param {Record<string, import('./weeklyBlockSchema.js').DayBlock>} blocks
 * @param {number} startIndex
 * @returns {number}
 */
function findConsumableRestIndex(dateKeys, blocks, startIndex) {
  for (let i = startIndex + 1; i < dateKeys.length; i += 1) {
    const date = dateKeys[i];
    if (isRestOrRecoverySlot(blocks[date])) return i;
  }
  return -1;
}

/**
 * Clona un blocco assegnandolo a un nuovo slot data (il contenuto viaggia compatto).
 * @param {import('./weeklyBlockSchema.js').DayBlock} block
 * @param {string} targetDate
 * @returns {import('./weeklyBlockSchema.js').DayBlock}
 */
function relocateBlockToDate(block, targetDate) {
  return {
    ...block,
    date: targetDate,
    activity: { ...block.activity, focus: block.activity.focus ? [...block.activity.focus] : [] },
    calorieStrategy: { ...block.calorieStrategy },
    meta: {
      ...(block.meta || {}),
      source: 'shift',
      updatedAt: Date.now(),
    },
  };
}

/**
 * Applica lo shift domino su una copia del piano settimanale (funzione pura).
 *
 * Comportamento:
 * 1. Il blocco in `startDateKey` (workout + calorieStrategy) non resta sul giorno di partenza.
 * 2. Ogni blocco attivo tra start e il primo REST/RECOVERY successivo slitta di 1 slot.
 * 3. Lo slot REST/RECOVERY raggiunto viene sovrascritto dall'ultimo blocco della catena.
 * 4. `startDateKey` diventa REST neutro (imprevisto / giorno saltato).
 *
 * @param {import('./weeklyBlockSchema.js').WeeklyBlockPlan} weeklyBlockPlan
 * @param {string} startDateKey ISO YYYY-MM-DD
 * @returns {ShiftPlanForwardResult}
 */
export function shiftWeekBlocksForward(weeklyBlockPlan, startDateKey) {
  const plan = sanitizeWeeklyBlockPlanFromFirebase(weeklyBlockPlan, weeklyBlockPlan?.weekStart);
  const dateKeys = getWeekDateKeysLocal(plan.weekStart);
  const startDate = String(startDateKey || '').trim();

  if (!startDate) {
    return { success: false, plan: null, consumedRestDate: null, shiftedDates: [], reason: 'Data di partenza non valida.' };
  }

  const startIndex = dateKeys.indexOf(startDate);
  if (startIndex === -1) {
    return {
      success: false,
      plan: null,
      consumedRestDate: null,
      shiftedDates: [],
      reason: `La data ${startDate} non appartiene alla settimana ${plan.weekStart}.`,
    };
  }

  const startBlock = plan.blocks[startDate];
  if (isRestOrRecoverySlot(startBlock)) {
    return {
      success: false,
      plan: null,
      consumedRestDate: null,
      shiftedDates: [],
      reason: 'Non puoi posticipare un giorno già contrassegnato come REST o RECOVERY.',
    };
  }

  const targetRestIndex = findConsumableRestIndex(dateKeys, plan.blocks, startIndex);
  if (targetRestIndex === -1) {
    return {
      success: false,
      plan: null,
      consumedRestDate: null,
      shiftedDates: [],
      reason: 'Impossibile traslare: nessuno slot REST/RECOVERY disponibile dopo questa data nella settimana.',
    };
  }

  const newBlocks = { ...plan.blocks };

  const indicesToShift = [];
  for (let i = startIndex; i < targetRestIndex; i += 1) {
    indicesToShift.push(i);
  }

  const shiftedDates = indicesToShift.map((idx) => dateKeys[idx]);
  const consumedRestDate = dateKeys[targetRestIndex];

  // Domino dal fondo: ogni blocco occupa lo slot successivo
  for (let i = indicesToShift.length - 1; i >= 0; i -= 1) {
    const fromDate = dateKeys[indicesToShift[i]];
    const toDate = dateKeys[indicesToShift[i] + 1];
    newBlocks[toDate] = relocateBlockToDate(newBlocks[fromDate], toDate);
  }

  // Giorno di partenza → REST (allenamento posticipato, non cancellato dalla settimana)
  newBlocks[startDate] = createRestDayBlock(startDate, 'shift');

  const nextPlan = {
    ...plan,
    blocks: newBlocks,
    updatedAt: Date.now(),
  };

  return {
    success: true,
    plan: nextPlan,
    consumedRestDate,
    shiftedDates,
  };
}

/**
 * Variante compatibile con l'API storica `shiftPlanForward(startDayKey)` del planner strategico.
 * Risolve il weekday italiano nella data ISO della settimana `plan.weekStart`.
 *
 * @param {import('./weeklyBlockSchema.js').WeeklyBlockPlan} weeklyBlockPlan
 * @param {string} startDayKey lunedi | martedi | … | domenica
 * @returns {ShiftPlanForwardResult}
 */
export function shiftWeekBlocksForwardByDayKey(weeklyBlockPlan, startDayKey) {
  const IT_ORDER = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
  const key = String(startDayKey || '').toLowerCase().trim();
  const dayIndex = IT_ORDER.indexOf(key);
  if (dayIndex === -1) {
    return {
      success: false,
      plan: null,
      consumedRestDate: null,
      shiftedDates: [],
      reason: `Giorno settimanale non valido: ${startDayKey}`,
    };
  }
  const plan = sanitizeWeeklyBlockPlanFromFirebase(weeklyBlockPlan, weeklyBlockPlan?.weekStart);
  const dateKeys = getWeekDateKeysLocal(plan.weekStart);
  return shiftWeekBlocksForward(plan, dateKeys[dayIndex]);
}

/**
 * Persistenza Firebase (drop-in per sostituire la vecchia shiftPlanForward nel hook).
 *
 * @param {import('firebase/database').Database} db
 * @param {string} userUid
 * @param {import('./weeklyBlockSchema.js').WeeklyBlockPlan} weeklyBlockPlan
 * @param {string} startDateKey ISO YYYY-MM-DD
 * @param {typeof import('./weeklyBlockSchema.js').weeklyBlockPlanToFirebasePayload} [toPayload]
 * @returns {Promise<ShiftPlanForwardResult>}
 */
export async function shiftPlanForward(db, userUid, weeklyBlockPlan, startDateKey, toPayload) {
  const serialize = toPayload || weeklyBlockPlanToFirebasePayload;
  const result = shiftWeekBlocksForward(weeklyBlockPlan, startDateKey);

  if (!result.success || !result.plan) return result;
  if (!db || !userUid) {
    return { ...result, success: false, reason: 'Database o utente non disponibile.' };
  }

  const weekStart = result.plan.weekStart;
  const planRef = ref(db, `users/${userUid}/weeklyBlockPlan/${weekStart}`);
  await set(planRef, serialize(result.plan));

  return result;
}
