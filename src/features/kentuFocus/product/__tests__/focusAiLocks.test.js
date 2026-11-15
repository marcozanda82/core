/**
 * Lock mattino + circuit breaker (mock memory, nessuna rete / Gemini).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FORCE_CIRCUIT_WINDOW_MS,
  createMemoryFocusAiLockStore,
  forceCircuitDecision,
  morningLockDecision,
} from '../focusAiLocks.js';

describe('morningLockDecision', () => {
  it('parte se non c’è lock o dataVersion diversa', () => {
    assert.equal(morningLockDecision(null, 'dv1', '2026-11-15'), 'run');
    assert.equal(
      morningLockDecision({ dataVersion: 'old', status: 'done', on: '2026-11-14' }, 'dv1', '2026-11-15'),
      'run',
    );
  });

  it('salta done / failed stesso giorno / running stesso giorno', () => {
    assert.equal(
      morningLockDecision({ dataVersion: 'dv1', status: 'done', on: '2026-11-14' }, 'dv1', '2026-11-15'),
      'skip',
    );
    assert.equal(
      morningLockDecision({ dataVersion: 'dv1', status: 'failed', on: '2026-11-15' }, 'dv1', '2026-11-15'),
      'skip',
    );
    assert.equal(
      morningLockDecision({ dataVersion: 'dv1', status: 'running', on: '2026-11-15' }, 'dv1', '2026-11-15'),
      'skip',
    );
  });

  it('riprova un failed il giorno dopo', () => {
    assert.equal(
      morningLockDecision({ dataVersion: 'dv1', status: 'failed', on: '2026-11-14' }, 'dv1', '2026-11-15'),
      'run',
    );
  });
});

describe('forceCircuitDecision', () => {
  const now = 1_700_000_000_000;

  it('blocca un secondo force sulla stessa dataVersion entro un’ora', () => {
    assert.equal(
      forceCircuitDecision({ force: { dataVersion: 'dv1', at: now - 1000 } }, 'dv1', now),
      'block',
    );
  });

  it('permette dopo la finestra o con dataVersion diversa', () => {
    assert.equal(
      forceCircuitDecision(
        { force: { dataVersion: 'dv1', at: now - FORCE_CIRCUIT_WINDOW_MS - 1 } },
        'dv1',
        now,
      ),
      'allow',
    );
    assert.equal(
      forceCircuitDecision({ force: { dataVersion: 'dv1', at: now } }, 'dv2', now),
      'allow',
    );
  });
});

describe('createMemoryFocusAiLockStore', () => {
  it('claim mattino una sola volta per periodo+dataVersion', async () => {
    const store = createMemoryFocusAiLockStore();
    const a = await store.claimMorning({
      uid: 'u1',
      periodId: 'ieri',
      dataVersion: 'dv1',
      today: '2026-11-15',
    });
    const b = await store.claimMorning({
      uid: 'u1',
      periodId: 'ieri',
      dataVersion: 'dv1',
      today: '2026-11-15',
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, false);
    assert.equal(b.reason, 'locked');
  });

  it('circuit breaker: max 1 force / ora per dataVersion', async () => {
    const store = createMemoryFocusAiLockStore();
    const t0 = 1_700_000_000_000;
    const first = await store.claimForce({
      uid: 'u1',
      periodId: 'ieri',
      dataVersion: 'dv1',
      nowMs: t0,
    });
    const second = await store.claimForce({
      uid: 'u1',
      periodId: 'ieri',
      dataVersion: 'dv1',
      nowMs: t0 + 60_000,
    });
    const otherDv = await store.claimForce({
      uid: 'u1',
      periodId: 'ieri',
      dataVersion: 'dv2',
      nowMs: t0 + 60_000,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'circuit_open');
    assert.match(String(second.userMessage || ''), /un’ora|un'ora/i);
    assert.equal(otherDv.ok, true);
  });
});
