/**
 * Deep-link reali verso Kentu OS (route esistenti).
 * Sempre path relativi (`/centro-analisi?...`), mai origin assoluto.
 */

/** @typedef {{ to: string, state?: object|null, label: string, engineId: string }} FocusDeepLink */

/**
 * @param {string} to
 * @returns {string}
 */
export function toFocusRelativeDeepLink(to) {
  const raw = String(to || '').trim();
  if (!raw) return '/';
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      return `${u.pathname}${u.search}${u.hash}` || '/';
    }
  } catch {
    /* keep */
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * @param {{ analysisDate?: string|null, periodId?: string|null }} [ctx]
 * @returns {Record<string, FocusDeepLink>}
 */
export function buildFocusKentuDeepLinks(ctx = {}) {
  const date = ctx.analysisDate || null;
  const periodId = ctx.periodId || null;
  const focusQuery = new URLSearchParams();
  if (periodId) focusQuery.set('period', periodId);
  if (date) focusQuery.set('date', date);
  const focusSuffix = focusQuery.toString() ? `?${focusQuery}` : '';

  /** @type {Record<string, FocusDeepLink>} */
  const links = {
    pilotaEnergetico: {
      engineId: 'pilota_energetico',
      label: 'Target e bilanci',
      to: '/centro-analisi?area=calibrazione_target',
      state: null,
    },
    bussola: {
      engineId: 'bussola_metabolica',
      label: 'Andamento settimanale',
      to: '/centro-analisi?area=strumentazione&room=bussola',
      state: null,
    },
    stimoloMuscolare: {
      engineId: 'stimolo_muscolare',
      label: 'Forza e muscoli',
      to: '/centro-analisi?area=progressione&focus=forza',
      state: { openFotografia: 'progressione' },
    },
    cardio: {
      engineId: 'cardio',
      label: 'Movimento',
      to: '/centro-analisi?area=progressione&focus=cardio',
      state: null,
    },
    focusPeriod: {
      engineId: 'kentu_focus',
      label: 'Kentu Focus',
      to: `/kentu-focus${focusSuffix}`,
      state: null,
    },
  };

  for (const key of Object.keys(links)) {
    links[key] = {
      ...links[key],
      to: toFocusRelativeDeepLink(links[key].to),
    };
  }
  return links;
}
