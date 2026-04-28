export function formatBodyBatteryValue(v) {
  const n = Math.round(Number(v) * 10) / 10;
  if (n === 0) return '0%';
  return `${n > 0 ? '+' : ''}${n}%`;
}

const COLUMN_ALIASES = {
  date: ['date', 'data', 'giorno'],
  weight: ['weight', 'peso', 'kg'],
  fat: ['grasso', 'fat', 'adipose', 'bf'],
  muscle: ['muscol', 'muscle', 'skeletal'],
  water: ['acqua', 'water', 'hydration', 'eau'],
  visceral: ['viscerale', 'visceral', 'vfr'],
};

const CSV_BODY_METRIC_FIELDS = ['date', 'weight', 'fat', 'muscle', 'water', 'visceral'];

export function extractNumber(str) {
  if (str == null) return null;
  let s = String(str).replace(/[^0-9.,-]/g, '');
  if (!s || s === '-') return null;
  const lastComma = s.lastIndexOf(',');
  if (lastComma !== -1) {
    s = `${s.slice(0, lastComma).replace(/,/g, '')}.${s.slice(lastComma + 1)}`;
  }
  s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCsvTimeFragment(timePart) {
  const t = String(timePart).trim();
  if (!t) return '12:00:00';
  if (/^\d{1,2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 8);
  return t;
}

/**
 * Riconosce YYYY-MM-DD, EU (GG/MM/YYYY o GG-MM-YYYY con primi token) e US MM-DD-YYYY quando ambiguo con trattino.
 * @returns {{ isoDate: string, timestamp: number } | null}
 */
export function parseUniversalDate(raw) {
  if (raw == null || raw === '') return null;
  const str = String(raw).trim();
  const [datePart, ...timeRest] = str.split(/\s+/);
  if (!datePart) return null;
  const timePart = timeRest.join(' ').trim();

  let year;
  let month;
  let day;

  let m = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const y = Number(m[3]);
      if (a > 12) {
        day = a;
        month = b;
        year = y;
      } else if (b > 12) {
        month = a;
        day = b;
        year = y;
      } else {
        day = a;
        month = b;
        year = y;
      }
    } else {
      m = datePart.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        const y = Number(m[3]);
        if (a > 12) {
          day = a;
          month = b;
          year = y;
        } else if (b > 12) {
          month = a;
          day = b;
          year = y;
        } else {
          month = a;
          day = b;
          year = y;
        }
      }
    }
  }

  if (
    year == null ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const isoTime = normalizeCsvTimeFragment(timePart);
  const d = new Date(`${isoDate}T${isoTime}`);
  if (!Number.isFinite(d.getTime())) return null;
  return { isoDate, timestamp: d.getTime() };
}

export function buildBodyMetricsColumnMap(headerLine) {
  const headerCells = headerLine
    .replace(/"/g, '')
    .toLowerCase()
    .split(',')
    .map((h) => h.trim());

  const columnMap = { date: -1, weight: -1, fat: -1, muscle: -1, water: -1, visceral: -1 };

  for (const field of CSV_BODY_METRIC_FIELDS) {
    const aliases = COLUMN_ALIASES[field];
    if (!aliases) continue;
    for (let i = 0; i < headerCells.length; i++) {
      const h = headerCells[i];
      if (aliases.some((alias) => h.includes(alias))) {
        columnMap[field] = i;
        break;
      }
    }
  }

  if (columnMap.date === -1 || columnMap.weight === -1) {
    throw new Error(
      "CSV: intestazione non valida — servono colonne riconoscibili per data e peso (es. 'date'/'data' e 'weight'/'peso')."
    );
  }

  return { columnMap, headerCells };
}
