/**
 * Ranking search per usageCount (più usato prima).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { rankSearchResultsByRecentUsage } from '../habits.js';

test('rankSearchResultsByRecentUsage: più usato prima, anche se match meno exact', () => {
  const scores = new Map([
    ['pane_semi', { usageCount: 12, score: 1200 }],
    ['food_pane_semplice', { usageCount: 2, score: 200 }],
  ]);
  const ranked = rankSearchResultsByRecentUsage(
    [
      { id: 'food_pane_semplice', name: 'Pane integrale', matchQuality: 'exact' },
      { id: 'pane_semi', name: 'Pane integrale con semi e noci', matchQuality: 'contains' },
      { id: 'altro', name: 'Pane bianco', matchQuality: 'fuzzy' },
    ],
    scores,
  );
  assert.equal(ranked[0].id, 'pane_semi');
  assert.equal(ranked[0].usageCount, 12);
  assert.equal(ranked[1].id, 'food_pane_semplice');
  assert.equal(ranked[1].usageCount, 2);
  assert.equal(ranked[2].usageCount, 0);
});
