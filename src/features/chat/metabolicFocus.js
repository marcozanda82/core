/**
 * Focus Metabolico — naming benessere (ex Insight Clinico / Nutrizione Clinica)
 * e parsing del bollettino mattutino per la card in chat.
 */

export const METABOLIC_FOCUS_LABEL = 'Focus Metabolico';
export const METABOLIC_FOCUS_PILLAR_HINT = 'Sintesi del mattino';
export const METABOLIC_FOCUS_CHAT_CTA = 'Espandi Focus Metabolico';
export const METABOLIC_FOCUS_MESSAGE_TYPE = 'METABOLIC_FOCUS';

const LIGHT_RE = /semaforo\s+(verde|giallo|rosso)/i;
const SECTION_HEADER_RE =
  /^(?:\*{0,2}|#{1,3}\s*)?(digestione|recupero|fueling|nutrizion\w*|infiamm\w*)\b/i;

const SECTION_DEFS = Object.freeze([
  { id: 'digestione', icon: '🍽️', label: 'Digestione', sheetLabel: 'Cena vs sonno' },
  { id: 'recupero', icon: '⚡', label: 'Recupero', sheetLabel: 'Recupero muscolare' },
  { id: 'fueling', icon: '🎯', label: 'Fueling', sheetLabel: 'Fueling di oggi' },
]);

/**
 * @param {string} raw
 * @param {number} max
 */
export function clipMetabolicFocusText(raw, max = 140) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 48 ? cut.slice(0, sp) : cut).trim()}…`;
}

function stripBulletPrefix(line) {
  return String(line || '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
    .replace(/^\*{1,2}|\*{1,2}$/g, '')
    .trim();
}

/**
 * @param {string} text
 * @returns {{ key: 'verde' | 'giallo' | 'rosso', label: string }}
 */
export function parseMetabolicFocusLight(text) {
  const match = LIGHT_RE.exec(String(text || ''));
  const key = match ? String(match[1]).toLowerCase() : 'giallo';
  const label =
    key === 'verde' ? 'Semaforo Verde'
      : key === 'rosso' ? 'Semaforo Rosso'
        : 'Semaforo Giallo';
  return { key: /** @type {'verde'|'giallo'|'rosso'} */ (key), label };
}

/**
 * @param {string} text
 * @returns {Record<'digestione'|'recupero'|'fueling', string[]>}
 */
function collectMetabolicFocusBuckets(text) {
  const lines = String(text || '').split(/\r?\n/);
  /** @type {Record<'digestione'|'recupero'|'fueling', string[]>} */
  const buckets = { digestione: [], recupero: [], fueling: [] };
  let current = /** @type {null | 'digestione' | 'recupero' | 'fueling'} */ (null);

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) continue;
    const header = SECTION_HEADER_RE.exec(line.replace(/[:.]+\s*$/, ''));
    if (header) {
      const token = String(header[1]).toLowerCase();
      if (token.startsWith('digest') || token.startsWith('infiamm')) current = 'digestione';
      else if (token.startsWith('recup')) current = 'recupero';
      else current = 'fueling';
      const rest = stripBulletPrefix(line.replace(SECTION_HEADER_RE, '').replace(/^[\s:—-]+/, ''));
      if (rest && rest.length > 8) buckets[current].push(rest);
      continue;
    }
    if (!current) continue;
    if (LIGHT_RE.test(line)) continue;
    const bullet = stripBulletPrefix(line);
    if (bullet) buckets[current].push(bullet);
  }
  return buckets;
}

/**
 * @param {string} text
 * @returns {Array<{ id: string, icon: string, label: string, sheetLabel: string, summary: string, bullets: string[] }>}
 */
export function parseMetabolicFocusPills(text) {
  const buckets = collectMetabolicFocusBuckets(text);
  return SECTION_DEFS
    .map((def) => ({
      ...def,
      bullets: buckets[def.id],
      summary: clipMetabolicFocusText(buckets[def.id][0] || '', 72),
    }))
    .filter((pill) => pill.summary || (pill.bullets && pill.bullets.length > 0));
}

/**
 * Sezioni complete per il bottom sheet in chat.
 * @param {string} text
 */
export function parseMetabolicFocusSections(text) {
  return parseMetabolicFocusPills(text)
    .map((pill) => ({
      ...pill,
      bullets: Array.isArray(pill.bullets) && pill.bullets.length > 0
        ? pill.bullets
        : (pill.summary ? [pill.summary] : []),
    }))
    .filter((section) => section.bullets.length > 0);
}

/**
 * Micro-badge di stato per header scheda / sheet.
 * @param {string} text
 * @param {'verde'|'giallo'|'rosso'} lightKey
 */
export function parseMetabolicFocusStatusBadges(text, lightKey = 'giallo') {
  const raw = String(text || '').toLowerCase();
  const inflammationHot = /infiamm|pcr|proteina\s*c|cena\s+pesante|grassi\s+(alti|eccess|saz)/i.test(raw);
  const inflammation = inflammationHot
    ? (lightKey === 'rosso' ? 'alto' : 'presente')
    : lightKey === 'verde' ? 'calmo' : 'monitoraggio';
  const recovery =
    lightKey === 'verde' ? 'ok'
      : lightKey === 'rosso' ? 'basso'
        : 'cautela';
  return [
    {
      id: 'readiness',
      label: 'Readiness',
      value: lightKey === 'verde' ? 'Pronto' : lightKey === 'rosso' ? 'Stop' : 'Scarico',
      tone: lightKey,
    },
    {
      id: 'inflammation',
      label: 'Infiammazione',
      value: inflammation === 'calmo' ? 'Calma'
        : inflammation === 'alto' ? 'Alta'
          : inflammation === 'presente' ? 'Presente'
            : 'Check',
      tone: inflammation === 'calmo' ? 'verde' : inflammation === 'alto' ? 'rosso' : 'giallo',
    },
    {
      id: 'recovery',
      label: 'Recupero',
      value: recovery === 'ok' ? 'Ok' : recovery === 'basso' ? 'Basso' : 'Cautela',
      tone: recovery === 'ok' ? 'verde' : recovery === 'basso' ? 'rosso' : 'giallo',
    },
  ];
}

/**
 * @param {string} text
 */
export function parseMetabolicFocusReport(text) {
  const raw = String(text || '').trim();
  const light = parseMetabolicFocusLight(raw);
  const pills = parseMetabolicFocusPills(raw);
  const withoutHeaders = raw
    .replace(LIGHT_RE, ' ')
    .replace(/^\s*(?:\*{0,2}|#{1,3}\s*)?(digestione|recupero|fueling|nutrizion\w*|infiamm\w*)\b[^\n]*/gim, ' ')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const teaser = clipMetabolicFocusText(withoutHeaders, 168)
    || `${light.label}: sintesi del mattino pronta.`;
  return {
    light,
    teaser,
    pills,
    sections: pills.map((pill) => ({
      ...pill,
      bullets: pill.bullets?.length ? pill.bullets : (pill.summary ? [pill.summary] : []),
    })).filter((section) => section.bullets.length > 0),
    badges: parseMetabolicFocusStatusBadges(raw, light.key),
    raw,
  };
}

/**
 * @param {object | null | undefined} msg
 */
export function isMetabolicFocusMessage(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.sender && msg.sender !== 'ai') return false;
  if (msg.reportCard || msg.reportLoading || msg.type === 'PERIOD_REPORT' || msg.type === 'REPORT_LOADING') {
    return false;
  }
  if (
    msg.clinicalInsight === true
    || msg.metabolicFocus === true
    || msg.type === METABOLIC_FOCUS_MESSAGE_TYPE
  ) {
    return true;
  }
  const t = String(msg.text || msg.displayText || '');
  if (!LIGHT_RE.test(t)) return false;
  return /(digestione|fueling|recupero)/i.test(t);
}
