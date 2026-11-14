import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_NOTIFICATION_TEXT,
  WEEK_NOTIFICATION_TEXT,
  autoGenerationDecision,
  autoGenerationKey,
  isFirstOpenOfDay,
  morningNotification,
  notificationClock,
  periodsToGenerate,
  shouldSendNotification,
} from '../morningFocus.js';

describe('prima apertura della giornata', () => {
  it('è la prima solo se quel giorno non è già stato aperto', () => {
    assert.equal(isFirstOpenOfDay(null, '2026-11-12'), true);
    assert.equal(isFirstOpenOfDay('2026-11-11', '2026-11-12'), true);
    assert.equal(isFirstOpenOfDay('2026-11-12', '2026-11-12'), false);
  });
});

describe('periodi da generare', () => {
  it('un giorno normale prepara solo ieri', () => {
    assert.deepEqual(periodsToGenerate('2026-11-12'), ['ieri']);
    assert.equal(morningNotification('2026-11-12').periodId, 'ieri');
    assert.equal(morningNotification('2026-11-12').text, DAY_NOTIFICATION_TEXT);
  });

  it('il lunedì prepara anche la settimana appena conclusa', () => {
    assert.equal(new Date('2026-11-09T12:00:00').getDay(), 1);
    assert.deepEqual(periodsToGenerate('2026-11-09'), ['ieri', 'settimana']);
    assert.equal(morningNotification('2026-11-09').text, WEEK_NOTIFICATION_TEXT);
    assert.equal(morningNotification('2026-11-09').periodId, 'settimana');
  });

  it('il primo del mese prepara anche il mese appena concluso', () => {
    assert.deepEqual(periodsToGenerate('2026-11-01'), ['ieri', 'mese']);
    assert.equal(morningNotification('2026-11-01').text, 'Ecco com\'è andato ottobre');
    assert.equal(morningNotification('2026-11-01').periodId, 'mese');
  });

  it('il primo del mese che cade di lunedì prepara giorno, settimana e mese', () => {
    assert.equal(new Date('2026-06-01T12:00:00').getDay(), 1);
    assert.deepEqual(periodsToGenerate('2026-06-01'), ['ieri', 'settimana', 'mese']);
    assert.equal(morningNotification('2026-06-01').periodId, 'mese');
    assert.equal(morningNotification('2026-06-01').text, 'Ecco com\'è andato maggio');
  });
});

describe('una sola generazione automatica', () => {
  const key = autoGenerationKey('ieri', 'dv-1');

  it('parte se quel periodo e quella dataVersion non sono ancora stati tentati', () => {
    assert.equal(autoGenerationDecision({ auto: {} }, key, '2026-11-12'), 'run');
  });

  it('non ripete una generazione già riuscita', () => {
    const record = { auto: { [key]: { status: 'done', on: '2026-11-11' } } };
    assert.equal(autoGenerationDecision(record, key, '2026-11-12'), 'skip');
  });

  it('non riprova un fallimento nello stesso giorno', () => {
    const record = { auto: { [key]: { status: 'failed', on: '2026-11-12' } } };
    assert.equal(autoGenerationDecision(record, key, '2026-11-12'), 'skip');
  });

  it('riprova un fallimento alla prima apertura di un giorno successivo', () => {
    const record = { auto: { [key]: { status: 'failed', on: '2026-11-11' } } };
    assert.equal(autoGenerationDecision(record, key, '2026-11-12'), 'run');
  });
});

describe('orario della notifica', () => {
  it('senza risvegli registrati è le 8:00', () => {
    assert.equal(notificationClock({ wakeHours: [] }), '08:00');
  });

  it('è 30 minuti dopo la mediana degli ultimi risvegli', () => {
    assert.equal(notificationClock({ wakeHours: [7, 8, 9] }), '08:30');
    assert.equal(notificationClock({ wakeHours: [6.5, 7.5] }), '07:30');
  });

  it('l’orario scelto in Impostazioni sostituisce la mediana', () => {
    assert.equal(notificationClock({ wakeHours: [7], override: '09:15' }), '09:15');
  });

  it('non parte se è spenta o se il Focus è già stato aperto quel giorno', () => {
    assert.equal(shouldSendNotification({ enabled: false, today: '2026-11-12' }), false);
    assert.equal(shouldSendNotification({
      enabled: true,
      focusOpenedOn: '2026-11-12',
      today: '2026-11-12',
    }), false);
    assert.equal(shouldSendNotification({
      enabled: true,
      focusOpenedOn: '2026-11-11',
      today: '2026-11-12',
    }), true);
  });
});
