import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRouteFabVoiceToChat } from '../fabVoiceRouting.js';

const isWorkout = (t) => /\bho\s+fatto\b.*\b(allenamento|workout|gambe)\b/i.test(t);
const isAdvice = (t) => /\b(?:cosa|che)\s+mangio\b/i.test(t);

test('FAB escape: workout e consiglio vanno in chat, pasto concreto no', () => {
  assert.equal(
    shouldRouteFabVoiceToChat('ho fatto allenamento gambe', { isWorkout, isAdvice }),
    true,
  );
  assert.equal(
    shouldRouteFabVoiceToChat('cosa mangio a cena?', { isWorkout, isAdvice }),
    true,
  );
  assert.equal(
    shouldRouteFabVoiceToChat('pasta integrale 80g e pollo 150g', { isWorkout, isAdvice }),
    false,
  );
});

test('FAB escape: 0 food riconosciuti → chat (fallback)', () => {
  assert.equal(
    shouldRouteFabVoiceToChat('ho corso 30 minuti', { foodItemCount: 0, isWorkout, isAdvice }),
    true,
  );
  assert.equal(
    shouldRouteFabVoiceToChat('pasta 80g', { foodItemCount: 1, isWorkout, isAdvice }),
    false,
  );
});
