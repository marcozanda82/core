/**
 * Albero concettuale del Centro Analisi — solo metadati UI.
 * Nessuna logica di calcolo o accesso al diario.
 */
export const CENTRO_ANALISI_AREAS = Object.freeze([
  {
    id: 'salute',
    icon: '🫀',
    label: 'Salute',
    kicker: 'Macro-area',
    hint: 'Clinica, recupero e metabolismo.',
    rooms: [
      { id: 'metabolismo', icon: '🔥', label: 'Metabolismo' },
      { id: 'sonno', icon: '🛌', label: 'Sonno' },
      { id: 'biometrie', icon: '⚖️', label: 'Biometrie' },
      { id: 'clinica', icon: '🩺', label: 'Clinica' },
    ],
  },
  {
    id: 'progressione',
    icon: '📈',
    label: 'Progressione',
    kicker: 'Macro-area',
    hint: 'Aderenza e adattamento nel tempo.',
    rooms: [
      { id: 'nutrizione', icon: '🍽', label: 'Nutrizione' },
      { id: 'allenamento', icon: '🏋️', label: 'Allenamento' },
      { id: 'recupero', icon: '🌙', label: 'Recupero' },
    ],
  },
  {
    id: 'strumentazione',
    icon: '🔭',
    label: 'Strumentazione',
    kicker: 'Strumenti',
    hint: 'Bussola, Mappa e Radar — cabina di pilotaggio.',
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
  return area.rooms.find((room) => room.id === roomId) || null;
}
