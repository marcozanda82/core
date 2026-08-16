/**
 * Asset e rotazione ciclica per conferme rapide (acqua, pisolino, caffè, allenamento).
 * File in /public: acqua.png, acquaanimazione.mp4, pisolino.png, pisolinoanimazione.mp4,
 * caffe1–3.png, caffe1/2/3animazione.mp4, Trainer3.png, Trainer3animazione.mp4
 */

export const QUICK_EVENT_ASSET = Object.freeze({
  water: '/acqua.png',
  waterVideo: '/acquaanimazione.mp4',
  nap: '/pisolino.png',
  napVideo: '/pisolinoanimazione.mp4',
  workout: '/Trainer3.png',
  workoutVideo: '/Trainer3animazione.mp4',
  coffee1: '/caffe1.png',
  coffee2: '/caffe2.png',
  coffee3: '/caffe3.png',
  coffee1Video: '/caffe1animazione.mp4',
  coffee2Video: '/caffe2animazione.mp4',
  coffee3Video: '/caffe3animazione.mp4',
});

/** Finestra in cui un quick-event “fresco” va in fascia cinema sotto l'header. */
export const QUICK_EVENT_CINEMA_FRESH_MS = 12000;

const COFFEE_CYCLE_STORAGE_KEY = 'kentu_quick_coffee_confirm_cycle';

/** caffe1→video1, caffe2→video2, caffe3→video3. */
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
    videoSrc: QUICK_EVENT_ASSET.coffee3Video,
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
 * @param {unknown} timestamp
 * @param {number} [freshMs]
 * @returns {boolean}
 */
export function isQuickEventCinemaFresh(timestamp, freshMs = QUICK_EVENT_CINEMA_FRESH_MS) {
  if (timestamp == null || timestamp === '') return true;
  const raw = typeof timestamp === 'number' ? timestamp : Date.parse(String(timestamp));
  if (!Number.isFinite(raw)) return true;
  return Date.now() - raw < freshMs;
}

/**
 * Ultimo messaggio chat idoneo per la fascia cinema (video di stato / conferma).
 * @param {Array<object>} [chatHistory]
 * @returns {{
 *   posterSrc: string,
 *   videoSrc: string|null,
 *   label: string,
 *   loop: boolean,
 *   messageKey: string|number|null,
 * } | null}
 */
export function resolveCinemaBannerFromChat(chatHistory = []) {
  const list = Array.isArray(chatHistory) ? chatHistory : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const msg = list[i];
    if (!msg) continue;
    const isQuick = Boolean(msg.quickEventConfirm || msg.type === 'QUICK_EVENT_CONFIRM');
    if (!isQuick) continue;

    const payload = msg.quickEventConfirm && typeof msg.quickEventConfirm === 'object'
      ? msg.quickEventConfirm
      : msg;
    const imageSrc = String(payload.imageSrc || msg.imageSrc || '').trim();
    const videoSrc = String(payload.videoSrc || msg.videoSrc || '').trim() || null;
    if (!imageSrc && !videoSrc) continue;

    const ts =
      msg.timestamp
      ?? msg.createdAt
      ?? payload.timestamp
      ?? payload.createdAt
      ?? null;
    if (!isQuickEventCinemaFresh(ts)) continue;

    // Solo animazioni/video in fascia; le sole immagini restano in chat.
    if (!videoSrc) continue;

    return {
      posterSrc: imageSrc || videoSrc,
      videoSrc,
      label: String(payload.title || msg.text || msg.displayText || 'Evento registrato').trim(),
      loop: false,
      messageKey: msg.id ?? msg.timestamp ?? i,
    };
  }
  return null;
}

/**
 * @param {'water'|'nap'|'coffee'|'tea'|'energy'|'workout'|'training'|'allenamento'} kind
 * @param {{ title?: string, subtitle?: string }} [extra]
 * @returns {{ kind: string, title: string, subtitle?: string, imageSrc: string, videoSrc: string|null }}
 */
export function buildQuickEventConfirmPayload(kind, extra = {}) {
  const normalizedKind = String(kind || '').toLowerCase().trim();
  if (normalizedKind === 'water') {
    return {
      kind: 'water',
      title: extra.title || 'Acqua registrata',
      subtitle: extra.subtitle || undefined,
      imageSrc: QUICK_EVENT_ASSET.water,
      videoSrc: QUICK_EVENT_ASSET.waterVideo,
    };
  }
  if (normalizedKind === 'nap') {
    return {
      kind: 'nap',
      title: extra.title || 'Pisolino registrato',
      subtitle: extra.subtitle || undefined,
      imageSrc: QUICK_EVENT_ASSET.nap,
      videoSrc: QUICK_EVENT_ASSET.napVideo,
    };
  }
  if (
    normalizedKind === 'workout'
    || normalizedKind === 'training'
    || normalizedKind === 'allenamento'
  ) {
    return {
      kind: 'workout',
      title: extra.title || 'Allenamento registrato',
      subtitle: extra.subtitle || undefined,
      imageSrc: QUICK_EVENT_ASSET.workout,
      videoSrc: QUICK_EVENT_ASSET.workoutVideo,
    };
  }
  if (normalizedKind === 'coffee') {
    const visual = takeNextCoffeeConfirmVisual();
    return {
      kind: 'coffee',
      title: extra.title || 'Caffè registrato',
      subtitle: extra.subtitle || undefined,
      imageSrc: visual.imageSrc,
      videoSrc: visual.videoSrc,
    };
  }
  if (normalizedKind === 'tea') {
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
  if (normalizedKind === 'energy') {
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
 * @param {'water'|'nap'|'coffee'|'tea'|'energy'|'workout'|'training'|'allenamento'} kind
 * @param {{ title?: string, subtitle?: string }} [extra]
 */
export function buildQuickEventConfirmChatEntry(kind, extra = {}) {
  const payload = buildQuickEventConfirmPayload(kind, extra);
  if (!payload) return null;
  const now = Date.now();
  const kindKey = String(payload.kind || '').toLowerCase();
  const systemIcon =
    kindKey === 'water' ? 'water'
      : kindKey === 'nap' ? 'nap'
        : kindKey === 'tea' ? 'tea'
          : kindKey === 'energy' ? 'energy'
            : kindKey === 'workout' ? 'workout'
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
