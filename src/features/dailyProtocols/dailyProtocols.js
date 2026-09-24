/** Protocolli Giornalieri — Architetto dello Stile di Vita. */

export const DAILY_PROTOCOL_STATUS = Object.freeze({
  PLANNING: 'planning',
  ACTIVE: 'active',
  COMPLETED: 'completed',
});

export const DAILY_PROTOCOLS = Object.freeze([
  {
    id: 'kentu',
    nome: 'Kentu (Longevità)',
    shortNome: 'Kentu',
    icona: '🌿',
    focus: 'Mantenimento, sensibilità insulinica, pulizia cellulare.',
  },
  {
    id: 'anabolico',
    nome: 'Anabolico',
    shortNome: 'Anabolico',
    icona: '💪',
    focus: 'Sintesi proteica, performance meccanica, ipertrofia.',
  },
  {
    id: 'deep_work',
    nome: 'Deep Work',
    shortNome: 'Deep Work',
    icona: '🧠',
    focus: 'Glicemia piatta, lucidità mentale prolungata.',
  },
  {
    id: 'reset',
    nome: 'Reset & Recovery',
    shortNome: 'Reset',
    icona: '🔋',
    focus: 'Gestione cortisolo, parasimpatico, sonno profondo.',
  },
]);

const PROTOCOL_BY_ID = Object.freeze(
  Object.fromEntries(DAILY_PROTOCOLS.map((item) => [item.id, item])),
);

export function getDailyProtocolDef(id) {
  const key = String(id || '').trim();
  return PROTOCOL_BY_ID[key] || null;
}

export function isDailyProtocolId(id) {
  return Boolean(getDailyProtocolDef(id));
}

export function getDailyProtocolShortName(id) {
  const def = getDailyProtocolDef(id);
  return String(def?.shortNome || def?.nome || '').trim();
}

export function buildDailyProtocolActivationUserText(id) {
  const shortNome = getDailyProtocolShortName(id) || 'Kentu';
  return `Attiviamo il Protocollo ${shortNome}`;
}

export const DAILY_PROTOCOL_ACK_TEXT = 'Ricevuto. Genero il piano della giornata...';

export function buildDailyProtocolSelectChips(intent = 'SELECT_DAILY_PROTOCOL') {
  return DAILY_PROTOCOLS.map((protocol, index) => ({
    label: `${protocol.icona} ${protocol.shortNome}`,
    intent,
    protocolId: protocol.id,
    variant: index === 0 ? 'primary' : 'default',
  }));
}
