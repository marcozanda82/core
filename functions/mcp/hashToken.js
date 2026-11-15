import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

export function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

/** @returns {{ token: string, hash: string }} */
export function generateMcpToken() {
  const raw = randomBytes(TOKEN_BYTES);
  const token = raw.toString('base64url');
  return { token, hash: sha256Hex(token) };
}
