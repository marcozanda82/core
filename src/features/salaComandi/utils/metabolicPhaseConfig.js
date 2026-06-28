/** Fase override: stress/recupero insufficiente — ha priorità sulla timeline post-pasto. */
export const METABOLIC_OVERLOAD_PHASE = {
  id: 'sovraccarico',
  label: 'SOVRACCARICO',
  badgeLabel: 'ALERT',
  color: 'text-red-500 bg-red-500/20',
  action: 'Scarica e riposa',
  iconPath: '/assets/metabolic/sovraccarico.png',
  iconColor: '#ef4444',
  isOverride: true,
};

/**
 * Config fasi metaboliche post-pasto.
 * Ogni fase espone `iconPath` (asset PNG locale) e `iconColor` per halo UI.
 */
export const METABOLIC_PHASES = [
  {
    id: 'digestione',
    minHours: 0,
    maxHours: 2,
    label: 'Digestione',
    color: 'text-orange-500 bg-orange-500/10',
    action: 'Riposo',
    iconPath: '/assets/metabolic/digestione.png',
    iconColor: '#f97316',
  },
  {
    id: 'assorbimento',
    minHours: 2,
    maxHours: 6,
    label: 'Assorbimento',
    color: 'text-green-500 bg-green-500/10',
    action: 'Attività Leggera',
    iconPath: '/assets/metabolic/assorbimento.png',
    iconColor: '#22c55e',
  },
  {
    id: 'glicogeno',
    minHours: 6,
    maxHours: 12,
    label: 'Uso del Glicogeno',
    color: 'text-cyan-500 bg-cyan-500/10',
    action: 'Spingi sui pesi',
    iconPath: '/assets/metabolic/uso_del_glicogeno.png',
    iconColor: '#06b6d4',
  },
  {
    id: 'transizione',
    minHours: 12,
    maxHours: 16,
    label: 'Transizione',
    color: 'text-amber-500 bg-amber-500/10',
    action: 'Attività Moderata',
    iconPath: '/assets/metabolic/transizione.png',
    iconColor: '#f59e0b',
  },
  {
    id: 'brucio_grassi',
    minHours: 16,
    maxHours: 24,
    label: 'Brucio Grassi',
    color: 'text-blue-500 bg-blue-500/10',
    action: 'Performance',
    iconPath: '/assets/metabolic/brucio_grassi.png',
    iconColor: '#3b82f6',
  },
  {
    id: 'autofagia',
    minHours: 24,
    maxHours: 48,
    label: 'Pulizia Cellulare',
    color: 'text-purple-500 bg-purple-500/10',
    action: 'Rigenerazione',
    iconPath: '/assets/metabolic/autofagia.png',
    iconColor: '#a855f7',
  },
  {
    id: 'digiuno_profondo',
    minHours: 48,
    maxHours: Infinity,
    label: 'Digiuno Profondo',
    color: 'text-teal-500 bg-teal-500/10',
    action: 'Focus e Chiarezza',
    iconPath: '/assets/metabolic/digiuno_profondo.png',
    iconColor: '#14b8a6',
  },
];

/** Tutte le fasi visualizzabili in timeline (7 metaboliche + sovraccarico). */
export const METABOLIC_TIMELINE_PHASES = [...METABOLIC_PHASES, METABOLIC_OVERLOAD_PHASE];

/** Colore hex fase da ore dall'ultimo pasto (allineato a METABOLIC_PHASES). */
export function resolvePhaseColorForHoursSinceMeal(hours) {
  const h = Math.max(0, Number(hours) || 0);
  const phase = METABOLIC_PHASES.find((item) => h >= item.minHours && h < item.maxHours)
    ?? METABOLIC_PHASES[METABOLIC_PHASES.length - 1];
  return phase.iconColor ?? '#4ade80';
}

/** Id fase da ore dall'ultimo pasto. */
export function resolvePhaseIdForHoursSinceMeal(hours) {
  const h = Math.max(0, Number(hours) || 0);
  const phase = METABOLIC_PHASES.find((item) => h >= item.minHours && h < item.maxHours);
  return phase?.id ?? METABOLIC_PHASES[METABOLIC_PHASES.length - 1].id;
}
