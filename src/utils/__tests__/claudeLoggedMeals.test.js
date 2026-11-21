import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClaudeReviewedAtPatches,
  countUnreadClaudeLoggedMeals,
  isClaudeLoggedMealEntry,
  isUnreadClaudeLoggedMeal,
  listUnreadClaudeMealIds,
  resolveClaudeMealId,
  claudeMealSlotFromId,
} from '../claudeLoggedMeals.js';

test('claude meal id / slot', () => {
  assert.equal(claudeMealSlotFromId('claude_pranzo_abcdef1234'), 'pranzo');
  assert.equal(resolveClaudeMealId({ mealId: 'claude_cena_xyz', source: 'claude' }), 'claude_cena_xyz');
  assert.equal(isClaudeLoggedMealEntry({ source: 'claude' }), true);
  assert.equal(isUnreadClaudeLoggedMeal({ source: 'claude', reviewedAt: null }), true);
  assert.equal(isUnreadClaudeLoggedMeal({ source: 'claude', reviewedAt: 1 }), false);
});

test('count + list unread unique meals', () => {
  const log = [
    { type: 'food', mealType: 'claude_pranzo_aaa', mealId: 'claude_pranzo_aaa', source: 'claude', reviewedAt: null, mealTime: 13 },
    { type: 'food', mealType: 'claude_pranzo_aaa', mealId: 'claude_pranzo_aaa', source: 'claude', reviewedAt: null, mealTime: 13 },
    { type: 'food', mealType: 'pranzo', source: 'ui', mealTime: 13 },
    { type: 'food', mealType: 'claude_cena_bbb', mealId: 'claude_cena_bbb', origin: 'claude', mealTime: 20 },
  ];
  assert.equal(countUnreadClaudeLoggedMeals(log), 2);
  assert.deepEqual(listUnreadClaudeMealIds(log).sort(), ['claude_cena_bbb', 'claude_pranzo_aaa']);
});

test('reviewedAt patches', () => {
  const patches = buildClaudeReviewedAtPatches(['claude_pranzo_aaa'], 1000);
  assert.deepEqual(patches, [{
    type: 'meal',
    mealId: 'claude_pranzo_aaa',
    reviewedAt: 1000,
  }]);
});
