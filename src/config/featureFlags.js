/**
 * Superfici legacy. Spente di default, anche in produzione:
 * in sviluppo si riaccendono solo con VITE_FF_*=1.
 * Il codice resta nel progetto.
 */
const env = import.meta.env ?? {};

function legacyOn(name) {
  if (env.PROD) return false;
  return env[name] === '1';
}

export const featureFlags = Object.freeze({
  /** Chat: Focus Metabolico / clinicalInsightCoach. */
  metabolicFocusChat: legacyOn('VITE_FF_METABOLIC_FOCUS'),
  /** Bollettino Health Analyzer in Salute. La classificazione novaScore resta attiva. */
  healthAnalyzerBulletin: legacyOn('VITE_FF_HEALTH_BULLETIN'),
  /** Report di periodo dalla Pulsantiera ALL. */
  periodReport: legacyOn('VITE_FF_PERIOD_REPORT'),
  /** Longevity, GhostModeDashboard, tab longevita e storico a 120 giorni. */
  longevityDashboard: legacyOn('VITE_FF_LONGEVITY'),
  /** Edizioni server kentu_focus/editions e blocco demo editoriale. */
  focusServerEditions: legacyOn('VITE_FF_FOCUS_EDITIONS'),
  /** Route /planner. */
  legacyPlanner: legacyOn('VITE_FF_LEGACY_PLANNER'),
  /** Route /consulto. */
  consultoPreview: legacyOn('VITE_FF_CONSULTO'),
  /** Arco del punteggio di longevità nell'intestazione della Home. Spento. */
  homeLongevityArc: legacyOn('VITE_FF_HOME_LONGEVITY_ARC'),
});
