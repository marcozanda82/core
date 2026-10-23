/**
 * Fedeltà unità metriche in prosa (P6.6.2).
 * Es.: giorni di forza ≠ sessioni.
 */

/**
 * @param {object} authItem
 * @param {string} title
 * @param {string} body
 * @returns {string[]} errori metric_unit_mismatch
 */
export function detectMetricUnitMismatches(authItem, title, body) {
  const text = `${title}\n${body}`;
  /** @type {string[]} */
  const errors = [];

  for (const m of authItem?.metrics || []) {
    if (!m?.path) continue;
    const unit = String(m.unit || '').toLowerCase();
    const path = String(m.path);
    const isDays = unit === 'days' || unit === 'day'
      || /DaysLogged|daysWith|nightsLogged/i.test(path);
    const isSessionsWord = /\bsessioni\b/i.test(text);
    const isDaysWord = /\bgiorni\b/i.test(text);

    if (isDays && /strengthDaysLogged|workoutDaysLogged/i.test(path)) {
      // «N sessioni» / «Quattordici sessioni» con metrica in giorni
      const num = String(m.value);
      const sessionClaim = new RegExp(
        `\\b(${escapeNum(num)}|${escapeNumIt(num)})\\s+sessioni\\b`,
        'i',
      );
      // Titolo: non può essere salvato da un corpo corretto («giorni con sessioni»)
      if (sessionClaim.test(title) || (/\bsessioni\s+di\s+forza\b/i.test(title) && !/\bgiorni\b/i.test(title))) {
        errors.push('metric_unit_mismatch');
        break;
      }
      if (sessionClaim.test(body) && !/\bgiorni\s+con\s+sessioni\b/i.test(body)) {
        errors.push('metric_unit_mismatch');
        break;
      }
      if (isSessionsWord && !isDaysWord && text.includes(num)) {
        if (/\bsessioni\s+di\s+forza\b/i.test(text) || /\bforza\b.*\bsessioni\b/i.test(text)) {
          errors.push('metric_unit_mismatch');
          break;
        }
      }
    }

    if ((unit === 'h' || unit === 'hour_decimal' || /avgHours|wakeMedian/i.test(path))
      && /\bqualit[aà]\s+del\s+sonno\b/i.test(text)
      && /\b(migliorat|peggiorat|ottim)/i.test(text)
      && text.includes(String(m.value))) {
      // Durata spacciata per qualità: segnale debole, solo se esplicito
      errors.push('metric_unit_mismatch');
      break;
    }
  }

  return errors;
}

function escapeNum(n) {
  return String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeNumIt(n) {
  const map = {
    14: 'quattordici',
    12: 'dodici',
    7: 'sette',
    10: 'dieci',
    16: 'sedici',
  };
  return map[String(n)] || escapeNum(n);
}

/**
 * Formattazione unità per materialize (path autorizzati).
 * Valore numerico invariato (punto decimale); unità days → «giorni», hour_decimal → «h».
 * @param {{ value: unknown, unit?: string|null }} m
 */
export function formatAuthorizedMetricDisplay(m) {
  const rawUnit = m.unit != null ? String(m.unit) : '';
  const valueStr = m.value == null ? '' : String(m.value);
  if (!rawUnit) return valueStr;
  if (rawUnit === 'days' || rawUnit === 'day') return `${valueStr} giorni`;
  if (rawUnit === 'hour_decimal') return `${valueStr} h`;
  return `${valueStr} ${rawUnit}`.trim();
}
