/**
 * Helper UI per popup alcol (icone e porzioni base).
 */

export function getAlcoholGlassIcon(type) {
  return type === 'birra' ? '🍺' : type === 'vino' ? '🍷' : '🥃';
}

export function getAlcoholBaseMl(type) {
  return type === 'birra' ? 330 : type === 'vino' ? 150 : 40;
}
