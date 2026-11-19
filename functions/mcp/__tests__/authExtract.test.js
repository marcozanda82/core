import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMcpCredential } from '../auth.js';

test('extract: Bearer Authorization', () => {
  const out = extractMcpCredential({ authorization: 'Bearer abcdefghijklmnopqrstuvwxyz012345' });
  assert.equal(out.token, 'abcdefghijklmnopqrstuvwxyz012345');
  assert.equal(out.source, 'authorization_bearer');
});

test('extract: raw Authorization (Claude UI senza Bearer)', () => {
  const out = extractMcpCredential({ authorization: 'abcdefghijklmnopqrstuvwxyz0123456789AB' });
  assert.equal(out.token, 'abcdefghijklmnopqrstuvwxyz0123456789AB');
  assert.equal(out.source, 'authorization_raw');
});

test('extract: x-api-key grezzo', () => {
  const out = extractMcpCredential({ 'x-api-key': 'abcdefghijklmnopqrstuvwxyz0123456789AB' });
  assert.equal(out.source, 'x-api-key_raw');
  assert.ok(out.token);
});

test('extract: missing', () => {
  const out = extractMcpCredential({});
  assert.equal(out.token, null);
  assert.equal(out.reason, 'missing_credential');
});

test('extract: string shorthand', () => {
  const out = extractMcpCredential('Bearer tokentokentokentokentokentoken12');
  assert.equal(out.source, 'authorization_bearer');
});
