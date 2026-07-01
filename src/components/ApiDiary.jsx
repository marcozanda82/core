import React, { useCallback, useEffect, useState } from 'react';
import {
  API_USAGE_UPDATED_EVENT,
  estimateUsageCosts,
  getUsageTotals,
  resetUsageTotals,
} from '../services/apiUsageDiary';

function formatTokens(value) {
  return Number(value || 0).toLocaleString('it-IT');
}

function formatUsd(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value || 0);
}

function StatRow({ label, value, accent }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        background: '#111',
        border: '1px solid #2a2a2a',
        borderRadius: '10px',
      }}
    >
      <span style={{ fontSize: '0.8rem', color: '#888' }}>{label}</span>
      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: accent || '#fff' }}>{value}</span>
    </div>
  );
}

export default function ApiDiary({ onBack }) {
  const [totals, setTotals] = useState(() => getUsageTotals());

  const refresh = useCallback(() => {
    setTotals(getUsageTotals());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(API_USAGE_UPDATED_EVENT, handler);
    return () => window.removeEventListener(API_USAGE_UPDATED_EVENT, handler);
  }, [refresh]);

  const costs = estimateUsageCosts(totals);

  const handleReset = () => {
    if (!window.confirm('Azzerare il contatore token e i costi stimati?')) return;
    resetUsageTotals();
    refresh();
  };

  return (
    <div className="view-animate">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}
        >
          &lt; INDIETRO
        </button>
        <h2 style={{ fontSize: '0.8rem', color: '#b0bec5', letterSpacing: '2px', margin: 0 }}>📟 DIARIO API</h2>
        <div style={{ width: '70px' }} />
      </div>

      <p style={{ margin: '0 0 16px', fontSize: '0.75rem', color: '#666', lineHeight: 1.5 }}>
        Stima cumulativa per Gemini 2.5 Flash — input $0.30/M, output $2.50/M. Solo sviluppo locale.
      </p>

      <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
        <StatRow label="Totale Token Input" value={formatTokens(totals.promptTokenCount)} accent="#86efac" />
        <StatRow label="Totale Token Output" value={formatTokens(totals.candidatesTokenCount)} accent="#93c5fd" />
        <StatRow label="Chiamate AI registrate" value={formatTokens(totals.callCount)} accent="#cbd5e1" />
        <StatRow label="Costo stimato Input" value={formatUsd(costs.inputCost)} accent="#86efac" />
        <StatRow label="Costo stimato Output" value={formatUsd(costs.outputCost)} accent="#93c5fd" />
        <StatRow label="Costo Totale ($)" value={formatUsd(costs.totalCost)} accent="#fbbf24" />
      </div>

      <button
        type="button"
        onClick={handleReset}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid #7f1d1d',
          background: 'rgba(127, 29, 29, 0.25)',
          color: '#fca5a5',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Azzera contatore
      </button>
    </div>
  );
}
