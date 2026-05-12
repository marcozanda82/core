const ZEN_SUN_MAX = 2.2;

/** Pattern respirazione Neural Reset: fasi in ordine, ms e scala sole per fase */
export const NEURAL_RESET_PATTERNS = {
  square: {
    id: 'square',
    label: 'Respiro quadrato (4-4-4-4)',
    hint: 'Quattro tempi uguali: segui il sole sul mare.',
    steps: [
      { phase: 'Inspira', ms: 4000, sunTarget: ZEN_SUN_MAX },
      { phase: 'Trattieni', ms: 4000, sunTarget: ZEN_SUN_MAX, dimHold: true },
      { phase: 'Espira', ms: 4000, sunTarget: 1 },
      { phase: 'Pausa', ms: 4000, sunTarget: 1 },
    ],
  },
  relax478: {
    id: 'relax478',
    label: 'Rilassamento (4-7-8)',
    hint: 'Inspira 4 s, trattieni 7 s, espira 8 s; il ciclo riparte subito.',
    steps: [
      { phase: 'Inspira', ms: 4000, sunTarget: ZEN_SUN_MAX },
      { phase: 'Trattieni', ms: 7000, sunTarget: ZEN_SUN_MAX, dimHold: true },
      { phase: 'Espira', ms: 8000, sunTarget: 1 },
    ],
  },
  coherent: {
    id: 'coherent',
    label: 'Coerente (5.5 - 5.5)',
    hint: '5,5 s di inspiro e 5,5 s di espiro, senza pause.',
    steps: [
      { phase: 'Inspira', ms: 5500, sunTarget: ZEN_SUN_MAX },
      { phase: 'Espira', ms: 5500, sunTarget: 1 },
    ],
  },
};

export const ZEN_SESSION_DURATION_OPTIONS = [
  { value: '1', label: '1 minuto', sec: 60 },
  { value: '3', label: '3 minuti', sec: 180 },
  { value: '5', label: '5 minuti', sec: 300 },
  { value: '10', label: '10 minuti', sec: 600 },
  { value: 'infinite', label: 'Infinito', sec: null },
];

export function getNeuralResetZenStep(patternId, phaseName) {
  return NEURAL_RESET_PATTERNS[patternId]?.steps.find((s) => s?.phase === phaseName);
}

export function getZenBreathAudioFade(phaseName, phaseMs) {
  if (phaseName === 'Inspira') return { target: 0.9, duration: Math.min(4000, phaseMs) };
  if (phaseName === 'Espira') return { target: 0.6, duration: Math.min(4000, phaseMs) };
  if (phaseName === 'Trattieni' || phaseName === 'Pausa') return { target: 0.02, duration: Math.min(3000, phaseMs) };
  return null;
}
