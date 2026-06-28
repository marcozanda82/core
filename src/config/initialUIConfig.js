/**
 * Configurazione UI iniziale della Home / dashboard.
 * Base per la futura Modalità Sviluppatore (override runtime via UIConfigProvider).
 */
export const initialUIConfig = {
  version: 1,

  home: {
    /** 'pro' = cruscotto energetico + timeline; 'base' deprecato */
    dashboardVariant: 'pro',
    showEnergyDashboard: true,
    showTimeline: true,
    showDailyIndicatorsBar: true,
    showMesocycleRadar: true,
    showLongevityInsightLine: true,
    dashboardMinHeight: 0,
    dashboardBorderRadius: 16,
    dashboardPadding: 'max(10px, 1.5vh) 12px',
    dashboardBoxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },

  header: {
    badgePosition: 'right',
    showMetabolicBadge: true,
    showWeeklyMetabolicIndicator: true,
    showSncStressButton: true,
  },

  theme: {
    primaryColor: '#00e5ff',
    dashboardBackground: '#0a0a0a',
    dashboardBorderColor: '#1a1a1a',
  },

  developer: {
    enabled: false,
    configSource: 'initial',
    showDebugOverlays: false,
  },
};

export default initialUIConfig;
