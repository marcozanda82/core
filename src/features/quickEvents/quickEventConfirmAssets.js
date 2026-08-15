/**
 * Asset e rotazione ciclica per conferme rapide (acqua, pisolino, caffè).
 * File in /public: acqua.png, pisolino.png, caffe1–3.png,
 * caffe1animazione.mp4, caffe2animazione.mp4
 */

export const QUICK_EVENT_ASSET = Object.freeze({
  water: '/acqua.png',
  nap: '/pisolino.png',
  coffee1: '/caffe1.png',
  coffee2: '/caffe2.png',
  coffee3: '/caffe3.png',
  coffee1Video: '/caffe1animazione.mp4',
  coffee2Video: '/caffe2animazione.mp4',
});

const COFFEE_CYCLE_STORAGE_KEY = 'kentu_quick_coffee_confirm_cycle';

/** caffe1→video1, caffe2→video2, caffe3→solo immagine. */
const COFFEE_CYCLE = Object.freeze([
  {
    imageSrc: QUICK_EVENT_ASSET.coffee1,
    videoSrc: QUICK_EVENT_ASSET.coffee1Video,
  },
  {
    imageSrc: QUICK_EVENT_ASSET.coffee2,
    videoSrc: QUICK_EVENT_ASSET.coffee2Video,
  },
  {
    imageSrc: QUICK_EVENT_ASSET.coffee3,
    videoSrc: null,
  },
]);

/**
 * Indice ciclo caffè (0 → 1 → 2 → 0 …). Persistito in localStorage.
 * @returns {number}
 */
export function peekCoffeeConfirmCycleIndex() {
  try {
    const raw = Number(localStorage.getItem(COFFEE_CYCLE_STORAGE_KEY));
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.floor(raw) % COFFEE_CYCLE.length;
  } catch {
    return 0;
  }
}

/**
 * Avanza il ciclo e restituisce l'asset della registrazione corrente.
 * @returns {{ imageSrc: string, videoSrc: string|null, cycleIndex: number }}
 */
export function takeNextCoffeeConfirmVisual() {
  const cycleIndex = peekCoffeeConfirmCycleIndex();
  const entry = COFFEE_CYCLE[cycleIndex] || COFFEE_CYCLE[0];
  try {
    localStorage.setItem(COFFEE_CYCLE_STORAGE_KEY, String(cycleIndex + 1));
  } catch {
    // ignore quota / private mode
  }
  return {
    imageSrc: entry.imageSrc,
    videoSrc: entry.videoSrc || null,
    cycleIndex,
  };
}

/**
 * @param {'water'|'nap'|'coffee'|'tea'|'energy'} kind
 * @param {{ title?: string, subtitle?: string }} [extra]
 * @returns {{ kind: string, title: string, subtitle?: string, imageSrc: string, videoSrc: string|null }}
 */
export function buildQuickEventConfirmPayload(kind, extra = {}) {
  if (kind === 'water') {
    return {
      kind: 'water',
      title: extra.title || 'Acqua registrata',
      subtitle: extra.subtitle || undefined,
      imageSrc: QUICK_EVENT_ASSET.water,
      videoSrc: null,
    };
  }
  if (kind === 'nap') {
    return {
      kind: 'nap',
      title: extra.title || 'Pisolino registrato',
      subtitle: extra.subtitle || undefined,
      imageSrc: QUICK_EVENT_ASSET.nap,
      videoSrc: null,
    };
  }
  if (kind === 'coffee') {
    const visual = takeNextCoffeeConfirmVisual();
    return {
      kind: 'coffee',
      title: extra.title || 'Caffè registrato',
      subtitle: extra.subtitle || undefined,
      imageSrc: visual.imageSrc,
      videoSrc: visual.videoSrc,
    };
  }
  if (kind === 'tea') {
    // Stesso ciclo media del caffè (asset dedicati non ancora in /public).
    const visual = takeNextCoffeeConfirmVisual();
    return {
      kind: 'tea',
      title: extra.title || 'Tè registrato',
      subtitle: extra.subtitle || undefined,
      imageSrc: visual.imageSrc,
      videoSrc: visual.videoSrc,
    };
  }
  if (kind === 'energy') {
    const visual = takeNextCoffeeConfirmVisual();
    return {
      kind: 'energy',
      title: extra.title || 'Energy drink registrato',
      subtitle: extra.subtitle || undefined,
      imageSrc: visual.imageSrc,
      videoSrc: visual.videoSrc,
    };
  }
  return null;
}

/**
 * Entry cronologia chat per conferma media (sistema).
 * @param {'water'|'nap'|'coffee'|'tea'|'energy'} kind
 * @param {{ title?: string, subtitle?: string }} [extra]
 */
export function buildQuickEventConfirmChatEntry(kind, extra = {}) {
  const payload = buildQuickEventConfirmPayload(kind, extra);
  if (!payload) return null;
  const now = Date.now();
  const systemIcon =
    kind === 'water' ? 'water'
      : kind === 'nap' ? 'nap'
        : kind === 'tea' ? 'tea'
          : kind === 'energy' ? 'energy'
            : 'coffee';
  return {
    sender: 'ai',
    type: 'QUICK_EVENT_CONFIRM',
    text: payload.title,
    displayText: payload.title,
    spokenText: payload.title,
    quickEventConfirm: payload,
    isSystem: true,
    systemIcon,
    timestamp: now,
    createdAt: now,
  };
}

export function isCoffeeStimulantNode(node) {
  const sub = String(node?.subtype || node?.name || '').trim().toLowerCase();
  return sub === 'caffè' || sub === 'caffe' || /\bcaff/.test(sub);
}

export function isTeaStimulantNode(node) {
  const sub = String(node?.subtype || node?.name || '').trim().toLowerCase();
  return sub === 'tè' || sub === 'te' || sub === 'tea' || /\bt[eè]\b/.test(sub);
}

export function isEnergyStimulantNode(node) {
  const sub = String(node?.subtype || node?.name || '').trim().toLowerCase();
  return sub.includes('energy') || sub.includes('pre-workout') || sub.includes('pre workout');
}

/** @returns {'coffee'|'tea'|'energy'|null} */
export function resolveStimulantConfirmKind(node) {
  if (isCoffeeStimulantNode(node)) return 'coffee';
  if (isTeaStimulantNode(node)) return 'tea';
  if (isEnergyStimulantNode(node)) return 'energy';
  return null;
}
