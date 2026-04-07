/**
 * Frasi introduttive chat Kentu: rotazione su caricamento senza ripetizioni
 * fino a esaurimento elenco, poi nuovo mescolamento (evita stesso testo consecutivo).
 */

export const KENTU_INTRO_PHRASES = [
  'KentuOS ONLINE. Interfaccia Premium e Motore Biochimico allineati.',
  'Oggi costruiamo chiarezza su numeri e abitudini — sei nel posto giusto.',
  'Un passo alla volta: il motore impara dai tuoi dati reali.',
  'La costanza batte la perfezione. Iniziamo con calma e precisione.',
  'Il tuo diario è la bussola; KentuOS ti affianca su pasti e obiettivi.',
  'Piccole scelte coerenti, grandi risultati nel tempo.',
  'Allinea energia, macro e sonno: sistema e insight sono pronti.',
  'Traccia, rifinisci, migliora — senza drammi, con metodo.',
  'Oggi è un buon giorno per essere sinceri coi numeri.',
  'Ben tornato: interfaccia premium e motore biochimico in ascolto.',
  'Focus su ciò che controlli: nutrizione, movimento, recupero.',
  'KentuOS attivo. Trasforma i dati in decisioni semplici.',
];

const LS_QUEUE_KEY = 'kentu_intro_queue_v1';
const LS_LAST_KEY = 'kentu_intro_last_v1';

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
 * Prossima frase intro (consuma dalla coda in localStorage).
 * Rotazione: nessuna ripetizione finché non sono passate tutte; poi nuovo shuffle.
 */
export function takeNextKentuIntroPhrase() {
  if (!KENTU_INTRO_PHRASES.length) return '';
  if (typeof localStorage === 'undefined') {
    return KENTU_INTRO_PHRASES[Math.floor(Math.random() * KENTU_INTRO_PHRASES.length)];
  }
  try {
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

export function getDefaultKentuChatHistory() {
  return [{ sender: 'ai', text: takeNextKentuIntroPhrase() }];
}
