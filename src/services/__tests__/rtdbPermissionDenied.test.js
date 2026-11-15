import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isRtdbPermissionDenied,
  reportRtdbPermissionDenied,
} from '../rtdbPermissionDenied.js';

test('isRtdbPermissionDenied riconosce code e message', () => {
  assert.equal(isRtdbPermissionDenied({ code: 'PERMISSION_DENIED' }), true);
  assert.equal(isRtdbPermissionDenied({ code: 'permission-denied' }), true);
  assert.equal(isRtdbPermissionDenied(new Error('PERMISSION_DENIED at /users/x')), true);
  assert.equal(isRtdbPermissionDenied({ code: 'unavailable' }), false);
});

test('reportRtdbPermissionDenied ignora errori non permission', async () => {
  const logged = await reportRtdbPermissionDenied(new Error('network'), {
    path: 'users/x/y',
  });
  assert.equal(logged, false);
});
