/**
 * Albero concettuale del Centro Analisi — solo metadati UI.
 * Salute / Progressione aprono la Fotografia Home (`opensFotografia`).
 * Strumentazione resta a stanze interne.
 */
export const CENTRO_ANALISI_AREAS = Object.freeze([
  {
    id: 'salute',
    icon: '🫀',
    label: 'Salute & Longevità',
    kicker: 'Fotografia',
    hint: 'Pagella metabolica a 4 pilastri, trend 14gg e parametri corporei.',
    opensFotografia: 'salute',
    rooms: [],
  },
  {
    id: 'progressione',
    icon: '📈',
    label: 'Progressione',
    kicker: 'Fotografia',
    hint: 'Aderenza calorica, bilancio macro e trend di ricomposizione.',
    opensFotografia: 'progressione',
    rooms: [],
  },
  {
    id: 'strumentazione',
    icon: '🔭',
    label: 'Strumentazione',
    kicker: 'Strumenti',
    hint: 'Bussola, Radar e Mappa di stato in tempo reale.',
    opensFotografia: null,
    rooms: [
      { id: 'bussola', icon: '🧭', label: 'Bussola' },
      { id: 'mappa', icon: '🗺️', label: 'Mappa' },
      { id: 'radar', icon: '🕸️', label: 'Radar' },
    ],
  },
  {
    id: 'timeline_metabolica',
    icon: '⏱️',
    label: 'Timeline Metabolica 24h',
    kicker: '24 ore',
    hint: 'Andamento continuo, digestione, assorbimento e finestre di digiuno.',
    opensFotografia: null,
    opensTimeline: true,
    rooms: [],
  },
]);

export function findCentroAnalisiArea(areaId) {
  return CENTRO_ANALISI_AREAS.find((area) => area.id === areaId) || null;
}

export function findCentroAnalisiRoom(areaId, roomId) {
  const area = findCentroAnalisiArea(areaId);
  if (!area) return null;
  return (area.rooms || []).find((room) => room.id === roomId) || null;
}
