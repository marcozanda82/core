/**
 * Albero concettuale del Centro Analisi — solo metadati UI.
 * Progressione apre la Fotografia Home. Timeline e Strumenti sono tab principali.
 * Strumentazione resta a stanze interne.
 */
export const CENTRO_ANALISI_AREAS = Object.freeze([
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
    label: 'Strumenti',
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
    id: 'calibrazione_target',
    icon: '⚡',
    label: 'Calibrazione Target & Bilancio',
    kicker: 'Pilota energetico',
    hint: 'Regola deficit, surplus, autopilota e recupero del debito calorico.',
    opensFotografia: null,
    opensCalibrazione: true,
    rooms: [],
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
