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

/** Sempre una stringa non vuota, anche se l’array exportato fosse vuoto o corrotto. */
const FALLBACK_INTRO_PHRASE = 'La direzione vale più della fretta.';

function getPhrasePool() {
  return Array.isArray(KENTU_INTRO_PHRASES) ? KENTU_INTRO_PHRASES : [];
}

/**
 * Frase casuale dall’elenco canonico; mai throw, mai stringa vuota se esiste almeno una voce valida.
 */
function pickRandomKentuIntroPhrase() {
  try {
    const pool = getPhrasePool().filter((x) => typeof x === 'string' && x.trim() !== '');
    if (pool.length === 0) return FALLBACK_INTRO_PHRASE;
    return pool[Math.floor(Math.random() * pool.length)];
  } catch {
    return FALLBACK_INTRO_PHRASE;
  }
}

function isAllowedPhrase(s) {
  return typeof s === 'string' && s.trim() !== '' && getPhrasePool().includes(s);
}

function shuffleInPlace(arr) {
  try {
    const a = arr;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  } catch {
    /* ignore */
  }
  return arr;
}

function buildFreshQueue(avoidSameAs) {
  try {
    const pool = [...getPhrasePool()].filter((x) => typeof x === 'string' && x.trim() !== '');
    if (pool.length === 0) return [FALLBACK_INTRO_PHRASE];
    shuffleInPlace(pool);
    if (avoidSameAs && pool.length > 1 && pool[0] === avoidSameAs) {
      const swapIdx = pool.findIndex((p) => p !== avoidSameAs);
      if (swapIdx > 0) {
        [pool[0], pool[swapIdx]] = [pool[swapIdx], pool[0]];
      }
    }
    return pool;
  } catch {
    return [FALLBACK_INTRO_PHRASE];
  }
}

/**
 * Svuota coda e ultima frase e imposta un nuovo epoch se:
 * epoch assente/non numerico, orologio indietro (`now < epoch`), o coda più vecchia di 7 giorni.
 * Non lancia: accessi localStorage protetti.
 */
function applyQueueExpirationIfNeeded() {
  if (typeof localStorage === 'undefined' || localStorage == null) return;
  try {
    const rawEpoch = safeGetItem(LS_QUEUE_EPOCH_KEY);
    const epoch = rawEpoch != null ? Number(rawEpoch) : NaN;
    const now = Date.now();
    const staleOrInvalid =
      !Number.isFinite(epoch) ||
      now < epoch ||
      now - epoch > QUEUE_MAX_AGE_MS;
    if (staleOrInvalid) {
      safeRemoveItem(LS_QUEUE_KEY);
      safeRemoveItem(LS_LAST_KEY);
      safeSetItem(LS_QUEUE_EPOCH_KEY, String(now));
    }
  } catch {
    /* quota, private mode, access denied */
  }
}

function safeGetItem(key) {
  try {
    if (typeof localStorage === 'undefined' || localStorage == null) return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    if (typeof localStorage === 'undefined' || localStorage == null) return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(key) {
  try {
    if (typeof localStorage === 'undefined' || localStorage == null) return;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Prossima frase intro (consuma dalla coda in localStorage).
 * Rotazione: nessuna ripetizione finché non sono passate tutte; poi nuovo shuffle.
 * Ogni 7 giorni dalla data in `kentu_intro_queue_epoch_v1` la coda si azzera; se `Date.now()` è prima
 * dell’epoch salvato (orologio spostato indietro) la coda si resetta allo stesso modo.
 *
 * Ritorna sempre una stringa non vuota (fallback: frase casuale o `FALLBACK_INTRO_PHRASE`). Non throw.
 */
export function takeNextKentuIntroPhrase() {
  try {
    const pool = getPhrasePool().filter((x) => typeof x === 'string' && x.trim() !== '');
    if (pool.length === 0) return FALLBACK_INTRO_PHRASE;

    if (typeof localStorage === 'undefined' || localStorage == null) {
      return pickRandomKentuIntroPhrase();
    }

    applyQueueExpirationIfNeeded();

    let queue = null;
    const rawQueue = safeGetItem(LS_QUEUE_KEY);
    if (rawQueue != null && rawQueue !== '') {
      try {
        const parsed = JSON.parse(rawQueue);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((x) => typeof x === 'string' && pool.includes(x))
        ) {
          queue = parsed;
        }
      } catch {
        queue = null;
      }
    }

    if (!queue) {
      const lastRaw = safeGetItem(LS_LAST_KEY);
      const last = typeof lastRaw === 'string' ? lastRaw : '';
      queue = buildFreshQueue(last);
      safeSetItem(LS_QUEUE_KEY, JSON.stringify(queue));
    }

    const next = queue.length > 0 ? queue.shift() : null;
    const candidate = isAllowedPhrase(next) ? next : null;

    safeSetItem(LS_QUEUE_KEY, JSON.stringify(queue));
    if (candidate) safeSetItem(LS_LAST_KEY, candidate);

    return candidate || pickRandomKentuIntroPhrase();
  } catch {
    return pickRandomKentuIntroPhrase();
  }
}
