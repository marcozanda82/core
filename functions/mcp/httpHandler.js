import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { resolveMcpBearer, uidLogTag } from './auth.js';
import { createKentuMcpServer } from './createServer.js';

function denyCors(res) {
  // Nessun Allow-Origin: Claude chiama server-side; non blocchiamo Origin in ingresso.
  res.setHeader('Vary', 'Origin');
  res.removeHeader('Access-Control-Allow-Origin');
}

function jsonRpcError(res, status, code, message) {
  if (res.headersSent) return;
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

function requestPath(req) {
  try {
    return String(req.path || req.url || '/').split('?')[0];
  } catch {
    return '/';
  }
}

function parseBody(raw) {
  if (raw == null || raw === '') return undefined;
  if (Buffer.isBuffer(raw)) {
    const text = raw.toString('utf8').trim();
    if (!text) return undefined;
    return JSON.parse(text);
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return undefined;
    return JSON.parse(text);
  }
  return raw;
}

/**
 * Handler HTTP Streamable MCP (stateless).
 * GET → 405 (niente SSE standalone su Cloud Functions).
 * POST → auth Bearer / x-api-key / x-auth-token obbligatoria.
 * @param {import('firebase-functions/v1').Request} req
 * @param {import('firebase-functions/v1').Response} res
 * @param {{ db: import('firebase-admin/database').Database }} deps
 */
export async function handleKentuMcpHttp(req, res, { db }) {
  const t0 = Date.now();
  const method = String(req.method || 'GET').toUpperCase();
  const path = requestPath(req);
  denyCors(res);

  if (method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(204).end();
    return;
  }

  // Stateless su Cloud Functions: niente stream SSE GET. 405 senza auth,
  // così i probe di Claude non diventano 401/OAuth spurî.
  if (method === 'GET') {
    console.info('[kentuMcp]', JSON.stringify({
      method,
      path,
      status: 405,
      ms: Date.now() - t0,
      reason: 'sse_not_supported',
    }));
    res.setHeader('Allow', 'POST, OPTIONS');
    jsonRpcError(res, 405, -32000, 'Method Not Allowed');
    return;
  }

  if (method !== 'POST') {
    console.info('[kentuMcp]', JSON.stringify({
      method,
      path,
      status: 405,
      ms: Date.now() - t0,
      reason: 'method_not_allowed',
    }));
    res.setHeader('Allow', 'POST, OPTIONS');
    jsonRpcError(res, 405, -32000, 'Method Not Allowed');
    return;
  }

  // Mai accettare il gettone in query string
  if (req.query && (req.query.token || req.query.access_token || req.query.key)) {
    jsonRpcError(res, 400, -32600, 'Il gettone non può essere passato in query string');
    return;
  }

  let auth;
  try {
    auth = await resolveMcpBearer(db, req.headers);
  } catch (error) {
    const status = error?.code === 'rate_limited' ? 429 : 401;
    console.info('[kentuMcp]', JSON.stringify({
      method,
      path,
      status,
      ms: Date.now() - t0,
      reason: error?.reason || error?.code || 'unauthorized',
    }));
    jsonRpcError(res, status, -32001, error?.message || 'Non autorizzato');
    return;
  }

  let parsedBody;
  try {
    parsedBody = parseBody(req.body);
  } catch {
    console.info('[kentuMcp]', JSON.stringify({
      method,
      path,
      status: 400,
      ms: Date.now() - t0,
      reason: 'invalid_json_body',
      uid: uidLogTag(auth.uid),
    }));
    jsonRpcError(res, 400, -32700, 'Parse error');
    return;
  }

  const server = createKentuMcpServer({
    uid: auth.uid,
    db,
    tokenId: auth.tokenId,
    scopes: auth.scopes,
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // JSON response mode: adatto a Cloud Functions (niente SSE lungo).
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
    console.info('[kentuMcp]', JSON.stringify({
      uid: uidLogTag(auth.uid),
      method,
      path,
      status: res.statusCode || 200,
      ms: Date.now() - t0,
      authSource: auth.source,
    }));
  } catch (error) {
    console.error('[kentuMcp]', JSON.stringify({
      uid: uidLogTag(auth.uid),
      method,
      path,
      status: 500,
      ms: Date.now() - t0,
      err: String(error?.message || error).slice(0, 120),
    }));
    jsonRpcError(res, 500, -32603, 'Errore interno MCP');
  } finally {
    try { await transport.close(); } catch { /* ignore */ }
    try { await server.close(); } catch { /* ignore */ }
  }
}
