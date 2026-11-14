/**
 * Pannello DEV — Controlla alimenti sospetti (sola lettura, ultimi 90 giorni).
 * Non bloccante: indici exact/prefix, contains solo cataloghi piccoli, chunk + Annulla.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { db } from '../../../../firebaseConfig.js';
import { useAuth } from '../../../../contexts/AuthContext';
import {
  focusLocalIsoDate,
  loadFocusAuthenticatedDiary,
} from '../loadFocusAuthenticatedDiary.js';
import {
  AUDIT_CHUNK_SIZE,
  AUDIT_LOG_PREFIX,
  auditCompoundFoodMatchesAsync,
  formatCompoundFoodAuditPlainText,
  groupCompoundAuditSuspects,
  sliceHistoryLastDays,
  summarizeCompoundFoodAudit,
} from '../auditCompoundFoodMatchesCore.js';

const AUDIT_DAYS = 90;

/**
 * @param {{ session?: object|null }} props
 */
export function FocusCompoundFoodAuditDev({ session }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const abortRef = useRef(/** @type {AbortController|null} */ (null));
  const [status, setStatus] = useState('idle'); // idle | running | done | error | cancelled
  const [errorMsg, setErrorMsg] = useState('');
  const [noteMsg, setNoteMsg] = useState('');
  const [suspects, setSuspects] = useState(/** @type {object[]} */ ([]));
  const [summary, setSummary] = useState(/** @type {{ suspectCount: number, sumKcalDiff: number }|null} */ (null));
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(/** @type {{ done: number, total: number, label: string }|null} */ (null));
  const [timings, setTimings] = useState(/** @type {object|null} */ (null));

  const cancelAudit = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runAudit = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setStatus('running');
    setErrorMsg('');
    setNoteMsg('');
    setCopied(false);
    setSuspects([]);
    setSummary(null);
    setTimings(null);
    setProgress({ done: 0, total: 1, label: 'Lettura diario…' });

    const tAll = typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      const uid = String(user?.uid || session?.uid || '').trim();
      if (!uid) {
        setStatus('error');
        setErrorMsg('Utente non autenticato.');
        return;
      }

      let fullHistory = session?.fullHistory && typeof session.fullHistory === 'object'
        ? session.fullHistory
        : null;

      const tDiary0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (db) {
        const loaded = await loadFocusAuthenticatedDiary({
          uid,
          get,
          ref,
          db,
          stash: false,
          mode: 'full',
          publicationDate: session?.publicationDate || focusLocalIsoDate(),
          analysisDate: session?.analysisDate || null,
        });
        if (loaded.ok && loaded.snapshot?.fullHistory) {
          fullHistory = loaded.snapshot.fullHistory;
        }
      }
      const diaryMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tDiary0);
      // eslint-disable-next-line no-console
      console.info(AUDIT_LOG_PREFIX, 'diary', { ms: diaryMs, syncMainThread: false });

      if (ac.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      if (!fullHistory) {
        setStatus('error');
        setErrorMsg('Diario non disponibile.');
        return;
      }

      setProgress({ done: 0, total: 1, label: 'Cataloghi…' });
      let peek = null;
      try {
        const fl = await import('../../../../foodLoader.js');
        if (typeof fl.loadKentuDatabases === 'function') {
          await fl.loadKentuDatabases().catch(() => null);
        }
        peek = typeof fl.peekKentuDatabasesSnapshot === 'function'
          ? fl.peekKentuDatabasesSnapshot()
          : null;
      } catch {
        peek = null;
      }

      const kentuItDb = peek?.kentuItDb && Object.keys(peek.kentuItDb).length ? peek.kentuItDb : null;
      const globalDb = (peek?.globalDb || peek?.usdaDb)
        && Object.keys(peek?.globalDb || peek?.usdaDb || {}).length
        ? (peek.globalDb || peek.usdaDb)
        : null;
      const offReady = Boolean(peek?.offReady) && peek?.offDb && Object.keys(peek.offDb).length > 0;
      const offDb = offReady ? peek.offDb : null;

      if (!kentuItDb && !globalDb && !offDb) {
        setStatus('error');
        setErrorMsg('Cataloghi alimenti non ancora caricati.');
        return;
      }

      if (!offReady) {
        setNoteMsg('Catalogo OFF non ancora pronto: procedo con CREA/USDA.');
        // eslint-disable-next-line no-console
        console.info(AUDIT_LOG_PREFIX, 'off_skipped', { offReady: false });
      }

      const endIso = focusLocalIsoDate();
      const windowHistory = sliceHistoryLastDays(fullHistory, endIso, AUDIT_DAYS);

      const result = await auditCompoundFoodMatchesAsync(
        windowHistory,
        {
          kentuItDb,
          globalDb,
          offDb,
          offReady,
          offSkipped: !offReady,
        },
        {
          signal: ac.signal,
          chunkSize: AUDIT_CHUNK_SIZE,
          log: true,
          onProgress: (p) => {
            if (p.phase === 'index' || p.phase === 'index_heavy') {
              setProgress({
                done: Number(p.index || p.done || 0),
                total: Math.max(1, Number(p.total || 1)),
                label: 'Indicizzo cataloghi…',
              });
              return;
            }
            if (p.phase === 'match') {
              setProgress({
                done: Number(p.done || 0),
                total: Math.max(1, Number(p.total || 1)),
                label: `Analizzo ${p.done || 0} su ${p.total || 0} alimenti`,
              });
            }
          },
        },
      );

      if (ac.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });

      const sm = summarizeCompoundFoodAudit(result.suspects);
      const totalMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tAll);
      const nextTimings = { ...result.timings, diaryMs, wallMs: totalMs };
      setSuspects(result.suspects);
      setSummary(sm);
      setTimings(nextTimings);
      setProgress(null);
      setStatus('done');
      // eslint-disable-next-line no-console
      console.info(AUDIT_LOG_PREFIX, 'ui_done', nextTimings);
    } catch (err) {
      if (err?.name === 'AbortError' || String(err?.message || '') === 'cancelled') {
        setStatus('cancelled');
        setProgress(null);
        setErrorMsg('');
        setNoteMsg('Controllo annullato.');
        return;
      }
      setStatus('error');
      setProgress(null);
      setErrorMsg(err?.message || 'Audit non riuscito.');
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  }, [session, user?.uid]);

  const copyList = useCallback(async () => {
    const text = formatCompoundFoodAuditPlainText(suspects, summary || undefined);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [suspects, summary]);

  const openDiaryDay = useCallback((date) => {
    const d = String(date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    navigate('/', { state: { openDiaryDate: d } });
  }, [navigate]);

  const groups = useMemo(() => groupCompoundAuditSuspects(suspects), [suspects]);

  const pct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
    : 0;

  return (
    <aside className="kf-compound-audit" aria-label="Controllo alimenti sospetti (sviluppo)">
      <h3>Sviluppo</h3>
      <div className="kf-compound-audit-actions">
        <button
          type="button"
          className="kf-compound-audit-btn"
          disabled={status === 'running'}
          onClick={runAudit}
        >
          {status === 'running' ? 'Controllo in corso…' : 'Controlla alimenti sospetti'}
        </button>
        {status === 'running' ? (
          <button
            type="button"
            className="kf-compound-audit-btn kf-compound-audit-btn--ghost"
            onClick={cancelAudit}
          >
            Annulla
          </button>
        ) : null}
        {status === 'done' ? (
          <button
            type="button"
            className="kf-compound-audit-btn kf-compound-audit-btn--ghost"
            onClick={copyList}
          >
            {copied ? 'Copiato' : 'Copia elenco'}
          </button>
        ) : null}
      </div>

      {status === 'running' && progress ? (
        <div className="kf-compound-audit-progress" aria-live="polite">
          <p>{progress.label}</p>
          <div className="kf-compound-audit-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      {status === 'error' && errorMsg ? (
        <p className="kf-compound-audit-error" role="alert">{errorMsg}</p>
      ) : null}

      {noteMsg ? (
        <p className="kf-compound-audit-note">{noteMsg}</p>
      ) : null}

      {status === 'done' && summary ? (
        <div className="kf-compound-audit-summary">
          <p>
            Voci:
            {' '}
            <strong>{summary.suspectCount}</strong>
            {' · '}
            Piatti:
            {' '}
            <strong>{groups.length}</strong>
            {' · '}
            Somma Δ kcal:
            {' '}
            <strong>
              {summary.sumKcalDiff > 0 ? '+' : ''}
              {summary.sumKcalDiff}
            </strong>
            {timings?.totalMs != null ? (
              <>
                {' · '}
                {timings.totalMs}
                {' ms'}
              </>
            ) : null}
          </p>
          <p className="kf-compound-audit-note">Sola lettura — nessuna modifica al diario.</p>
        </div>
      ) : null}

      {status === 'done' && suspects.length === 0 ? (
        <p className="kf-compound-audit-empty">Nessuna voce sospetta negli ultimi {AUDIT_DAYS} giorni.</p>
      ) : null}

      {groups.length > 0 ? (
        <ul className="kf-compound-audit-list">
          {groups.map((group) => (
            <li
              key={group.recorded}
              className={`kf-compound-audit-group${group.sourcePointsToSimple ? ' is-source-simple' : ''}`}
            >
              <div className="kf-compound-audit-group-head">
                <strong>{group.recorded}</strong>
                <span className="kf-compound-audit-count">
                  ×
                  {group.count}
                </span>
                {group.sourcePointsToSimple ? (
                  <span className="kf-compound-audit-flag">testo → semplice</span>
                ) : null}
              </div>
              <ul className="kf-compound-audit-group-list">
                {group.occurrences.map((s) => {
                  const key = `${s.date}_${s.meal}_${s.simpleAlternative}_${s.grams}_${s.sourceText || ''}`;
                  const timePart = s.mealTime ? ` · ${s.mealTime}` : '';
                  const diff = s.kcalDiff != null
                    ? `${s.kcalDiff > 0 ? '+' : ''}${s.kcalDiff}`
                    : '—';
                  return (
                    <li key={key} className="kf-compound-audit-row">
                      <div className="kf-compound-audit-row-main">
                        <span className="kf-compound-audit-date">{s.date}</span>
                        <span className="kf-compound-audit-meal">
                          {s.meal}
                          {timePart}
                        </span>
                      </div>
                      {s.sourceText ? (
                        <p className="kf-compound-audit-wrote">
                          Avevi scritto:
                          {' '}
                          {s.sourceText}
                        </p>
                      ) : null}
                      <div className="kf-compound-audit-foods">
                        <span>{s.recorded}</span>
                        <span className="kf-compound-audit-arrow">→</span>
                        <span>{s.simpleAlternative}</span>
                      </div>
                      <div className="kf-compound-audit-metrics">
                        <span>
                          {s.grams != null ? `${s.grams} g` : '—'}
                        </span>
                        <span>
                          kcal
                          {' '}
                          {s.recordedPortionKcal != null ? s.recordedPortionKcal : '—'}
                        </span>
                        <span>
                          alt
                          {' '}
                          {s.estimatedAltKcal != null ? s.estimatedAltKcal : '—'}
                        </span>
                        <span>
                          Δ
                          {' '}
                          {diff}
                        </span>
                      </div>
                      <Link
                        className="kf-compound-audit-link"
                        to="/"
                        state={{ openDiaryDate: s.date }}
                        onClick={(e) => {
                          e.preventDefault();
                          openDiaryDay(s.date);
                        }}
                      >
                        Apri diario
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

export default FocusCompoundFoodAuditDev;
