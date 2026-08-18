/** Tab principali per swipe laterale (stesso ordine della bottom navigation). */
export const MAIN_BOTTOM_TAB_ORDER = ['oggi', 'analisi', 'bussola'];

/** Tab bottom bar persistibili in localStorage (Menu apre un drawer, non una tab). */
export const PERSISTED_BOTTOM_TAB_IDS = [...MAIN_BOTTOM_TAB_ORDER];

/** Voci barra inferiore Arc Reactor (Kentu centrale è gestito a parte in BottomChrome).
 *  Layout: Oggi | Timeline | [Emblema] | Analisi | Menu (ex slot Piano). */
export const BOTTOM_NAV_ITEMS = [
  { id: 'oggi', label: 'Oggi', icon: '🏠' },
  { id: 'analisi', label: 'Timeline', icon: '🕒' },
  { id: 'bussola', label: 'Analisi', icon: '📊' },
  { id: 'menu', label: 'Menu', icon: '☰' },
];

export const ACTIVE_BOTTOM_TAB_LS_KEY = 'kentu_active_bottom_tab';
/** Emisfero attivo nella Fotografia (SnapshotHub): progressione | salute. */
export const TREND_HUB_HEMISPHERE_LS_KEY = 'kentu_trend_hemisphere';
export const TREND_HUB_HEMISPHERES = Object.freeze(['progressione', 'salute']);
export const DEFAULT_TREND_HUB_HEMISPHERE = 'progressione';
/** Ultimo tool Storico (COMPASS | RADAR | MAP). DIAG è migrato in SnapshotHub. */
export const TREND_ACTIVE_TOOL_LS_KEY = 'kentu_active_trend_tool';
export const TREND_PROGRESSIONE_TOOLS = Object.freeze(['COMPASS', 'RADAR', 'MAP']);
export const DEFAULT_TREND_PROGRESSIONE_TOOL = 'COMPASS';
export const EVENT_USAGE_LS_KEY = 'kentu_event_usage';

/** Contatori uso voci «Aggiungi evento» (chiavi = id menu). */
export const EVENT_USAGE_DEFAULT = {
  meal: 0,
  water: 0,
  workout: 0,
  weight: 0,
  stimulant: 0,
  nap: 0,
  meditation: 0,
  alcohol: 0,
  supplements: 0,
  plan: 0,
};

/** Alias legacy → id canoniche (migrazione localStorage). */
export const EVENT_USAGE_LEGACY_ALIASES = {
  pasto: 'meal',
  acqua: 'water',
  allenamento: 'workout',
};

export const MANUAL_TARGET_EDIT_EXCLUDED_KEYS = new Set(['autoCalculated', 'targetHistory']);

/** Movimento prima del long-press su nodo timeline: oltre soglia → annulla drag e lascia swipe/scroll. */
export const NODE_DRAG_ARM_CANCEL_MOVE_PX = 6;

export const AI_MEAL_CONSTRAINTS_MAX_ITEMS = 20;

export const FIREBASE_LOAD_OVERLAY_FADE_MS = 800;

/** Riferimenti stabili per chart vuoto / notte in sospeso (evita ricalcoli longevity ad ogni render).
 *  Mai []: Recharts non disegna nulla senza asse 0–24. Baseline circadiana minimale. */
function buildStaticBaselinePhysiologyChartData(wakeHour = 7.5) {
  const wake = Number.isFinite(Number(wakeHour)) ? Number(wakeHour) : 7.5;
  const out = [];
  for (let h = 0; h <= 24; h++) {
    let cortisolo;
    if (h < wake) {
      cortisolo = 25 + (h / Math.max(0.1, wake)) * (58 - 25);
    } else if (h <= wake + 1) {
      cortisolo = 58 + ((h - wake) / 1) * (100 - 58);
    } else if (h <= wake + 1.5) {
      cortisolo = 100 - ((h - wake - 1) / 0.5) * 20;
    } else if (h < 18) {
      const t0 = wake + 1.5;
      cortisolo = 80 - ((h - t0) / Math.max(0.1, 18 - t0)) * 40;
    } else {
      cortisolo = Math.max(40, 50 - (h - 18) * (10 / 6));
    }
    out.push({
      time: h,
      hour: h,
      energy: 35,
      idealEnergy: 70,
      glicemia: 85,
      idratazione: 100,
      cortisolo: Number.isFinite(cortisolo) ? cortisolo : 25,
      digestione: 0,
      neuro: 40,
    });
  }
  return out;
}

export const EMPTY_ENERGY_CHART_DATA = buildStaticBaselinePhysiologyChartData(7.5);

/** Copia mutabile 0–24h per Recharts (non riusare lo stesso array frozen/condiviso). */
export function createEmptyEnergyChartData(wakeHour = 7.5) {
  return buildStaticBaselinePhysiologyChartData(wakeHour);
}

export const LONGEVITY_NIGHT_PENDING_ENERGY_SIM = Object.freeze({
  chartData: EMPTY_ENERGY_CHART_DATA,
  realTotals: {},
  hasCrashRisk: false,
  hasCortisolRisk: false,
  hasDigestionRisk: false,
  nervousSystemLoad: 0,
  isWaterHydrationAutoPilot: true,
  accumuloSNC: 0,
  maxEnergyCap: 100,
});

export const ADD_MENU_ORDER_LS_KEY = 'kentu_add_menu_order';

/** Debounce conferma pasti (wizard / piano giornaliero): evita doppio insert su click rapidi. */
export const MEAL_CONFIRM_DEBOUNCE_MS = 900;

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
