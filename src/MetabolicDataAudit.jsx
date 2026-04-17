import React, { useMemo, useState } from 'react';

const cellMono = {
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: 10,
  letterSpacing: '0.02em',
};

const thStyle = {
  ...cellMono,
  textAlign: 'left',
  padding: '5px 6px',
  borderBottom: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(200, 210, 220, 0.55)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const tdStyle = {
  ...cellMono,
  padding: '5px 6px',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  color: 'rgba(230, 238, 245, 0.72)',
};

const tdMuted = {
  ...tdStyle,
  color: 'rgba(180, 192, 204, 0.45)',
};

/**
 * Trasparenza: medie diario vs input motore mappa (stessa finestra temporale).
 *
 * @param {{
 *   rawDetails: { meanKcal: number | null, meanTraining01: number | null, sleepRegisteredMean: number | null, realSleepDays: number, totalWindowDays: number } | null | undefined,
 *   mapInputs: { energyBalance: number, trainingLoad: number, sleepHours: number, realSleepDays?: number, totalWindowDays?: number } | null | undefined,
 *   historyPoint?: { x?: number, y?: number, sleepHours?: number } | null | undefined,
 * }} props
 */
export default function MetabolicDataAudit({ rawDetails, mapInputs, historyPoint }) {
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    const rd = rawDetails || {};
    const mi = mapInputs || {};
    const hp = historyPoint || {};
    const tw = rd.totalWindowDays ?? 0;
    const rs = rd.realSleepDays ?? 0;

    const hasWindow = tw > 0;

    const sleepReg =
      rd.sleepRegisteredMean != null && Number.isFinite(rd.sleepRegisteredMean)
        ? `${Number(rd.sleepRegisteredMean).toFixed(1)} h`
        : 'N/D';
    const sleepUsedVal =
      hp.sleepHours != null && Number.isFinite(Number(hp.sleepHours))
        ? Number(hp.sleepHours)
        : Number(mi.sleepHours ?? 8);
    const sleepUsed = `${sleepUsedVal.toFixed(1)} h`;
    let sleepNote = '—';
    if (!hasWindow || rs === 0 || rs < tw) {
      sleepNote = 'Stima Default';
    }
    if (hp.sleepHours != null && Number.isFinite(Number(hp.sleepHours))) {
      sleepNote = "Valore d'inerzia (EMA)";
    }

    const kcalReg = hasWindow && rd.meanKcal != null ? `${Math.round(rd.meanKcal)} kcal/d` : 'N/D';
    const kcalUsedVal =
      hp.x != null && Number.isFinite(Number(hp.x)) ? Number(hp.x) : Number(mi.energyBalance ?? 0);
    const kcalUsed = `${kcalUsedVal.toFixed(1)}`;
    const kcalNote =
      hp.x != null && Number.isFinite(Number(hp.x))
        ? "Valore d'inerzia (EMA)"
        : hasWindow
          ? 'Normalizzato (kcal/5)'
          : '—';

    const trainReg =
      hasWindow && rd.meanTraining01 != null
        ? `${Number(rd.meanTraining01).toFixed(1)} /100`
        : 'N/D';
    // y in cronologia è già nel sistema metabolico (non in coordinate CSS top), quindi è allineato al marker.
    const trainUsedVal =
      hp.y != null && Number.isFinite(Number(hp.y))
        ? Number(hp.y)
        : Number(mi.trainingLoad ?? 0);
    const trainUsed = `${trainUsedVal.toFixed(1)}`;
    const trainNote =
      hp.y != null && Number.isFinite(Number(hp.y))
        ? "Valore d'inerzia (EMA)"
        : hasWindow
          ? 'Normalizzato (0 = -54)'
          : '—';

    return [
      { key: 'sleep', metric: 'Sonno', registered: sleepReg, used: sleepUsed, note: sleepNote },
      { key: 'kcal', metric: 'Bilancio', registered: kcalReg, used: kcalUsed, note: kcalNote },
      {
        key: 'train',
        metric: 'Allenamento',
        registered: trainReg,
        used: trainUsed,
        note: trainNote,
      },
    ];
  }, [rawDetails, mapInputs, historyPoint]);

  return (
    <div style={{ marginTop: 14, width: '100%', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        style={{
          display: 'block',
          width: '100%',
          padding: '6px 4px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          textAlign: 'center',
          fontFamily: cellMono.fontFamily,
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(160, 185, 205, 0.55)',
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
          transition: 'color 0.2s ease, border-color 0.2s ease',
        }}
      >
        {expanded ? 'Nascondi dettagli calcolo' : 'Vedi dettagli calcolo'}
      </button>

      {expanded && (
        <div
          role="region"
          aria-label="Dettagli calcolo mappa metabolica"
          style={{
            marginTop: 8,
            padding: '8px 6px 10px',
            borderRadius: 8,
            background: 'rgba(8, 10, 14, 0.65)',
            border: '1px solid rgba(255,255,255,0.06)',
            overflowX: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 10,
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Metrica</th>
                <th style={thStyle}>Registrato</th>
                <th style={{ ...thStyle, color: 'rgba(140, 175, 200, 0.5)' }}>Usato dalla mappa</th>
                <th style={thStyle}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={tdStyle}>{r.metric}</td>
                  <td style={tdMuted}>{r.registered}</td>
                  <td style={{ ...tdStyle, color: 'rgba(200, 225, 245, 0.55)' }}>{r.used}</td>
                  <td style={{ ...tdMuted, fontSize: 9 }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p
            style={{
              margin: '8px 2px 0',
              fontSize: 9,
              lineHeight: 1.35,
              fontFamily: cellMono.fontFamily,
              color: 'rgba(150, 165, 180, 0.42)',
              letterSpacing: '0.02em',
            }}
          >
            Asse bilancio e allenamento: scala −100…+100. Bilancio: media kcal/d ÷ 5 (con clamp).
            Allenamento: ((media−35)/65)×100, quindi 0 ≈ −54 e 100 = +100.
          </p>
        </div>
      )}
    </div>
  );
}
