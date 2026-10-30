/**
 * Unica fonte delle cinque aree Focus (diario / timeline riusano questo modulo).
 * Icon colors tarati per contrasto ≥ 4.5:1 sul chip (WCAG AA testo).
 */

import { Activity, Clock, Flame, Leaf, Moon } from 'lucide-react';

/** @typedef {'energia'|'qualita'|'ritmo'|'sonno'|'movimento'} FocusAreaId */

/**
 * @type {ReadonlyArray<{
 *   id: FocusAreaId,
 *   label: string,
 *   Icon: import('lucide-react').LucideIcon,
 *   iconColor: string,
 *   chipBg: string,
 * }>}
 */
export const FOCUS_AREAS = Object.freeze([
  {
    id: 'energia',
    label: 'Energia',
    Icon: Flame,
    // brief #B4501E su #FCE3D3 = 4.16:1 → #AB4C1D = 4.51:1
    iconColor: '#AB4C1D',
    chipBg: '#FCE3D3',
  },
  {
    id: 'qualita',
    label: 'Qualità',
    Icon: Leaf,
    iconColor: '#2E6B4C',
    chipBg: '#DDEDE2',
  },
  {
    id: 'ritmo',
    label: 'Ritmo',
    Icon: Clock,
    // brief #A4520F su #F5D6BA = 4.01:1 → #974B0E = 4.57:1
    iconColor: '#974B0E',
    chipBg: '#F5D6BA',
  },
  {
    id: 'sonno',
    label: 'Sonno',
    Icon: Moon,
    iconColor: '#5B4A9E',
    chipBg: '#E7E2F6',
  },
  {
    id: 'movimento',
    label: 'Movimento',
    Icon: Activity,
    iconColor: '#0B6E75',
    chipBg: '#DCEEF0',
  },
]);

/** @type {Readonly<Record<FocusAreaId, (typeof FOCUS_AREAS)[number]>>} */
export const FOCUS_AREAS_BY_ID = Object.freeze(
  Object.fromEntries(FOCUS_AREAS.map((a) => [a.id, a])),
);

/**
 * @param {string|null|undefined} areaId
 * @returns {(typeof FOCUS_AREAS)[number]|null}
 */
export function resolveFocusArea(areaId) {
  const id = String(areaId || '').trim().toLowerCase();
  if (id === 'qualità') return FOCUS_AREAS_BY_ID.qualita;
  return FOCUS_AREAS_BY_ID[id] || null;
}
