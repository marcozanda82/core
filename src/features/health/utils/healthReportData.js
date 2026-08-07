/**
 * Fetch + merge cronologico diario_salute / eccezioni_terapia (Firestore).
 */

import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { firestore } from '../../../firebaseConfig.js';

/** Allineati a healthChatService.js */
const COLLECTION_DIARIO_SALUTE = 'diario_salute';
const COLLECTION_ECCEZIONI_TERAPIA = 'eccezioni_terapia';

/**
 * @typedef {object} HealthReportRow
 * @property {string} id
 * @property {'diario' | 'eccezione' | 'merged'} kind
 * @property {number} sortMs
 * @property {Date | null} date
 * @property {string} dateLabel
 * @property {string} timeLabel
 * @property {string | null} momento
 * @property {string | null} alimenti
 * @property {number | null} glicemia
 * @property {string | null} contestoGlicemia
 * @property {string | null} notaTerapia
 * @property {string | null} tipoEccezione
 * @property {boolean} hasEccezione
 */

const MOMENTO_LABEL = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
};

const CONTESTO_LABEL = {
  'pre-prandiale': 'Pre-prandiale',
  'post-prandiale': 'Post-prandiale',
};

/**
 * @param {unknown} value
 * @returns {number}
 */
export function resolveDocTimestampMs(value) {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value?.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * @param {number} ms
 * @returns {{ date: Date | null, dateLabel: string, timeLabel: string }}
 */
export function formatReportDateTime(ms) {
  if (!ms || !Number.isFinite(ms)) {
    return { date: null, dateLabel: '—', timeLabel: '—' };
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return { date: null, dateLabel: '—', timeLabel: '—' };
  }
  return {
    date,
    dateLabel: date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    timeLabel: date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

/**
 * @param {string | null | undefined} momento
 */
export function labelMomento(momento) {
  if (!momento) return '—';
  const key = String(momento).trim().toLowerCase();
  return MOMENTO_LABEL[key] || String(momento);
}

/**
 * @param {string | null | undefined} contesto
 */
export function labelContesto(contesto) {
  if (!contesto) return null;
  const key = String(contesto).trim().toLowerCase();
  return CONTESTO_LABEL[key] || String(contesto);
}

/**
 * @param {string} uid
 * @param {string} collectionName
 * @returns {Promise<Array<{ id: string } & Record<string, unknown>>>}
 */
async function fetchUidCollection(uid, collectionName) {
  const q = query(collection(firestore, collectionName), where('uid', '==', uid));
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach((docSnap) => {
    rows.push({ id: docSnap.id, ...docSnap.data() });
  });
  return rows;
}

/**
 * Carica e fonde diario + eccezioni in ordine cronologico (più recente in alto).
 * @param {string} uid
 * @returns {Promise<HealthReportRow[]>}
 */
export async function fetchMergedHealthReportRows(uid) {
  const safeUid = String(uid || '').trim();
  if (!safeUid) return [];

  const [diarioDocs, eccezioneDocs] = await Promise.all([
    fetchUidCollection(safeUid, COLLECTION_DIARIO_SALUTE),
    fetchUidCollection(safeUid, COLLECTION_ECCEZIONI_TERAPIA),
  ]);

  /** @type {HealthReportRow[]} */
  const rows = [];

  for (const doc of diarioDocs) {
    const sortMs = resolveDocTimestampMs(doc.timestamp) || resolveDocTimestampMs(doc.createdAt);
    const { date, dateLabel, timeLabel } = formatReportDateTime(sortMs);
    const glicemiaRaw = doc.valore_glicemia;
    const glicemia = glicemiaRaw == null || glicemiaRaw === ''
      ? null
      : Math.round(Number(glicemiaRaw));
    rows.push({
      id: `diario_${doc.id}`,
      kind: 'diario',
      sortMs,
      date,
      dateLabel,
      timeLabel,
      momento: doc.momento_giornata != null ? String(doc.momento_giornata) : null,
      alimenti: doc.alimenti_consumati != null ? String(doc.alimenti_consumati) : null,
      glicemia: Number.isFinite(glicemia) ? glicemia : null,
      contestoGlicemia: doc.contesto_glicemia != null ? String(doc.contesto_glicemia) : null,
      notaTerapia: null,
      tipoEccezione: null,
      hasEccezione: false,
    });
  }

  for (const doc of eccezioneDocs) {
    const sortMs = resolveDocTimestampMs(doc.timestamp) || resolveDocTimestampMs(doc.createdAt);
    const { date, dateLabel, timeLabel } = formatReportDateTime(sortMs);
    const tipo = doc.tipo_eccezione != null ? String(doc.tipo_eccezione).trim() : '';
    const nota = doc.nota_originale != null ? String(doc.nota_originale).trim() : '';
    const farmaco = doc.farmaco_nome != null ? String(doc.farmaco_nome).trim() : '';
    const parts = [tipo, farmaco ? `Farmaco: ${farmaco}` : '', nota].filter(Boolean);
    rows.push({
      id: `ecc_${doc.id}`,
      kind: 'eccezione',
      sortMs,
      date,
      dateLabel,
      timeLabel,
      momento: null,
      alimenti: null,
      glicemia: null,
      contestoGlicemia: null,
      notaTerapia: parts.join(' — ') || 'Variazione terapia',
      tipoEccezione: tipo || null,
      hasEccezione: true,
    });
  }

  rows.sort((a, b) => (b.sortMs || 0) - (a.sortMs || 0));
  return rows;
}

/**
 * Testo formattato per WhatsApp (medico / familiare).
 * @param {HealthReportRow[]} rows
 * @param {{ patientName?: string, days?: number }} [opts]
 * @returns {string}
 */
export function formatHealthReportForWhatsApp(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const name = String(opts.patientName || '').trim() || 'Paziente';
  const now = new Date();
  const generatedAt = now.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const lines = [
    `🩺 *Report Salute — Diabete*`,
    `👤 ${name}`,
    `🗓️ Generato: ${generatedAt}`,
    `📋 Voci: ${list.length}`,
    '',
  ];

  if (list.length === 0) {
    lines.push('_Nessuna registrazione nel diario._');
    return lines.join('\n');
  }

  list.forEach((row, index) => {
    lines.push(`*${index + 1}. ${row.dateLabel} · ${row.timeLabel}*`);
    if (row.kind === 'eccezione' || row.hasEccezione) {
      lines.push(`⚠️ *Eccezione terapia*`);
      if (row.tipoEccezione) lines.push(`• Tipo: ${row.tipoEccezione}`);
      if (row.notaTerapia) lines.push(`• Nota: ${row.notaTerapia}`);
    } else {
      lines.push(`• Momento: ${labelMomento(row.momento)}`);
      if (row.glicemia != null) {
        const ctx = labelContesto(row.contestoGlicemia);
        lines.push(`• Glicemia: *${row.glicemia} mg/dL*${ctx ? ` (${ctx})` : ''}`);
      } else {
        lines.push('• Glicemia: —');
      }
      if (row.notaTerapia) {
        lines.push(`• Note terapia: ${row.notaTerapia}`);
      }
    }
    lines.push('');
  });

  lines.push('_Inviato da KentuOS_');
  return lines.join('\n').trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
export function buildWhatsAppShareUrl(text) {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(String(text || ''))}`;
}
