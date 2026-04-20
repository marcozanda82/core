export const MEALS = ['Colazione', 'Snack', 'Pranzo', 'Cena'];
export const MEAL_KEYS = ['colazione', 'snack', 'pranzo', 'cena'];

export const MACRO_KEYS = ['kcal', 'prot', 'carb', 'fat', 'fibre'];

export const SYNC_BAND = 10;      // ±10% = neon azzurro (in sync)
export const MODERATE_BAND = 25;  // fino ±25% = giallo
// >25% = rosso critico

export const COLORS = {
  sync: '#00ffcc',
  syncGlow: '0 0 12px #00ffcc, 0 0 24px rgba(0,255,204,0.5)',
  moderate: '#ffd54f',
  critical: '#ff5252',
  zeroLine: 'rgba(255,255,255,0.6)',
  background: '#121212',
};

export const MESSAGES = {
  inSync: ['Stai andando benissimo!', 'Ottimo ritmo oggi!', 'Sei in forma!'],
  moderate: ['Piccolo aggiustamento e sei a posto.', 'Quasi perfetto!'],
  critical: ['Riprendi il ritmo al prossimo pasto.', 'Ricalibra al prossimo pasto.'],
};
