import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  fingerprintFocusDayContent,
  focusDayNeedsFreshCompute,
  peekFocusDayScoreLocalCache,
  readFocusDayScoreLocalCache,
  writeFocusDayScoreLocalCache,
} from '../focusDayScoreLocalCache.js';
import { SCORE_VERSION } from '../../score/scoreConfig.kds-3.js';

const UID = 'cache-test-uid';

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => { memory.set(k, String(v)); },
  removeItem: (k) => { memory.delete(k); },
};

describe('focusDayScoreLocalCache v2', () => {
  beforeEach(() => memory.clear());

  it('hit solo con stessa versione e contentHash', () => {
    const ctx = {
      today: '2026-11-14',
      fullHistory: {
        'trackerStorico_2026-11-12': { log: [{ type: 'food', kcal: 500 }] },
      },
      userTargets: { kcal: 2000 },
      cylinders: { forza: { enabled: false } },
      movementCheckins: {},
      records: {},
    };
    const hash = fingerprintFocusDayContent('2026-11-12', ctx);
    writeFocusDayScoreLocalCache(UID, '2026-11-12', {
      version: SCORE_VERSION,
      score: 0.7,
      reliability: 'high',
      dayStatus: 'closed',
    }, hash);

    assert.ok(peekFocusDayScoreLocalCache(UID, '2026-11-12', {
      version: SCORE_VERSION,
      contentHash: hash,
    }));
    assert.equal(peekFocusDayScoreLocalCache(UID, '2026-11-12', {
      version: SCORE_VERSION,
      contentHash: 'other',
    }), null);
  });

  it('oggi e ieri richiedono ricalcolo; futuri e chiusi no', () => {
    assert.equal(focusDayNeedsFreshCompute('2026-11-14', '2026-11-14'), true);
    assert.equal(focusDayNeedsFreshCompute('2026-11-13', '2026-11-14'), true);
    assert.equal(focusDayNeedsFreshCompute('2026-11-12', '2026-11-14'), false);
    assert.equal(focusDayNeedsFreshCompute('2026-11-15', '2026-11-14'), false);
  });

  it('cambia il pasto → contentHash diverso', () => {
    const base = {
      today: '2026-11-14',
      fullHistory: {
        'trackerStorico_2026-11-12': { log: [{ type: 'food', kcal: 500 }] },
      },
      userTargets: { kcal: 2000 },
      cylinders: { forza: { enabled: false } },
    };
    const a = fingerprintFocusDayContent('2026-11-12', base);
    const b = fingerprintFocusDayContent('2026-11-12', {
      ...base,
      fullHistory: {
        'trackerStorico_2026-11-12': { log: [{ type: 'food', kcal: 900 }] },
      },
    });
    assert.notEqual(a, b);
    assert.ok(Object.keys(readFocusDayScoreLocalCache(UID)).length === 0);
  });
});
