/**
 * Prova tools/list su kentuMcp produzione con gettone temporaneo (CLI Firebase + fetch).
 * Non stampa il gettone. Uso: node scripts/probeMcpToolsList.mjs
 */
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'mio-tracker';
const MCP_URL = `https://europe-west1-${PROJECT}.cloudfunctions.net/kentuMcp`;
const PROBE_UID = 'mcp_tools_list_probe';

function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function generateMcpToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

function fb(args) {
  const firebaseJs = join(
    process.env.APPDATA || '',
    'npm',
    'node_modules',
    'firebase-tools',
    'lib',
    'bin',
    'firebase.js',
  );
  const r = spawnSync(process.execPath, [firebaseJs, ...args, '--project', PROJECT], {
    encoding: 'utf8',
    shell: false,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`firebase ${args[0]} failed: ${(r.stderr || r.stdout || '').slice(0, 500)}`);
  }
  return r.stdout || '';
}

function databaseSet(path, value) {
  const file = join(tmpdir(), `kentu-mcp-probe-${Date.now()}-${randomBytes(3).toString('hex')}.json`);
  writeFileSync(file, JSON.stringify(value), 'utf8');
  try {
    fb(['database:set', path, file, '-f']);
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}

function databaseRemove(path) {
  fb(['database:remove', path, '-f']);
}

async function mcpPost(token, body, extraHeaders = {}) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* SSE or other */ }
  return { status: res.status, json, text: text.slice(0, 2500), headers: Object.fromEntries(res.headers) };
}

function toolNames(json) {
  const tools = json?.result?.tools || json?.tools || [];
  return tools.map((t) => t?.name).filter(Boolean).sort();
}

const { token, hash } = generateMcpToken();
const tokenId = `t_probe_${Date.now().toString(36)}_${hash.slice(0, 8)}`;
const now = Date.now();

const tokenRecord = {
  hash,
  createdAt: now,
  lastUsedAt: null,
  revoked: false,
  hourBucket: null,
  requestCountHour: 0,
  scopes: ['read', 'drafts:write'],
};

try {
  databaseSet(`/users/${PROBE_UID}/mcp_tokens/${tokenId}`, tokenRecord);
  databaseSet(`/mcp_token_lookup/${hash}`, { uid: PROBE_UID, tokenId });

  const init = await mcpPost(token, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'kentu-probe', version: '1.0.0' },
    },
  });

  const sessionHeader = {};
  const sid = init.headers?.['mcp-session-id'] || init.headers?.['Mcp-Session-Id'];
  if (sid) sessionHeader['Mcp-Session-Id'] = sid;

  // Some transports want notifications/initialized before tools/list
  await mcpPost(token, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }, sessionHeader).catch(() => {});

  const listed = await mcpPost(token, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  }, sessionHeader);

  const names = toolNames(listed.json);
  const out = {
    ok: listed.status < 400 && names.length > 0,
    initStatus: init.status,
    listStatus: listed.status,
    toolCount: names.length,
    tools: names,
    hasDraftTools: {
      create: names.includes('kentu_create_meal_draft'),
      list: names.includes('kentu_list_drafts'),
      delete: names.includes('kentu_delete_draft'),
    },
    probeTokenId: tokenId,
    // body preview only if failed (no secrets)
    listPreview: names.length ? undefined : String(listed.text || '').slice(0, 500),
  };
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    error: String(error?.message || error).slice(0, 400),
  }, null, 2));
  process.exitCode = 1;
} finally {
  try { databaseRemove(`/users/${PROBE_UID}/mcp_tokens/${tokenId}`); } catch { /* ignore */ }
  try { databaseRemove(`/mcp_token_lookup/${hash}`); } catch { /* ignore */ }
}
