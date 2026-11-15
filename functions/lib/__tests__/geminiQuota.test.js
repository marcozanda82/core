/**
 * Quota callGemini — mock in-memory, nessuna rete / chiave Gemini.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  MAX_CALLS_PER_DAY,
  MAX_FOCUS_AI_COACH_PER_DAY,
  QUOTA_FOCUS_IT,
  QUOTA_TOTAL_IT,
  CALL_TAG_REQUIRED_IT,
  normalizeCallTag,
  quotaDecision,
  truncatedUidHash,
  consumeGeminiQuota,
} = require('../geminiQuota');

function createMockDb(seed = {}) {
  const data = { ...seed };
  return {
    ref(path) {
      return {
        async transaction(updateFn) {
          const current = data[path] ?? null;
          const next = updateFn(current);
          if (next === undefined) {
            return { committed: false, snapshot: { val: () => current } };
          }
          data[path] = next;
          return { committed: true, snapshot: { val: () => next } };
        },
      };
    },
    __data: data,
  };
}

describe('normalizeCallTag', () => {
  it('richiede callTag', () => {
    assert.equal(normalizeCallTag(null).ok, false);
    assert.equal(normalizeCallTag('').ok, false);
    assert.equal(normalizeCallTag('  ').ok, false);
    assert.equal(normalizeCallTag(null).message, CALL_TAG_REQUIRED_IT);
  });

  it('tronca a 64', () => {
    const long = 'x'.repeat(80);
    const n = normalizeCallTag(long);
    assert.equal(n.ok, true);
    assert.equal(n.callTag.length, 64);
  });
});

describe('truncatedUidHash', () => {
  it('è deterministico e troncato', () => {
    const a = truncatedUidHash('uid-abc');
    const b = truncatedUidHash('uid-abc');
    assert.equal(a, b);
    assert.equal(a.length, 12);
    assert.notEqual(a, 'uid-abc');
  });
});

describe('quotaDecision', () => {
  it('blocca oltre 40 totali', () => {
    const d = quotaDecision({ total: MAX_CALLS_PER_DAY, byTag: {} }, 'chat_structured');
    assert.equal(d.ok, false);
    assert.equal(d.reason, 'quota_total');
    assert.equal(d.message, QUOTA_TOTAL_IT);
  });

  it('blocca oltre 6 focus_ai_coach', () => {
    const d = quotaDecision(
      { total: 10, byTag: { focus_ai_coach: MAX_FOCUS_AI_COACH_PER_DAY } },
      'focus_ai_coach',
    );
    assert.equal(d.ok, false);
    assert.equal(d.reason, 'quota_focus');
    assert.equal(d.message, QUOTA_FOCUS_IT);
  });

  it('permette altri tag anche con focus al limite', () => {
    const d = quotaDecision(
      { total: 10, byTag: { focus_ai_coach: MAX_FOCUS_AI_COACH_PER_DAY } },
      'chat_structured',
    );
    assert.equal(d.ok, true);
  });
});

describe('consumeGeminiQuota (mock db)', () => {
  it('incrementa e rifiuta al sesto focus', async () => {
    const db = createMockDb();
    const uid = 'quota-uid';
    for (let i = 0; i < MAX_FOCUS_AI_COACH_PER_DAY; i += 1) {
      const r = await consumeGeminiQuota({ db, uid, callTag: 'focus_ai_coach' });
      assert.equal(r.ok, true, `call ${i + 1}`);
    }
    const blocked = await consumeGeminiQuota({ db, uid, callTag: 'focus_ai_coach' });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'quota_focus');
    assert.equal(blocked.message, QUOTA_FOCUS_IT);
  });

  it('rifiuta al 41° totale', async () => {
    const db = createMockDb();
    const uid = 'quota-uid-total';
    for (let i = 0; i < MAX_CALLS_PER_DAY; i += 1) {
      const r = await consumeGeminiQuota({ db, uid, callTag: 'chat_structured' });
      assert.equal(r.ok, true);
    }
    const blocked = await consumeGeminiQuota({ db, uid, callTag: 'chat_structured' });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'quota_total');
    assert.equal(blocked.message, QUOTA_TOTAL_IT);
  });
});
