/**
 * Elenco chiuso immagini hero Focus (FASE 4 — predisposizione).
 * Chiave = periodo + esito da segnali deterministici (non dall’AI).
 * Preferisce .webp quando esiste; altrimenti il segnaposto .svg.
 */

/** @typedef {'ieri_buono'|'ieri_da_migliorare'|'settimana_irregolare'|'settimana_buona'|'mese_irregolare'|'mese_buono'} FocusHeroImageKey */

/** Chiavi con foto reale in public/focus/*.webp */
const WEBP_READY = Object.freeze(new Set([
  'ieri_buono',
  'ieri_da_migliorare',
  'settimana_buona',
  'settimana_irregolare',
]));

/** @type {Readonly<Record<FocusHeroImageKey, string>>} */
export const FOCUS_HERO_IMAGE_PATHS = Object.freeze({
  ieri_buono: '/focus/ieri_buono.webp',
  ieri_da_migliorare: '/focus/ieri_da_migliorare.webp',
  settimana_irregolare: '/focus/settimana_irregolare.webp',
  settimana_buona: '/focus/settimana_buona.webp',
  mese_irregolare: '/focus/mese_irregolare.svg',
  mese_buono: '/focus/mese_buono.svg',
});

/**
 * @param {{
 *   periodId?: string,
 *   toImprove?: object[],
 *   energyIrregular?: boolean,
 *   activeSignalIds?: string[],
 * }} input
 * @returns {FocusHeroImageKey}
 */
export function resolveFocusHeroImageKey(input = {}) {
  const periodId = String(input.periodId || 'ieri').toLowerCase();
  const improve = Array.isArray(input.toImprove) ? input.toImprove : [];
  const irregular = Boolean(
    input.energyIrregular
    || (input.activeSignalIds || []).includes('energy_irregular'),
  );
  const hasImprove = improve.length > 0;

  if (periodId === 'settimana') {
    return irregular || hasImprove ? 'settimana_irregolare' : 'settimana_buona';
  }
  if (periodId === 'mese') {
    return irregular || hasImprove ? 'mese_irregolare' : 'mese_buono';
  }
  return hasImprove || irregular ? 'ieri_da_migliorare' : 'ieri_buono';
}

/**
 * @param {FocusHeroImageKey|string} key
 * @returns {string|null}
 */
export function focusHeroImageSrc(key) {
  const path = FOCUS_HERO_IMAGE_PATHS[key];
  return path || null;
}

/** Path svg di riserva per le chiavi che hanno già il webp. */
export function focusHeroImageFallbackSrc(key) {
  if (!WEBP_READY.has(key)) return null;
  return `/focus/${key}.svg`;
}
