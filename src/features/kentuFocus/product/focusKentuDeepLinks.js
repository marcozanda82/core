/**
 * Deep-link reali verso Kentu OS (route esistenti).
 * Non inventa path: solo `/`, `/centro-analisi`, `/kentu-focus`.
 */

/** @typedef {{ to: string, state?: object|null, label: string, engineId: string }} FocusDeepLink */

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

  return {
    pilotaEnergetico: {
      engineId: 'pilota_energetico',
      label: 'Pilota energetico',
      to: '/centro-analisi?area=calibrazione_target',
      state: null,
    },
    bussola: {
      engineId: 'bussola_metabolica',
      label: 'Bussola metabolica',
      to: '/centro-analisi?area=strumentazione&room=bussola',
      state: null,
    },
    stimoloMuscolare: {
      engineId: 'stimolo_muscolare',
      label: 'Stimolo muscolare',
      to: '/',
      state: { openFotografia: 'progressione' },
    },
    cardio: {
      engineId: 'cardio',
      label: 'Cardio / allenamento',
      to: '/centro-analisi?area=progressione',
      state: null,
    },
    focusPeriod: {
      engineId: 'kentu_focus',
      label: 'Kentu Focus',
      to: `/kentu-focus${focusSuffix}`,
      state: null,
    },
  };
}
