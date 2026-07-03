/** Posizioni iniziali (px) per la modalità design Home — tab Oggi. */
export const BASE_HOME_LAYOUT = [
  { id: 'telemetry', x: 14, y: 0, visible: true },
  { id: 'monitor', x: 25, y: 52, visible: true },
  { id: 'macros', x: 14, y: 372, visible: true },
  { id: 'dayPlan', x: 14, y: 452, visible: true },
];

export const PRO_HOME_LAYOUT = [
  { id: 'telemetry', x: 0, y: 0, visible: true },
  { id: 'energyChart', x: 0, y: 48, visible: true },
];

export function getDefaultHomeLayout(isPro) {
  return isPro
    ? PRO_HOME_LAYOUT.map((block) => ({ ...block }))
    : BASE_HOME_LAYOUT.map((block) => ({ ...block }));
}
