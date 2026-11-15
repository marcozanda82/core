import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { resolveMcpBearer, uidLogTag } from './auth.js';
import { createKentuMcpServer } from './createServer.js';

function denyCors(res) {
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

/**
 * Handler HTTP Streamable MCP (stateless). Auth obbligatoria su ogni richiesta.
 * @param {import('firebase-functions/v1').Request} req
 * @param {import('firebase-functions/v1').Response} res
 * @param {{ db: import('firebase-admin/database').Database }} deps
 */
export async function handleKentuMcpHttp(req, res, { db }) {
  const t0 = Date.now();
  denyCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Mai accettare il gettone in query string
  if (req.query && (req.query.token || req.query.access_token || req.query.key)) {
    jsonRpcError(res, 400, -32600, 'Il gettone non può essere passato in query string');
    return;
  }

  let auth;
  try {
    auth = await resolveMcpBearer(db, req.get('authorization') || req.headers.authorization);
  } catch (error) {
    const status = error?.code === 'rate_limited' ? 429 : 401;
    console.info('[kentuMcp]', JSON.stringify({
      status,
      ms: Date.now() - t0,
      reason: error?.code || 'unauthorized',
    }));
    jsonRpcError(res, status, -32001, error?.message || 'Non autorizzato');
    return;
  }

  const server = createKentuMcpServer({ uid: auth.uid, db });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    console.info('[kentuMcp]', JSON.stringify({
      uid: uidLogTag(auth.uid),
      method: req.method,
      status: res.statusCode || 200,
      ms: Date.now() - t0,
    }));
  } catch (error) {
    console.error('[kentuMcp]', JSON.stringify({
      uid: uidLogTag(auth.uid),
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
