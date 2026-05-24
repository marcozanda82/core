/** Tab principali per swipe laterale (stesso ordine della bottom navigation, senza «Menu»). */
export const MAIN_BOTTOM_TAB_ORDER = ['oggi', 'analisi', 'bussola', 'longevita'];

/** Voci barra inferiore (sempre tutte visibili; non condizionare al caricamento dati). */
export const BOTTOM_NAV_ITEMS = [
  { id: 'oggi', label: 'Oggi', icon: '🏠' },
  { id: 'analisi', label: 'Timeline', icon: '🕒' },
  { id: 'bussola', label: 'Motore', icon: '❤️' },
  { id: 'longevita', label: 'Progressi', icon: '📈' },
  { id: 'menu', label: 'Menu', icon: '≡' },
];

export const ACTIVE_BOTTOM_TAB_LS_KEY = 'kentu_active_bottom_tab';
export const AI_COACH_DISMISSED_INSIGHTS_LS_KEY = 'kentu_ai_coach_dismissed_insights_v1';
export const EVENT_USAGE_LS_KEY = 'kentu_event_usage';

export const EVENT_USAGE_DEFAULT = {
  pasto: 0,
  allenamento: 0,
  acqua: 0,
  nap: 0,
  supplements: 0,
};

export const MANUAL_TARGET_EDIT_EXCLUDED_KEYS = new Set(['autoCalculated', 'targetHistory']);

/** Movimento prima del long-press su nodo timeline: oltre soglia → annulla drag e lascia swipe/scroll. */
export const NODE_DRAG_ARM_CANCEL_MOVE_PX = 6;

export const AI_MEAL_CONSTRAINTS_MAX_ITEMS = 20;

export const FIREBASE_LOAD_OVERLAY_FADE_MS = 800;

/** Riferimenti stabili per chart vuoto / notte in sospeso (evita ricalcoli longevity ad ogni render). */
export const EMPTY_ENERGY_CHART_DATA = [];

export const LONGEVITY_NIGHT_PENDING_ENERGY_SIM = {
  chartData: EMPTY_ENERGY_CHART_DATA,
  realTotals: {},
  hasCrashRisk: false,
  hasCortisolRisk: false,
  hasDigestionRisk: false,
  nervousSystemLoad: 0,
};

export const ADD_MENU_ORDER_LS_KEY = 'kentu_add_menu_order';

/** Debounce conferma pasti (wizard / piano giornaliero): evita doppio insert su click rapidi. */
export const MEAL_CONFIRM_DEBOUNCE_MS = 900;

export const AI_COACH_EVAL_INACTIVE = Object.freeze({ suggestion: null, state: null, period: null });
export const AI_COACH_EMPTY_HISTORY = Object.freeze([]);

/** Chiavi nutrienti tabella report carenze (allineate a `userTargets` / `getTargetForNutrient`). */
export const REPORT_NUTRIENT_KEYS = [
  'kcal',
  'prot',
  'carb',
  'fatTotal',
  'fibre',
  'vitc',
  'vitD',
  'omega3',
  'mg',
  'k',
  'fe',
  'ca',
];

export const REPORT_NUTRIENT_LABELS_IT = {
  kcal: 'Kcal',
  prot: 'Proteine (g)',
  carb: 'Carboidrati (g)',
  fatTotal: 'Grassi (g)',
  fibre: 'Fibre (g)',
  vitc: 'Vit. C (mg)',
  vitD: 'Vit. D (µg)',
  omega3: 'Omega 3 (g)',
  mg: 'Magnesio (mg)',
  k: 'Potassio (mg)',
  fe: 'Ferro (mg)',
  ca: 'Calcio (mg)',
};
