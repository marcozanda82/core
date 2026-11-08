/**
 * Pannello DEV — Controlla alimenti sospetti (sola lettura, ultimi 90 giorni).
 */

import React, { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { db } from '../../../../firebaseConfig.js';
import { useAuth } from '../../../../contexts/AuthContext';
import {
  focusLocalIsoDate,
  loadFocusAuthenticatedDiary,
} from '../loadFocusAuthenticatedDiary.js';
import { waitFocusOffCatalogForAnalysis } from '../waitFocusOffCatalogForAnalysis.js';
import {
  auditCompoundFoodMatches,
  formatCompoundFoodAuditPlainText,
  normalizeAuditCatalog,
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
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [suspects, setSuspects] = useState(/** @type {object[]} */ ([]));
  const [summary, setSummary] = useState(/** @type {{ suspectCount: number, sumKcalDiff: number }|null} */ (null));
  const [copied, setCopied] = useState(false);

  const runAudit = useCallback(async () => {
    setStatus('running');
    setErrorMsg('');
    setCopied(false);
    setSuspects([]);
    setSummary(null);

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

      if (db) {
        const loaded = await loadFocusAuthenticatedDiary({
          uid,
          get,
          ref,
          db,
          stash: false,
          publicationDate: session?.publicationDate || focusLocalIsoDate(),
          analysisDate: session?.analysisDate || null,
        });
        if (loaded.ok && loaded.snapshot?.fullHistory) {
          fullHistory = loaded.snapshot.fullHistory;
        }
      }

      if (!fullHistory) {
        setStatus('error');
        setErrorMsg('Diario non disponibile.');
        return;
      }

      const waited = await waitFocusOffCatalogForAnalysis({});
      const patch = waited?.catalogsPatch || {};
      let peek = null;
      try {
        const fl = await import('../../../../foodLoader.js');
        peek = typeof fl.peekKentuDatabasesSnapshot === 'function'
          ? fl.peekKentuDatabasesSnapshot()
          : null;
      } catch {
        peek = null;
      }

      const catalogs = [
        normalizeAuditCatalog(patch.kentuItDb || peek?.kentuItDb),
        normalizeAuditCatalog(patch.globalDb || peek?.globalDb || peek?.usdaDb),
        normalizeAuditCatalog(patch.offDb || peek?.offDb),
      ].filter((c) => c && Object.keys(c).length > 0);

      if (!catalogs.length) {
        setStatus('error');
        setErrorMsg('Cataloghi alimenti non ancora caricati.');
        return;
      }

      const endIso = focusLocalIsoDate();
      const windowHistory = sliceHistoryLastDays(fullHistory, endIso, AUDIT_DAYS);
      const found = auditCompoundFoodMatches(windowHistory, catalogs);
      const sm = summarizeCompoundFoodAudit(found);
      setSuspects(found);
      setSummary(sm);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err?.message || 'Audit non riuscito.');
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
        {status === 'done' && suspects.length > 0 ? (
          <button
            type="button"
            className="kf-compound-audit-btn kf-compound-audit-btn--ghost"
            onClick={copyList}
          >
            {copied ? 'Copiato' : 'Copia elenco'}
          </button>
        ) : null}
      </div>

      {status === 'error' && errorMsg ? (
        <p className="kf-compound-audit-error" role="alert">{errorMsg}</p>
      ) : null}

      {status === 'done' && summary ? (
        <div className="kf-compound-audit-summary">
          <p>
            Voci:
            {' '}
            <strong>{summary.suspectCount}</strong>
            {' · '}
            Somma Δ kcal:
            {' '}
            <strong>
              {summary.sumKcalDiff > 0 ? '+' : ''}
              {summary.sumKcalDiff}
            </strong>
          </p>
          <p className="kf-compound-audit-note">Sola lettura — nessuna modifica al diario.</p>
        </div>
      ) : null}

      {status === 'done' && suspects.length === 0 ? (
        <p className="kf-compound-audit-empty">Nessuna voce sospetta negli ultimi {AUDIT_DAYS} giorni.</p>
      ) : null}

      {suspects.length > 0 ? (
        <ul className="kf-compound-audit-list">
          {suspects.map((s) => {
            const key = `${s.date}_${s.meal}_${s.recorded}_${s.simpleAlternative}_${s.grams}`;
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
      ) : null}
    </aside>
  );
}

export default FocusCompoundFoodAuditDev;
