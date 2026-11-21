import React, { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions, functionsTarget } from '../../firebaseConfig.js';

const USING_FUNCTIONS_EMULATOR = functionsTarget.startsWith('emulator:');

function callableErrorParts(err) {
  const code = String(err?.code || err?.customData?.code || '').replace(/^functions\//, '');
  const details = err?.details ?? err?.customData?.details;
  const detailsText = details == null || details === ''
    ? ''
    : typeof details === 'string'
      ? details
      : (() => {
        try { return JSON.stringify(details); } catch { return String(details); }
      })();
  const raw = String(err?.message || err || '').trim();
  return { code, details: detailsText, raw };
}

/** Messaggio UI + dump tecnico (code/message/details) per debug in pannello. */
function italianCallableError(err) {
  const { code, details, raw } = callableErrorParts(err);
  let human = 'Operazione MCP fallita.';
  if (code === 'unauthenticated' || /unauthenticated/i.test(raw)) {
    human = 'Devi essere autenticato per gestire i gettoni MCP.';
  } else if (code === 'unavailable' || /unavailable|Failed to fetch|network|socket hang up/i.test(raw)) {
    human = USING_FUNCTIONS_EMULATOR
      ? 'Emulatore Functions non raggiungibile (127.0.0.1:5001). Avvialo o togli VITE_USE_FUNCTIONS_EMULATOR.'
      : 'Cloud Functions europe-west1 non raggiungibile. Controlla rete / deploy.';
  } else if (code === 'deadline-exceeded' || /timed out|timeout/i.test(raw)) {
    human = USING_FUNCTIONS_EMULATOR
      ? 'Timeout sulla callable MCP (emulatore). Verifica Auth/RTDB/Functions avviati insieme.'
      : 'Timeout sulla callable MCP (produzione europe-west1).';
  } else if (code === 'not-found' || /not-found/i.test(raw)) {
    human = USING_FUNCTIONS_EMULATOR
      ? 'Funzione MCP assente sull’emulatore Functions.'
      : 'Funzione MCP non trovata in produzione (europe-west1). Serve deploy di setMcpTokenScopes / create / list / revoke.';
  } else if (code === 'permission-denied') {
    human = 'Permesso negato per questa operazione.';
  } else if (code === 'invalid-argument') {
    human = raw && raw !== '[object Object]'
      ? raw
      : 'Argomento non valido per setMcpTokenScopes (attesi draftsWrite / mealsWrite boolean).';
  } else if (code === 'internal' || raw === 'internal') {
    human = details
      ? `Errore interno MCP: ${details}`
      : USING_FUNCTIONS_EMULATOR
        ? 'Errore interno MCP sull’emulatore (spesso RTDB emulatore non raggiungibile dalle Functions).'
        : 'Errore interno MCP sul backend di produzione (europe-west1). Controlla i log di setMcpTokenScopes.';
  } else if (raw && raw !== '[object Object]') {
    human = raw;
  }
  const tech = [
    code ? `code=${code}` : null,
    raw ? `message=${raw}` : null,
    details ? `details=${details}` : null,
  ].filter(Boolean).join(' · ');
  return tech ? `${human}\n${tech}` : human;
}

/**
 * Pannello DEV: crea/revoca gettoni MCP. Il plaintext si mostra una sola volta.
 */
export default function McpDevTokenPanel({ onClose }) {
  const [tokens, setTokens] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [onceToken, setOnceToken] = useState(null);
  const [onceId, setOnceId] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    if (!auth.currentUser) {
      setError('Devi essere autenticato per gestire i gettoni MCP.');
      setTokens([]);
      return;
    }
    try {
      const list = httpsCallable(functions, 'listMcpTokens');
      const res = await list({});
      setTokens(Array.isArray(res?.data?.tokens) ? res.data.tokens : []);
    } catch (err) {
      console.error('[mcp-dev] list tokens error', err);
      setError(italianCallableError(err));
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[mcp-dev] open panel', {
        uid: auth.currentUser?.uid || null,
        functionsTarget,
      });
    }
    refresh();
  }, [refresh]);

  const createToken = async () => {
    setBusy(true);
    setError(null);
    setOnceToken(null);
    if (import.meta.env.DEV) console.log('[mcp-dev] create token start');
    try {
      if (!auth.currentUser) {
        throw Object.assign(new Error('unauthenticated'), { code: 'unauthenticated' });
      }
      const create = httpsCallable(functions, 'createMcpToken');
      const res = await create({});
      const token = res?.data?.token;
      const tokenId = res?.data?.tokenId;
      if (!token || !tokenId) throw new Error('Risposta senza gettone');
      setOnceToken(String(token));
      setOnceId(String(tokenId));
      if (import.meta.env.DEV) console.log('[mcp-dev] create token ok', { tokenId });
      await refresh();
    } catch (err) {
      console.error('[mcp-dev] create token error', err);
      setError(italianCallableError(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (tokenId) => {
    if (!tokenId) return;
    setBusy(true);
    setError(null);
    try {
      const call = httpsCallable(functions, 'revokeMcpToken');
      await call({ tokenId });
      if (onceId === tokenId) {
        setOnceToken(null);
        setOnceId(null);
      }
      if (import.meta.env.DEV) console.log('[mcp-dev] revoke token ok', { tokenId });
      await refresh();
    } catch (err) {
      console.error('[mcp-dev] revoke token error', err);
      setError(italianCallableError(err));
    } finally {
      setBusy(false);
    }
  };

  const setTokenScope = async (tokenId, patch) => {
    if (!tokenId || !patch || typeof patch !== 'object') return;
    setBusy(true);
    setError(null);
    try {
      const call = httpsCallable(functions, 'setMcpTokenScopes');
      await call({ tokenId, ...patch });
      if (import.meta.env.DEV) console.log('[mcp-dev] token scopes ok', { tokenId, ...patch });
      await refresh();
    } catch (err) {
      const parts = callableErrorParts(err);
      console.error('[mcp-dev] token scopes error', {
        tokenId,
        patch,
        code: parts.code,
        message: parts.raw,
        details: parts.details,
        err,
      });
      setError(italianCallableError(err));
    } finally {
      setBusy(false);
    }
  };

  const copyOnce = async () => {
    if (!onceToken || !navigator?.clipboard?.writeText) return;
    await navigator.clipboard.writeText(onceToken);
  };

  return (
    <div className="fixed inset-0 z-[100050] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="MCP gettoni DEV"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 text-slate-100 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-cyan-200">MCP · gettoni DEV</h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={onClose}
          >
            Chiudi
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          Il gettone plaintext viene mostrato una sola volta (non usare il tokenId
          {' '}
          <span className="font-mono text-slate-500">t_…</span>
          {' '}
          della lista). Su Claude: autenticazione «Nessun accesso», intestazione
          {' '}
          <span className="font-mono text-slate-300">authorization</span>
          {' '}
          = Bearer &lt;gettone&gt;, oppure
          {' '}
          <span className="font-mono text-slate-300">x-api-key</span>
          {' '}
          = solo il gettone. Non salvarlo in file del repo.
        </p>

        <button
          type="button"
          disabled={busy}
          onClick={createToken}
          className="mb-3 w-full rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-100 disabled:opacity-50"
        >
          {busy ? 'Attendere…' : 'Crea gettone MCP'}
        </button>

        {onceToken ? (
          <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-950/40 p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
              Copialo ora — non verrà più mostrato
            </p>
            <code className="block break-all text-xs text-amber-50">{onceToken}</code>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={copyOnce}
                className="rounded-lg border border-amber-500/40 px-2 py-1 text-xs text-amber-100"
              >
                Copia
              </button>
              <button
                type="button"
                onClick={() => { setOnceToken(null); setOnceId(null); }}
                className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300"
              >
                Ho copiato
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <pre
            className="mb-2 whitespace-pre-wrap break-words rounded-lg border border-red-500/30 bg-red-950/40 px-2 py-2 text-[11px] leading-relaxed text-red-200"
            role="alert"
          >
            {error}
          </pre>
        ) : null}

        <ul className="space-y-2">
          {tokens.length === 0 ? (
            <li className="text-xs text-slate-500">Nessun gettone.</li>
          ) : (
            tokens.map((row) => {
              const scopes = Array.isArray(row.scopes) ? row.scopes : ['read'];
              const draftsWrite = scopes.includes('drafts:write');
              const mealsWrite = scopes.includes('meals:write');
              const permLabel = [
                'lettura',
                draftsWrite ? 'bozze' : null,
                mealsWrite ? 'pasti' : null,
              ].filter(Boolean).join(' + ');
              return (
                <li
                  key={row.tokenId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-slate-300">{row.tokenId}</p>
                    <p className="text-[10px] text-slate-500">
                      {row.revoked ? 'revocato' : 'attivo'}
                      {row.createdAt ? ` · creato ${new Date(row.createdAt).toLocaleString()}` : ''}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Permessi: {permLabel}
                    </p>
                  </div>
                  {!row.revoked ? (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <label className="flex items-center gap-1 text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={draftsWrite}
                          disabled={busy}
                          onChange={(event) => setTokenScope(row.tokenId, { draftsWrite: event.target.checked })}
                        />
                        Bozze
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={mealsWrite}
                          disabled={busy}
                          onChange={(event) => setTokenScope(row.tokenId, { mealsWrite: event.target.checked })}
                        />
                        Pasti
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => revoke(row.tokenId)}
                        className="rounded-lg border border-red-500/40 px-2 py-1 text-[11px] text-red-200"
                      >
                        Revoca
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
