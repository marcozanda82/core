/**
 * KentuOS — 4 pilastri fisiologici ufficiali (Fase 1 Architettura).
 * Single source of truth per icone, colori Tailwind e mapping eventi diario → pilastro.
 */

/** @typedef {'NUTRITION' | 'TRAINING' | 'SLEEP' | 'FASTING'} KentuPillarId */

export const PILLAR_IDS = /** @type {const} */ (['NUTRITION', 'TRAINING', 'SLEEP', 'FASTING']);

/**
 * @type {Record<KentuPillarId, {
 *   id: KentuPillarId,
 *   label: string,
 *   icon: string,
 *   color: string,
 *   tailwind: {
 *     text: string,
 *     border: string,
 *     bg: string,
 *     bgHover: string,
 *     ring: string,
 *   },
 * }>}
 */
export const KENTU_PILLARS = {
  NUTRITION: {
    id: 'NUTRITION',
    label: 'Alimentazione',
    icon: '🍎',
    color: '#f97316',
    tailwind: {
      text: 'text-orange-400',
      border: 'border-orange-400',
      bg: 'bg-orange-500/20',
      bgHover: 'bg-orange-500/35',
      ring: 'ring-orange-400/60',
    },
  },
  TRAINING: {
    id: 'TRAINING',
    label: 'Allenamento',
    icon: '🏋️',
    color: '#ef4444',
    tailwind: {
      text: 'text-red-400',
      border: 'border-red-400',
      bg: 'bg-red-500/20',
      bgHover: 'bg-red-500/35',
      ring: 'ring-red-400/60',
    },
  },
  SLEEP: {
    id: 'SLEEP',
    label: 'Sonno',
    icon: '🛏️',
    color: '#818cf8',
    tailwind: {
      text: 'text-indigo-400',
      border: 'border-indigo-400',
      bg: 'bg-indigo-500/20',
      bgHover: 'bg-indigo-500/35',
      ring: 'ring-indigo-400/60',
    },
  },
  FASTING: {
    id: 'FASTING',
    label: 'Digiuno',
    icon: '⏳',
    color: '#a855f7',
    tailwind: {
      text: 'text-purple-400',
      border: 'border-purple-400',
      bg: 'bg-purple-500/20',
      bgHover: 'bg-purple-500/35',
      ring: 'ring-purple-400/60',
    },
  },
};

/** @type {Record<string, KentuPillarId>} */
const LOG_ENTRY_TYPE_TO_PILLAR = {
  meal: 'NUTRITION',
  ghost_meal: 'NUTRITION',
  water: 'NUTRITION',
  alcohol: 'NUTRITION',
  stimulant: 'NUTRITION',
  supplements: 'NUTRITION',
  food: 'NUTRITION',
  workout: 'TRAINING',
  ghost_workout: 'TRAINING',
  work: 'TRAINING',
  cognitive: 'TRAINING',
  sleep: 'SLEEP',
  nap: 'SLEEP',
  meditation: 'SLEEP',
  sunlight: 'SLEEP',
  fasting: 'FASTING',
};

/**
 * Risolve il pilastro KentuOS da una voce del daily log.
 *
 * @param {Record<string, unknown> | null | undefined} entry
 * @returns {KentuPillarId | null}
 */
export function resolvePillarForLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const type = String(entry.type || '').trim().toLowerCase();
  if (!type) return null;
  return LOG_ENTRY_TYPE_TO_PILLAR[type] ?? null;
}

/**
 * Risolve il pilastro da un nodo timeline (stesso schema del log, con alias UI).
 *
 * @param {Record<string, unknown> | null | undefined} node
 * @returns {KentuPillarId | null}
 */
export function resolvePillarForTimelineNode(node) {
  return resolvePillarForLogEntry(node);
}

/**
 * Meta visiva del pilastro (icona, colori hex, classi Tailwind).
 *
 * @param {KentuPillarId | null | undefined} pillarId
 * @returns {typeof KENTU_PILLARS[KentuPillarId] | null}
 */
export function getPillarMeta(pillarId) {
  if (!pillarId || !KENTU_PILLARS[pillarId]) return null;
  return KENTU_PILLARS[pillarId];
}

/**
 * Converte un colore hex (#rrggbb) in rgba con alpha per sfondi timeline.
 *
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
export function pillarColorToRgba(hex, alpha = 0.2) {
  const normalized = String(hex || '').replace('#', '');
  if (normalized.length !== 6) return `rgba(148, 163, 184, ${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Stili inline per un nodo timeline in base al pilastro.
 *
 * @param {Record<string, unknown> | null | undefined} node
 * @param {{ touching?: boolean, activeDrag?: boolean, ghost?: boolean }} [state]
 * @returns {{
 *   pillarId: KentuPillarId | null,
 *   icon: string,
 *   color: string,
 *   bgColor: string,
 *   borderColor: string,
 *   glowShadow: string,
 *   tailwind: typeof KENTU_PILLARS[KentuPillarId]['tailwind'] | null,
 * }}
 */
export function getTimelineNodePillarStyles(node, state = {}) {
  const pillarId = resolvePillarForTimelineNode(node);
  const meta = getPillarMeta(pillarId);
  const touching = Boolean(state.touching);
  const activeDrag = Boolean(state.activeDrag);
  const ghost = Boolean(state.ghost);

  if (!meta) {
    return {
      pillarId: null,
      icon: '•',
      color: '#94a3b8',
      bgColor: touching ? 'rgba(148, 163, 184, 0.35)' : 'rgba(0, 0, 0, 0.6)',
      borderColor: '#94a3b8',
      glowShadow: touching ? '0 0 15px rgba(148, 163, 184, 0.45)' : 'none',
      tailwind: null,
    };
  }

  const baseAlpha = ghost ? 0.06 : touching || activeDrag ? 0.4 : 0.2;
  const bgColor = pillarColorToRgba(meta.color, baseAlpha);
  const borderColor = meta.color;
  const glowShadow = touching || activeDrag
    ? `0 0 15px ${pillarColorToRgba(meta.color, 0.85)}`
    : `0 0 8px ${pillarColorToRgba(meta.color, 0.35)}`;

  return {
    pillarId,
    icon: meta.icon,
    color: meta.color,
    bgColor,
    borderColor,
    glowShadow,
    tailwind: meta.tailwind,
  };
}
