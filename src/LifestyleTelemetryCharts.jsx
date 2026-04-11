/**
 * Telemetria "Stile di vita" per LongevityView: trend Kentu Score + alcol vs recupero (Body Battery).
 */
import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
} from 'recharts';
import {
  addDays,
  sumPureAlcoholGramsForDay,
  pureAlcoholGramsToUkUnits,
  getMorningRechargeFromBodyBattery,
} from './coreEngine';

const IT_MONTHS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

function formatItalianDateFromIso(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const p = iso.slice(0, 10).split('-');
  if (p.length !== 3) return iso;
  const d = Number(p[2]);
  const m = Number(p[1]);
  if (!Number.isFinite(d) || !Number.isFinite(m) || m < 1 || m > 12) return iso;
  return `${d} ${IT_MONTHS[m - 1]}`;
}

const TOOLTIP_BOX = {
  background: 'rgba(15,15,18,0.97)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 12,
  color: '#e5e5e5',
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const dateLabel = formatItalianDateFromIso(row.iso);
  const dayScore = row.score;
  const sma = row.scoreSma;
  const dayText =
    dayScore != null && Number.isFinite(Number(dayScore)) ? `${Math.round(Number(dayScore))}` : '—';
  const smaText =
    sma != null && Number.isFinite(Number(sma))
      ? `${Math.round(Number(sma) * 10) / 10}`
      : '—';

  return (
    <div style={TOOLTIP_BOX}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: '#f4f4f5' }}>{dateLabel}</div>
      <div style={{ marginBottom: 4, color: '#94a3b8' }}>
        Score giornaliero: <span style={{ color: '#e5e5e5', fontWeight: 600 }}>{dayText}</span>
      </div>
      <div style={{ color: '#c4b5fd' }}>
        Media a 5gg: <span style={{ color: '#e9d5ff', fontWeight: 600 }}>{smaText}</span>
      </div>
    </div>
  );
}

function CustomAlcoholTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const dateLabel = formatItalianDateFromIso(row.iso);
  const units = Number(row.units);
  const bb = row.bbNext;
  const unitsOk = Number.isFinite(units);
  const drinkIcon = unitsOk && units >= 2 ? '🍺' : '🍷';
  const unitsStr = unitsOk ? `${Math.round(units * 10) / 10}` : '—';
  const bbNum = bb != null && Number.isFinite(Number(bb)) ? Number(bb) : null;
  const bbRounded = bbNum != null ? Math.round(bbNum * 10) / 10 : null;
  const bbStr =
    bbRounded != null
      ? bbRounded >= 0
        ? `+${bbRounded}%`
        : `${bbRounded}%`
      : '—';

  return (
    <div style={TOOLTIP_BOX}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: '#f4f4f5' }}>{dateLabel}</div>
      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, color: '#d8b4fe' }}>
        <span aria-hidden>{drinkIcon}</span>
        <span>
          Unità alcoliche: <strong style={{ color: '#f3e8ff' }}>{unitsStr}</strong>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#86efac' }}>
        <span aria-hidden>🔋</span>
        <span>
          Ricarica mattutina: <strong style={{ color: '#bbf7d0' }}>{bbStr}</strong>
        </span>
      </div>
    </div>
  );
}

function shortLabel(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const p = iso.split('-');
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}`;
}

function compareIso(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function KentuDisciplineTrendChart({
  scoreHistory = [],
  anchorDate,
  timeWindow,
  todayScore = null,
}) {
  const data = useMemo(() => {
    const anchor = anchorDate || '';
    if (!anchor) return [];
    const tw = Math.max(7, timeWindow === 1 ? 7 : Math.min(90, Number(timeWindow) || 30));
    const byDate = new Map();
    (scoreHistory || []).forEach((r) => {
      if (r?.date && typeof r.score === 'number' && !Number.isNaN(r.score)) {
        byDate.set(r.date, r.score);
      }
    });
    const days = [];
    for (let i = tw - 1; i >= 0; i--) {
      const d = addDays(anchor, -i);
      let score = byDate.get(d);
      if (d === anchor && todayScore != null && Number.isFinite(Number(todayScore))) {
        score = Number(todayScore);
      }
      days.push({
        iso: d,
        label: shortLabel(d),
        score: score != null && Number.isFinite(score) ? score : null,
      });
    }
    const SMA = 5;
    for (let i = 0; i < days.length; i++) {
      const win = [];
      for (let j = Math.max(0, i - (SMA - 1)); j <= i; j++) {
        if (days[j].score != null) win.push(days[j].score);
      }
      days[i].scoreSma = win.length ? Math.round((win.reduce((a, b) => a + b, 0) / win.length) * 10) / 10 : null;
    }
    return days;
  }, [scoreHistory, anchorDate, timeWindow, todayScore]);

  if (!data.length) {
    return (
      <p style={{ margin: 0, fontSize: '0.88rem', color: '#888', lineHeight: 1.5 }}>
        Nessuno storico punteggio nel periodo selezionato.
      </p>
    );
  }

  return (
    <div style={{ height: 240, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 10 }} axisLine={{ stroke: '#333' }} />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={{ stroke: '#333' }}
            label={{ value: 'Score', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
          <Line
            type="monotone"
            dataKey="score"
            name="Kentu Score (giorno)"
            stroke="#64748b"
            strokeWidth={1.5}
            dot={{ r: 2, fill: '#64748b' }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="scoreSma"
            name="Trend (media 5 giorni)"
            stroke="#a855f7"
            strokeWidth={2.5}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AlcoholRecoveryComposedChart({ fullHistory, userTargets, anchorDate, timeWindow }) {
  const data = useMemo(() => {
    if (!fullHistory || !userTargets || !anchorDate) return [];
    const tw = Math.max(7, timeWindow === 1 ? 7 : Math.min(90, Number(timeWindow) || 30));
    const rows = [];
    for (let i = tw - 1; i >= 0; i--) {
      const d = addDays(anchorDate, -i);
      const dNext = addDays(d, 1);
      if (compareIso(dNext, anchorDate) > 0) continue;
      const g = sumPureAlcoholGramsForDay(fullHistory, d);
      const units = pureAlcoholGramsToUkUnits(g);
      const bbNext = getMorningRechargeFromBodyBattery(fullHistory, dNext, userTargets);
      rows.push({
        iso: d,
        label: shortLabel(d),
        units,
        bbNext: bbNext != null ? bbNext : null,
      });
    }
    return rows;
  }, [fullHistory, userTargets, anchorDate, timeWindow]);

  const hasAlcohol = data.some((r) => r.units > 0);
  const hasBb = data.some((r) => r.bbNext != null);

  if (!data.length || !hasBb) {
    return (
      <p style={{ margin: 0, fontSize: '0.88rem', color: '#888', lineHeight: 1.5 }}>
        Dati insufficienti per correlare alcol e recupero (servono giorni consecutivi nello storico).
      </p>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.45 }}>
        Le barre sono le unità alcoliche del giorno; la linea verde è la <strong>Ricarica notturna</strong> (proxy Body
        Battery mattutina) del <strong>giorno successivo</strong>. Utile per vedere l’effetto sul recupero.
      </p>
      {!hasAlcohol ? (
        <p style={{ margin: '0 0 8px', fontSize: '0.72rem', color: '#78716c' }}>
          Nessun alcol stimato nel periodo (voci <code style={{ fontSize: '0.65rem' }}>type: alcohol</code>, pasti con
          keyword tipo vino/birra/cocktail nel nome, oppure ml+ABV). La linea mostra comunque il trend di recupero.
        </p>
      ) : null}
      <div style={{ height: 240, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 10 }} axisLine={{ stroke: '#333' }} />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#c4b5fd', fontSize: 10 }}
            axisLine={{ stroke: '#333' }}
            label={{
              value: 'Unità alcol',
              angle: -90,
              position: 'insideLeft',
              fill: '#a78bfa',
              fontSize: 10,
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fill: '#86efac', fontSize: 10 }}
            axisLine={{ stroke: '#333' }}
            label={{
              value: 'BB mattino (giorno dopo)',
              angle: 90,
              position: 'insideRight',
              fill: '#4ade80',
              fontSize: 10,
            }}
          />
          <Tooltip content={<CustomAlcoholTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
          <Bar yAxisId="left" dataKey="units" name="Alcol (unità)" fill="rgba(168, 85, 247, 0.65)" radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="bbNext"
            name="Ricarica giorno dopo"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 3, fill: '#22c55e' }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
