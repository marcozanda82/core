import React, { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebaseConfig.js';

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
    try {
      const list = httpsCallable(functions, 'listMcpTokens');
      const res = await list({});
      setTokens(Array.isArray(res?.data?.tokens) ? res.data.tokens : []);
    } catch (err) {
      setError(String(err?.message || err || 'Errore elenco gettoni'));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createToken = async () => {
    setBusy(true);
    setError(null);
    setOnceToken(null);
    try {
      const create = httpsCallable(functions, 'createMcpToken');
      const res = await create({});
      const token = res?.data?.token;
      const tokenId = res?.data?.tokenId;
      if (!token || !tokenId) throw new Error('Risposta senza gettone');
      setOnceToken(String(token));
      setOnceId(String(tokenId));
      await refresh();
    } catch (err) {
      setError(String(err?.message || err || 'Creazione fallita'));
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
      await refresh();
    } catch (err) {
      setError(String(err?.message || err || 'Revoca fallita'));
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 text-slate-100 shadow-xl">
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
          Il gettone viene generato sul server e mostrato una sola volta.
          Usalo come header Authorization Bearer sul connettore Claude. Non salvarlo in file del repo.
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
          <p className="mb-2 text-xs text-red-300">{error}</p>
        ) : null}

        <ul className="space-y-2">
          {tokens.length === 0 ? (
            <li className="text-xs text-slate-500">Nessun gettone.</li>
          ) : (
            tokens.map((row) => (
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
                </div>
                {!row.revoked ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => revoke(row.tokenId)}
                    className="shrink-0 rounded-lg border border-red-500/40 px-2 py-1 text-[11px] text-red-200"
                  >
                    Revoca
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
