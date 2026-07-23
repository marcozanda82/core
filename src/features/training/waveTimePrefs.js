/**
 * Costanti e helper Fascia (Tag) + Ora Esatta per il Wave Planner.
 */

/** @typedef {'mattina'|'pomeriggio'|'sera'} WaveTimeTag */

export const DEFAULT_WAVE_TIME_PREFS = {
  mattina: '07:00',
  pomeriggio: '14:30',
  sera: '19:00',
};

export const WAVE_TIME_TAG_OPTIONS = [
  { id: 'mattina', label: 'Mattina', hint: '05:00–13:00' },
  { id: 'pomeriggio', label: 'Pomeriggio', hint: '13:00–18:00' },
  { id: 'sera', label: 'Sera', hint: '18:00–23:59' },
];

/**
 * @param {unknown} raw
 * @returns {string | null} HH:mm
 */
export function normalizeExactTime(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * @param {string | null | undefined} exactTime
 * @returns {WaveTimeTag}
 */
export function inferTimeTagFromExact(exactTime) {
  const t = normalizeExactTime(exactTime);
  if (!t) return 'sera';
  const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
  const mins = hh * 60 + mm;
  if (mins >= 5 * 60 && mins < 13 * 60) return 'mattina';
  if (mins >= 13 * 60 && mins < 18 * 60) return 'pomeriggio';
  return 'sera';
}

/**
 * @param {unknown} raw
 * @returns {WaveTimeTag | null}
 */
export function normalizeTimeTag(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'mattina' || s === 'pomeriggio' || s === 'sera') return s;
  return null;
}

/**
 * @param {string | null | undefined} exactTime
 * @returns {number} ore decimali 0–24
 */
export function exactTimeToDecimalHour(exactTime) {
  const t = normalizeExactTime(exactTime);
  if (!t) return 18;
  const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
  return Math.min(23.99, Math.max(0, hh + mm / 60));
}

/**
 * @param {unknown} raw
 * @returns {{ mattina: string, pomeriggio: string, sera: string }}
 */
export function sanitizeWaveTimePrefs(raw) {
  const base = { ...DEFAULT_WAVE_TIME_PREFS };
  if (!raw || typeof raw !== 'object') return base;
  for (const key of Object.keys(DEFAULT_WAVE_TIME_PREFS)) {
    const n = normalizeExactTime(raw[key]);
    if (n) base[key] = n;
  }
  return base;
}
