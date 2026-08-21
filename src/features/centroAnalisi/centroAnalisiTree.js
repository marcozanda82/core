/**
 * Albero concettuale del Centro Analisi — solo metadati UI.
 * Salute / Progressione aprono la Fotografia Home (`opensFotografia`).
 * Strumentazione resta a stanze interne.
 */
export const CENTRO_ANALISI_AREAS = Object.freeze([
  {
    id: 'salute',
    icon: '🫀',
    label: 'Salute',
    kicker: 'Fotografia',
    hint: 'Stessa vista intera dei widget Home.',
    opensFotografia: 'salute',
    rooms: [],
  },
  {
    id: 'progressione',
    icon: '📈',
    label: 'Progressione',
    kicker: 'Fotografia',
    hint: 'Stessa vista intera dei widget Home.',
    opensFotografia: 'progressione',
    rooms: [],
  },
  {
    id: 'strumentazione',
    icon: '🔭',
    label: 'Strumentazione',
    kicker: 'Strumenti',
    hint: 'Bussola, Mappa e Radar — cabina di pilotaggio.',
    opensFotografia: null,
    rooms: [
      { id: 'bussola', icon: '🧭', label: 'Bussola' },
      { id: 'mappa', icon: '🗺️', label: 'Mappa' },
      { id: 'radar', icon: '🕸️', label: 'Radar' },
    ],
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
