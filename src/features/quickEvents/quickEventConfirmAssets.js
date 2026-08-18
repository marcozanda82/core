/**
 * Asset e rotazione ciclica per conferme rapide (acqua, pisolino, caffè, movimento, allenamento).
 * File in /public: acqua.png, acquaanimazione.mp4, pisolino.png, pisolinoanimazione.mp4,
 * caffe1–4.png + caffe1–4animazione.mp4, tapis1 / Jogin1 / jogin2–7, Trainer3.png.
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
  coffee4: '/caffe4.png',
  coffee1Video: '/caffe1animazione.mp4',
  coffee2Video: '/caffe2animazione.mp4',
  coffee3Video: '/caffe3animazione.mp4',
  coffee4Video: '/caffe4animazione.mp4',
  tapis1: '/tapis1.png',
  tapis1Video: '/tapis1animazione.mp4',
  jogin1: '/Jogin1.png',
  jogin1Video: '/Jogin1animazione.mp4',
  jogin2: '/jogin2.png',
  jogin2Video: '/jogin2animazione.mp4',
  jogin3: '/jogin3.png',
  jogin3Video: '/jogin3animazione.mp4',
  jogin4: '/jogin4.png',
  jogin4Video: '/jogin4animazione.mp4',
  jogin5: '/jogin5.png',
  jogin5Video: '/jogin5animazione.mp4',
  jogin6: '/jogin6.png',
  jogin6Video: '/jogin6animazione.mp4',
  jogin7: '/jogin7.png',
  jogin7Video: '/jogin7animazione.mp4',
});

/** Finestra in cui un quick-event “fresco” va in fascia cinema sotto l'header. */
export const QUICK_EVENT_CINEMA_FRESH_MS = 12000;

const COFFEE_CYCLE_STORAGE_KEY = 'kentu_quick_coffee_confirm_cycle';
const LOCOMOTION_CYCLE_STORAGE_KEY = 'kentu_quick_locomotion_confirm_cycle';

/** caffe1→video1 … caffe4→video4. */
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
  {
    imageSrc: QUICK_EVENT_ASSET.coffee4,
    videoSrc: QUICK_EVENT_ASSET.coffee4Video,
  },
]);

/** Camminata / corsa / tapis / jogging — rotazione coppie png+mp4. */
const LOCOMOTION_CYCLE = Object.freeze([
  {
    imageSrc: QUICK_EVENT_ASSET.tapis1,
    videoSrc: QUICK_EVENT_ASSET.tapis1Video,
  },
  {
    imageSrc: QUICK_EVENT_ASSET.jogin1,
    videoSrc: QUICK_EVENT_ASSET.jogin1Video,
  },
  {
    imageSrc: QUICK_EVENT_ASSET.jogin2,
    videoSrc: QUICK_EVENT_ASSET.jogin2Video,
  },
  {
    imageSrc: QUICK_EVENT_ASSET.jogin3,
    videoSrc: QUICK_EVENT_ASSET.jogin3Video,
  },
  {
    imageSrc: QUICK_EVENT_ASSET.jogin4,
    videoSrc: QUICK_EVENT_ASSET.jogin4Video,
  },
  {
    imageSrc: QUICK_EVENT_ASSET.jogin5,
    videoSrc: QUICK_EVENT_ASSET.jogin5Video,
  },
  {
    imageSrc: QUICK_EVENT_ASSET.jogin6,
    videoSrc: QUICK_EVENT_ASSET.jogin6Video,
  },
  {
    imageSrc: QUICK_EVENT_ASSET.jogin7,
    videoSrc: QUICK_EVENT_ASSET.jogin7Video,
  },
]);

/** Clamp superiore per tutte le animazioni caffè (caffe2 e resto del ciclo). */
export const COFFEE_VIDEO_MAX_CLAMP_SEC = 6.3;

/** Limite superiore di riproduzione per singoli asset video (secondi). */
export const QUICK_EVENT_VIDEO_MAX_CLAMP_SEC = Object.freeze(
  Object.fromEntries(
    COFFEE_CYCLE
      .map((entry) => entry.videoSrc)
      .filter(Boolean)
      .map((src) => [src, COFFEE_VIDEO_MAX_CLAMP_SEC]),
  ),
);

/**
 * @param {string|null|undefined} videoSrc
 * @returns {number|null}
 */
export function resolveQuickEventVideoMaxClampSeconds(videoSrc) {
  const src = String(videoSrc || '').trim();
  if (!src) return null;
  const clamp = QUICK_EVENT_VIDEO_MAX_CLAMP_SEC[src];
  if (Number.isFinite(clamp) && clamp > 0) return clamp;
  if (/caffe\d*animazione\.mp4/i.test(src)) return COFFEE_VIDEO_MAX_CLAMP_SEC;
  return null;
}

/**
 * @param {string} storageKey
 * @param {number} length
 * @returns {number}
 */
function peekCycleIndex(storageKey, length) {
  const size = Math.max(1, Number(length) || 1);
  try {
    const raw = Number(localStorage.getItem(storageKey));
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.floor(raw) % size;
  } catch {
    return 0;
  }
}

/**
 * @param {Array<{ imageSrc: string, videoSrc?: string|null }>} cycle
 * @param {string} storageKey
 * @returns {{ imageSrc: string, videoSrc: string|null, cycleIndex: number }}
 */
function takeNextCycledVisual(cycle, storageKey) {
  const list = Array.isArray(cycle) && cycle.length > 0 ? cycle : [];
  const cycleIndex = peekCycleIndex(storageKey, list.length || 1);
  const entry = list[cycleIndex] || list[0] || { imageSrc: '', videoSrc: null };
  try {
    localStorage.setItem(storageKey, String(cycleIndex + 1));
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
 * Indice ciclo caffè (0 → 1 → 2 → 3 → 0 …). Persistito in localStorage.
 * @returns {number}
 */
export function peekCoffeeConfirmCycleIndex() {
  return peekCycleIndex(COFFEE_CYCLE_STORAGE_KEY, COFFEE_CYCLE.length);
}

/**
 * Avanza il ciclo e restituisce l'asset della registrazione corrente.
 * @returns {{ imageSrc: string, videoSrc: string|null, cycleIndex: number }}
 */
export function takeNextCoffeeConfirmVisual() {
  return takeNextCycledVisual(COFFEE_CYCLE, COFFEE_CYCLE_STORAGE_KEY);
}

/**
 * Avanza il ciclo camminata/corsa/tapis/jogging.
 * @returns {{ imageSrc: string, videoSrc: string|null, cycleIndex: number }}
 */
export function takeNextLocomotionConfirmVisual() {
  return takeNextCycledVisual(LOCOMOTION_CYCLE, LOCOMOTION_CYCLE_STORAGE_KEY);
}

const LOCOMOTION_KIND_SET = new Set([
  'camminata',
  'corsa',
  'walk',
  'walking',
  'run',
  'running',
  'jogging',
  'jog',
  'tapis',
  'treadmill',
]);

const LOCOMOTION_HINT_RE =
  /\b(camminat\w*|walking|walk|passi|passeggiat\w*|corsa|correr\w*|running|run|joggin\w*|jogging|tapis|treadmill|footing)\b/i;
const CORSA_HINT_RE =
  /\b(corsa|correr\w*|running|run|joggin\w*|jogging|tapis|treadmill|footing)\b/i;
const CAMMINATA_HINT_RE =
  /\b(camminat\w*|walking|walk|passi|passeggiat\w*)\b/i;

/**
 * True se kind / tipo attività / testo indica camminata, corsa, tapis o jogging.
 * @param {object} [hints]
 * @returns {boolean}
 */
export function isLocomotionActivityHint(hints = {}) {
  return resolveLocomotionConfirmKind(hints) != null;
}

/**
 * @param {object} [hints]
 * @returns {'camminata'|'corsa'|null}
 */
export function resolveLocomotionConfirmKind(hints = {}) {
  const kind = String(hints.kind || '').toLowerCase().trim();
  if (kind === 'camminata' || kind === 'walk' || kind === 'walking') return 'camminata';
  if (
    kind === 'corsa'
    || kind === 'run'
    || kind === 'running'
    || kind === 'jogging'
    || kind === 'jog'
    || kind === 'tapis'
    || kind === 'treadmill'
  ) {
    return 'corsa';
  }

  const typeHay = [
    hints.workoutType,
    hints.activityType,
    hints.subType,
    hints.activityId,
  ]
    .map((value) => String(value || '').toLowerCase().trim())
    .filter(Boolean);
  if (typeHay.some((value) => value === 'camminata')) return 'camminata';
  if (typeHay.some((value) => value === 'corsa')) return 'corsa';
  if (typeHay.some((value) => LOCOMOTION_KIND_SET.has(value))) {
    return typeHay.some((value) => CAMMINATA_HINT_RE.test(value)) ? 'camminata' : 'corsa';
  }

  const textHay = [
    hints.workoutName,
    hints.title,
    hints.label,
    hints.desc,
    hints.subtitle,
  ]
    .map((value) => String(value || ''))
    .join(' ');
  if (!LOCOMOTION_HINT_RE.test(textHay)) return null;
  if (CAMMINATA_HINT_RE.test(textHay) && !CORSA_HINT_RE.test(textHay)) return 'camminata';
  return 'corsa';
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
      maxClampSeconds: resolveQuickEventVideoMaxClampSeconds(videoSrc),
    };
  }
  return null;
}

function buildLocomotionConfirmPayload(locomotionKind, extra = {}) {
  const visual = takeNextLocomotionConfirmVisual();
  return {
    kind: locomotionKind,
    title: extra.title
      || (locomotionKind === 'corsa' ? 'Corsa registrata' : 'Camminata registrata'),
    subtitle: extra.subtitle || undefined,
    imageSrc: visual.imageSrc,
    videoSrc: visual.videoSrc,
  };
}

/**
 * @param {'water'|'nap'|'coffee'|'tea'|'energy'|'workout'|'training'|'allenamento'|'camminata'|'corsa'} kind
 * @param {{ title?: string, subtitle?: string, workoutType?: string, activityType?: string, workoutName?: string }} [extra]
 * @returns {{ kind: string, title: string, subtitle?: string, imageSrc: string, videoSrc: string|null }}
 */
export function buildQuickEventConfirmPayload(kind, extra = {}) {
  const normalizedKind = String(kind || '').toLowerCase().trim();
  const shouldCheckLocomotion = !normalizedKind
    || LOCOMOTION_KIND_SET.has(normalizedKind)
    || normalizedKind === 'workout'
    || normalizedKind === 'training'
    || normalizedKind === 'allenamento';
  const locomotionKind = shouldCheckLocomotion
    ? resolveLocomotionConfirmKind({
      kind: normalizedKind,
      workoutType: extra.workoutType,
      activityType: extra.activityType,
      subType: extra.subType,
      activityId: extra.activityId,
      workoutName: extra.workoutName,
      title: extra.title,
      label: extra.label,
      desc: extra.desc,
    })
    : null;
  if (locomotionKind) {
    return buildLocomotionConfirmPayload(locomotionKind, extra);
  }
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
      maxClampSeconds: resolveQuickEventVideoMaxClampSeconds(visual.videoSrc),
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
      maxClampSeconds: resolveQuickEventVideoMaxClampSeconds(visual.videoSrc),
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
      maxClampSeconds: resolveQuickEventVideoMaxClampSeconds(visual.videoSrc),
    };
  }
  return null;
}

/**
 * Entry cronologia chat per conferma media (sistema).
 * @param {'water'|'nap'|'coffee'|'tea'|'energy'|'workout'|'training'|'allenamento'|'camminata'|'corsa'} kind
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
            : kindKey === 'workout' || kindKey === 'camminata' || kindKey === 'corsa'
              ? 'workout'
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
