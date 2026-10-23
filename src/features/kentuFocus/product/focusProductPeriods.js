/**
 * Periodi prodotto Kentu Focus (Ieri / Settimana / Mese).
 * Allineati ai preset calendario già validati in editionCalendar.
 */

import { FOCUS_EDITION_BENCH_PRESETS } from '../edition/editionCalendar.js';

export const FOCUS_PRODUCT_PERIODS = Object.freeze([
  {
    id: 'ieri',
    label: 'Ieri',
    shortLabel: 'Ieri',
    description: 'Giorno appena trascorso (edizione quotidiana)',
    presetId: 'daily_regression',
  },
  {
    id: 'settimana',
    label: 'Settimana',
    shortLabel: 'Settimana',
    description: 'Settimana completata (edizione domenicale)',
    presetId: 'sunday_past',
  },
  {
    id: 'mese',
    label: 'Mese',
    shortLabel: 'Mese',
    description: 'Mese completato (edizione del primo del mese)',
    presetId: 'month_first',
  },
]);

/**
 * @param {string} periodId
 */
export function resolveFocusProductPeriod(periodId) {
  const id = String(periodId || '').trim().toLowerCase();
  const period = FOCUS_PRODUCT_PERIODS.find((p) => p.id === id) || FOCUS_PRODUCT_PERIODS[0];
  const preset = FOCUS_EDITION_BENCH_PRESETS[period.presetId];
  if (!preset) {
    throw new Error(`focusProductPeriods: preset mancante per ${period.presetId}`);
  }
  return { period, preset };
}

export const FOCUS_PRODUCT_DEMO_BANNER = 'ANTEPRIMA CON DATI DIMOSTRATIVI';
