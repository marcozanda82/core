import { isDailyProtocolId } from './dailyProtocols';

/**
 * Timeline mock per i Protocolli Giornalieri.
 * Gli orari reali arriveranno dal motore; qui servono a validare la UI.
 */

export const PROTOCOL_TIMELINE_MOCK = Object.freeze({
  kentu: Object.freeze([
    { time: '07:30', title: 'Caffè amaro in digiuno', icon: '☕', kind: 'ritual' },
    { time: '12:30', title: 'Pranzo vegetale', icon: '🥗', kind: 'meal' },
    { time: '16:00', title: 'Camminata 20 min', icon: '🚶', kind: 'activity' },
    { time: '19:30', title: 'Cena leggera', icon: '🍽', kind: 'meal' },
    { time: '22:00', title: 'Wind-down / sonno', icon: '🌙', kind: 'recovery' },
  ]),
  anabolico: Object.freeze([
    { time: '08:00', title: 'Colazione Proteica', icon: '🍳', kind: 'meal' },
    { time: '13:00', title: 'Pranzo Bilanciato', icon: '🥩', kind: 'meal' },
    { time: '17:30', title: 'Pre-Workout Carbo', icon: '🍌', kind: 'meal' },
    { time: '18:30', title: 'Allenamento (Gambe)', icon: '🏋️', kind: 'activity' },
    { time: '20:30', title: 'Cena Ricarica Anabolica', icon: '🍽', kind: 'meal' },
  ]),
  deep_work: Object.freeze([
    { time: '07:30', title: 'Caffè + digiuno lucido', icon: '☕', kind: 'ritual' },
    { time: '09:00', title: 'Blocco Deep Work', icon: '🧠', kind: 'focus' },
    { time: '13:00', title: 'Pranzo a basso IG', icon: '🥗', kind: 'meal' },
    { time: '15:00', title: 'Secondo blocco focus', icon: '📚', kind: 'focus' },
    { time: '19:00', title: 'Cena semplice', icon: '🍽', kind: 'meal' },
  ]),
  reset: Object.freeze([
    { time: '08:30', title: 'Colazione calma', icon: '🍵', kind: 'meal' },
    { time: '12:00', title: 'Pranzo anti-infiammatorio', icon: '🥗', kind: 'meal' },
    { time: '15:30', title: 'Pausa parasimpatica', icon: '🧘', kind: 'recovery' },
    { time: '18:00', title: 'Mobilità (niente HIIT)', icon: '🤸', kind: 'activity' },
    { time: '21:00', title: 'Cena early + sonno', icon: '🌙', kind: 'recovery' },
  ]),
});

export function getProtocolTimelineMock(protocolId) {
  const id = isDailyProtocolId(protocolId) ? String(protocolId) : '';
  const rows = PROTOCOL_TIMELINE_MOCK[id];
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
}
