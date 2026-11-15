/**
 * Date e periodi in fuso Europe/Rome (senza dipendenze extra).
 */

const TZ = 'Europe/Rome';

function partsInRome(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const bag = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    iso: `${bag.year}-${bag.month}-${bag.day}`,
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    weekday: bag.weekday, // Mon, Tue, …
  };
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(utc);
  // Ricostruisci la data civile come se fosse mezzogiorno UTC sul giorno target
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const WEEKDAY_TO_OFFSET = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

function mondayOfWeek(iso, weekdayShort) {
  const offset = WEEKDAY_TO_OFFSET[weekdayShort];
  if (offset == null) throw new Error(`weekday sconosciuto: ${weekdayShort}`);
  return addDaysIso(iso, -offset);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

/**
 * @param {string} ref
 * @param {Date} [now]
 * @returns {{ date: string }}
 */
export function resolveDayRef(ref, now = new Date()) {
  const raw = String(ref || '').trim().toLowerCase();
  const { iso } = partsInRome(now);
  if (raw === 'today' || raw === 'oggi') return { date: iso };
  if (raw === 'yesterday' || raw === 'ieri') return { date: addDaysIso(iso, -1) };
  if (isIsoDate(ref)) return { date: String(ref).trim() };
  throw new Error(`data non valida: usa today, yesterday o YYYY-MM-DD`);
}

/**
 * @param {string} kind
 * @param {Date} [now]
 * @returns {{ kind: 'week'|'month', periodId: 'settimana'|'mese', analysisDate: string, from: string, to: string }}
 */
export function resolvePeriodRef(kind, now = new Date()) {
  const key = String(kind || '').trim().toLowerCase();
  const rome = partsInRome(now);
  const today = rome.iso;

  if (key === 'this_week' || key === 'last_week') {
    const thisMonday = mondayOfWeek(today, rome.weekday);
    const monday = key === 'this_week' ? thisMonday : addDaysIso(thisMonday, -7);
    const sunday = addDaysIso(monday, 6);
    const analysisDate = key === 'this_week'
      ? today
      : sunday;
    return {
      kind: 'week',
      periodId: 'settimana',
      analysisDate,
      from: monday,
      to: sunday,
    };
  }

  if (key === 'this_month' || key === 'last_month') {
    let year = rome.year;
    let month = rome.month;
    if (key === 'last_month') {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const analysisDate = key === 'this_month' ? today : to;
    return {
      kind: 'month',
      periodId: 'mese',
      analysisDate,
      from,
      to,
    };
  }

  throw new Error('periodo non valido: this_week, last_week, this_month, last_month');
}

export function todayInRome(now = new Date()) {
  return partsInRome(now).iso;
}

export { TZ as ROME_TZ, addDaysIso, isIsoDate };
