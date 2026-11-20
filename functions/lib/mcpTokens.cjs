var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// mcp/tokens.js
var tokens_exports = {};
__export(tokens_exports, {
  createMcpTokenForUid: () => createMcpTokenForUid,
  listMcpTokenMeta: () => listMcpTokenMeta,
  revokeMcpTokenForUid: () => revokeMcpTokenForUid,
  setMcpTokenScopesForUid: () => setMcpTokenScopesForUid
});
module.exports = __toCommonJS(tokens_exports);

// mcp/hashToken.js
var import_node_crypto = require("node:crypto");
var TOKEN_BYTES = 32;
function sha256Hex(value) {
  return (0, import_node_crypto.createHash)("sha256").update(String(value), "utf8").digest("hex");
}
function generateMcpToken() {
  const raw = (0, import_node_crypto.randomBytes)(TOKEN_BYTES);
  const token = raw.toString("base64url");
  return { token, hash: sha256Hex(token) };
}

// mcp/scopes.js
var MCP_SCOPE_READ = "read";
var MCP_SCOPE_DRAFTS_WRITE = "drafts:write";
var KNOWN_SCOPES = /* @__PURE__ */ new Set([MCP_SCOPE_READ, MCP_SCOPE_DRAFTS_WRITE]);
function normalizeMcpScopes(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object") list = Object.values(raw);
  const out = [MCP_SCOPE_READ];
  for (const value of list) {
    const scope = String(value || "").trim();
    if (KNOWN_SCOPES.has(scope) && !out.includes(scope)) out.push(scope);
  }
  return out;
}
function buildMcpScopes(draftsWrite) {
  return draftsWrite ? [MCP_SCOPE_READ, MCP_SCOPE_DRAFTS_WRITE] : [MCP_SCOPE_READ];
}

// mcp/tokens.js
async function createMcpTokenForUid(db, uid) {
  const id = String(uid || "").trim();
  if (!id) {
    const err = new Error("Utente non autenticato");
    err.code = "unauthenticated";
    throw err;
  }
  const { token, hash } = generateMcpToken();
  const tokenId = `t_${Date.now().toString(36)}_${hash.slice(0, 8)}`;
  const now = Date.now();
  const tokenRecord = {
    hash,
    createdAt: now,
    lastUsedAt: null,
    revoked: false,
    hourBucket: null,
    requestCountHour: 0,
    scopes: buildMcpScopes(false)
  };
  await db.ref(`users/${id}/mcp_tokens/${tokenId}`).set(tokenRecord);
  await db.ref(`mcp_token_lookup/${hash}`).set({ uid: id, tokenId });
  return {
    tokenId,
    token,
    createdAt: now
  };
}
async function revokeMcpTokenForUid(db, uid, tokenId) {
  const id = String(uid || "").trim();
  const tid = String(tokenId || "").trim();
  if (!id) {
    const err = new Error("Utente non autenticato");
    err.code = "unauthenticated";
    throw err;
  }
  if (!tid) {
    const err = new Error("tokenId richiesto");
    err.code = "invalid-argument";
    throw err;
  }
  const tokenRef = db.ref(`users/${id}/mcp_tokens/${tid}`);
  const snap = await tokenRef.get();
  if (!snap.exists()) {
    const err = new Error("Gettone non trovato");
    err.code = "not-found";
    throw err;
  }
  const record = snap.val() || {};
  const hash = String(record.hash || "");
  await tokenRef.update({ revoked: true, revokedAt: Date.now() });
  if (hash) {
    await db.ref(`mcp_token_lookup/${hash}`).set(null);
  }
  return { tokenId: tid, revoked: true };
}
async function listMcpTokenMeta(db, uid) {
  const snap = await db.ref(`users/${uid}/mcp_tokens`).get();
  if (!snap.exists()) return [];
  const val = snap.val() || {};
  return Object.entries(val).map(([tokenId, row]) => ({
    tokenId,
    createdAt: row?.createdAt ?? null,
    lastUsedAt: row?.lastUsedAt ?? null,
    revoked: row?.revoked === true,
    scopes: normalizeMcpScopes(row?.scopes)
  }));
}
async function setMcpTokenScopesForUid(db, uid, tokenId, { draftsWrite } = {}) {
  const id = String(uid || "").trim();
  const tid = String(tokenId || "").trim();
  if (!id) {
    const err = new Error("Utente non autenticato");
    err.code = "unauthenticated";
    throw err;
  }
  if (!tid) {
    const err = new Error("tokenId richiesto");
    err.code = "invalid-argument";
    throw err;
  }
  if (typeof draftsWrite !== "boolean") {
    const err = new Error("draftsWrite deve essere true o false");
    err.code = "invalid-argument";
    throw err;
  }
  const tokenRef = db.ref(`users/${id}/mcp_tokens/${tid}`);
  const snap = await tokenRef.get();
  if (!snap.exists()) {
    const err = new Error("Gettone non trovato");
    err.code = "not-found";
    throw err;
  }
  if (snap.val()?.revoked === true) {
    const err = new Error("Gettone revocato");
    err.code = "invalid-argument";
    throw err;
  }
  const scopes = buildMcpScopes(draftsWrite);
  await tokenRef.update({ scopes, scopesUpdatedAt: Date.now() });
  return { tokenId: tid, scopes };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createMcpTokenForUid,
  listMcpTokenMeta,
  revokeMcpTokenForUid,
  setMcpTokenScopesForUid
});
//# sourceMappingURL=mcpTokens.cjs.map
