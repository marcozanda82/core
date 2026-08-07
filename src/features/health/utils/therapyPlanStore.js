/**
 * Piano terapeutico di base (farmaci) — Firestore `terapia_base/{uid}`.
 */

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '../../../firebaseConfig.js';

export const COLLECTION_TERAPIA_BASE = 'terapia_base';

export const THERAPY_MOMENTI = Object.freeze([
  { value: 'colazione', label: 'Colazione' },
  { value: 'pranzo', label: 'Pranzo' },
  { value: 'cena', label: 'Cena' },
  { value: 'snack', label: 'Snack' },
  { value: 'sera', label: 'Sera / notte' },
]);

/**
 * @typedef {object} TherapyPlanItem
 * @property {string} id
 * @property {string} nome
 * @property {string} dosaggio
 * @property {string[]} momenti
 * @property {boolean} [attivo]
 * @property {string} [note]
 */

/**
 * @typedef {object} TherapyPlanDoc
 * @property {string} uid
 * @property {TherapyPlanItem[]} farmaci
 * @property {number} [updatedAtMs]
 */

/**
 * @returns {string}
 */
export function createTherapyItemId() {
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} raw
 * @returns {TherapyPlanItem | null}
 */
export function normalizeTherapyPlanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const nome = String(raw.nome || raw.name || '').trim();
  if (!nome) return null;
  const dosaggio = String(raw.dosaggio || raw.dosage || '').trim();
  const momentiRaw = Array.isArray(raw.momenti) ? raw.momenti : [];
  const allowed = new Set(THERAPY_MOMENTI.map((m) => m.value));
  const momenti = [...new Set(
    momentiRaw
      .map((m) => String(m || '').trim().toLowerCase())
      .filter((m) => allowed.has(m)),
  )];
  const id = String(raw.id || '').trim() || createTherapyItemId();
  return {
    id,
    nome,
    dosaggio,
    momenti,
    attivo: raw.attivo === false ? false : true,
    note: String(raw.note || '').trim() || '',
  };
}

/**
 * @param {unknown} raw
 * @param {string} uid
 * @returns {TherapyPlanDoc}
 */
export function normalizeTherapyPlanDoc(raw, uid) {
  const list = Array.isArray(raw?.farmaci) ? raw.farmaci : [];
  const farmaci = list
    .map((item) => normalizeTherapyPlanItem(item))
    .filter(Boolean);
  const updatedAtMs = Number(raw?.updatedAtMs);
  return {
    uid: String(uid || raw?.uid || '').trim(),
    farmaci,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
  };
}

/**
 * @param {string} uid
 * @returns {Promise<TherapyPlanDoc>}
 */
export async function fetchTherapyPlan(uid) {
  const safeUid = String(uid || '').trim();
  if (!safeUid) {
    return { uid: '', farmaci: [], updatedAtMs: 0 };
  }
  const snap = await getDoc(doc(firestore, COLLECTION_TERAPIA_BASE, safeUid));
  if (!snap.exists()) {
    return { uid: safeUid, farmaci: [], updatedAtMs: 0 };
  }
  return normalizeTherapyPlanDoc(snap.data(), safeUid);
}

/**
 * @param {string} uid
 * @param {TherapyPlanItem[]} farmaci
 * @returns {Promise<TherapyPlanDoc>}
 */
export async function saveTherapyPlan(uid, farmaci) {
  const safeUid = String(uid || '').trim();
  if (!safeUid) throw new Error('UID mancante per salvare la terapia.');

  const normalized = (Array.isArray(farmaci) ? farmaci : [])
    .map((item) => normalizeTherapyPlanItem(item))
    .filter(Boolean);

  const updatedAtMs = Date.now();
  const payload = {
    uid: safeUid,
    farmaci: normalized,
    updatedAtMs,
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(firestore, COLLECTION_TERAPIA_BASE, safeUid), payload, { merge: true });
  return { uid: safeUid, farmaci: normalized, updatedAtMs };
}

/**
 * Testo compatto del piano per il system prompt AI.
 * @param {TherapyPlanDoc | null | undefined} plan
 * @returns {string}
 */
export function formatTherapyPlanForPrompt(plan) {
  const farmaci = Array.isArray(plan?.farmaci) ? plan.farmaci.filter((f) => f?.attivo !== false) : [];
  if (farmaci.length === 0) {
    return 'PIANO_TERAPEUTICO: nessun farmaco configurato in terapia_base.';
  }
  const lines = farmaci.map((f, i) => {
    const momenti = (f.momenti || []).join(', ') || 'non specificato';
    const dose = f.dosaggio ? ` · ${f.dosaggio}` : '';
    return `${i + 1}. ${f.nome}${dose} · momenti: ${momenti}`;
  });
  return [
    'PIANO_TERAPEUTICO_BASE (riferimento per riconoscere omissioni/ritardi/variazioni):',
    ...lines,
    'Se l’utente parla di uno di questi farmaci (saltato, ritardo, dose diversa, doppia dose),',
    'compila sempre eccezione_terapia con tipo, farmaco_nome e nota_originale.',
  ].join('\n');
}

/**
 * Match grezzo nome farmaco nel testo utente.
 * @param {string} userText
 * @param {TherapyPlanItem[]} farmaci
 * @returns {TherapyPlanItem | null}
 */
export function matchTherapyDrugInText(userText, farmaci) {
  const text = String(userText || '').toLowerCase();
  if (!text || !Array.isArray(farmaci)) return null;
  let best = null;
  let bestLen = 0;
  for (const f of farmaci) {
    if (!f || f.attivo === false) continue;
    const nome = String(f.nome || '').trim().toLowerCase();
    if (nome.length < 3) continue;
    if (text.includes(nome) && nome.length > bestLen) {
      best = f;
      bestLen = nome.length;
    }
  }
  return best;
}

/**
 * Euristica locale se l'AI non ha compilato l'eccezione.
 * @param {string} userText
 * @param {TherapyPlanDoc | null | undefined} plan
 * @returns {{ tipo_eccezione: string, nota_originale: string, farmaco_nome: string | null, momento_previsto: string | null } | null}
 */
export function inferTherapyExceptionFromText(userText, plan) {
  const text = String(userText || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const therapyHints = /farmac|terap|pillol|compres|metformin|insulina|gliflozin|sulfanil|dose|medicinale/i.test(lower);
  const skip = /saltat|omit|non\s+ho\s+pres|dimenticat|skip/i.test(lower);
  const delay = /ritard|in\s+ritardo|tardi|pi[uù]\s+tardi/i.test(lower);
  const doubleDose = /doppia\s+dose|due\s+volte|dose\s+doppia/i.test(lower);
  const reduced = /mezza\s+dose|dose\s+ridott|meno\s+di/i.test(lower);

  if (!therapyHints && !skip && !delay && !doubleDose && !reduced) return null;
  if (!skip && !delay && !doubleDose && !reduced && !therapyHints) return null;
  if (!skip && !delay && !doubleDose && !reduced) return null;

  let tipo = 'variazione';
  if (skip) tipo = 'omissione';
  else if (delay) tipo = 'ritardo';
  else if (doubleDose) tipo = 'dose_doppia';
  else if (reduced) tipo = 'dose_ridotta';

  const matched = matchTherapyDrugInText(text, plan?.farmaci || []);
  return {
    tipo_eccezione: tipo,
    nota_originale: text,
    farmaco_nome: matched?.nome || null,
    momento_previsto: matched?.momenti?.[0] || null,
  };
}
