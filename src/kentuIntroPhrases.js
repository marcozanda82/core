/**
 * Frasi introduttive chat Kentu: tono minimale, calmo, su direzione e costanza.
 * Rotazione senza ripetizioni fino a esaurimento elenco, poi nuovo mescolamento.
 * La coda si resetta se l’epoch in localStorage è assente, > 7 giorni fa, o posteriore a `Date.now()` (orologio).
 */

export const KENTU_INTRO_PHRASES = [
  'La direzione vale più della fretta.',
  'Conta dove indirizzi la tua attenzione.',
  'Un passo verso ciò che conta.',
  'Costanza silenziosa giorno dopo giorno.',
  'Meglio lento che fuori strada.',
  'La direzione giusta non ha fretta.',
  'Rallentare aiuta a vedere chiaro.',
  'Non basta muoversi serve intenzione.',
  'Ogni scelta disegna la tua rotta.',
  'Coerenza di poco ma ogni giorno.',
  'La rotta conta più del passo.',
  'Dove vai importa come vai.',
  'Intenzione chiara anche nei giorni piccoli.',
  'Pace nel tenere la traccia scelta.',
  'Un grado alla volta basta spesso.',
  'Prima la bussola poi il passo.',
  'Restare nel verso che scegli.',
  'Il filo conduttore lo tieni tu.',
  'Passo dopo passo verso il senso.',
  'La calma è parte del percorso.',
];

const LS_QUEUE_KEY = 'kentu_intro_queue_v1';
const LS_LAST_KEY = 'kentu_intro_last_v1';
/** Timestamp ms dell’ultimo avvio ciclo coda (rotazione “fresca” ogni 7 giorni). */
const LS_QUEUE_EPOCH_KEY = 'kentu_intro_queue_epoch_v1';

const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildFreshQueue(avoidSameAs) {
  const pool = [...KENTU_INTRO_PHRASES];
  shuffleInPlace(pool);
  if (avoidSameAs && pool.length > 1 && pool[0] === avoidSameAs) {
    const swapIdx = pool.findIndex((p) => p !== avoidSameAs);
    if (swapIdx > 0) {
      [pool[0], pool[swapIdx]] = [pool[swapIdx], pool[0]];
    }
  }
  return pool;
}

/**
 * Svuota coda e ultima frase e imposta un nuovo epoch se:
 * epoch assente/non numerico, orologio indietro (`now < epoch`), o coda più vecchia di 7 giorni.
 */
function applyQueueExpirationIfNeeded() {
  const rawEpoch = localStorage.getItem(LS_QUEUE_EPOCH_KEY);
  const epoch = rawEpoch != null ? Number(rawEpoch) : NaN;
  const now = Date.now();
  const staleOrInvalid =
    !Number.isFinite(epoch) ||
    now < epoch ||
    now - epoch > QUEUE_MAX_AGE_MS;
  if (staleOrInvalid) {
    localStorage.removeItem(LS_QUEUE_KEY);
    localStorage.removeItem(LS_LAST_KEY);
    localStorage.setItem(LS_QUEUE_EPOCH_KEY, String(now));
  }
}

/**
 * Prossima frase intro (consuma dalla coda in localStorage).
 * Rotazione: nessuna ripetizione finché non sono passate tutte; poi nuovo shuffle.
 * Ogni 7 giorni dalla data in `kentu_intro_queue_epoch_v1` la coda si azzera; se `Date.now()` è prima
 * dell’epoch salvato (orologio spostato indietro) la coda si resetta allo stesso modo.
 */
export function takeNextKentuIntroPhrase() {
  if (!KENTU_INTRO_PHRASES.length) return '';
  if (typeof localStorage === 'undefined') {
    return KENTU_INTRO_PHRASES[Math.floor(Math.random() * KENTU_INTRO_PHRASES.length)];
  }
  try {
    applyQueueExpirationIfNeeded();
    let raw = localStorage.getItem(LS_QUEUE_KEY);
    let queue = raw ? JSON.parse(raw) : null;
    const valid =
      Array.isArray(queue) &&
      queue.length > 0 &&
      queue.every((x) => typeof x === 'string' && KENTU_INTRO_PHRASES.includes(x));
    if (!valid) {
      const last = localStorage.getItem(LS_LAST_KEY) || '';
      queue = buildFreshQueue(last);
      localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(queue));
    }
    const next = queue.shift();
    localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(queue));
    if (next) localStorage.setItem(LS_LAST_KEY, next);
    return next || KENTU_INTRO_PHRASES[0];
  } catch {
    return KENTU_INTRO_PHRASES[Math.floor(Math.random() * KENTU_INTRO_PHRASES.length)];
  }
}
