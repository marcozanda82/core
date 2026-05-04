import React, { useMemo, useState } from 'react';
import { parseFoodCommandIntent } from '@/features/salaComandi/engines/foodCommandEngine';

/** DB minimo per ispezionare ranking (fragola vs composti vs gelato ecc.). */
const foodDbRankingMock = {
  FRAGOLE: { desc: 'fragole', kcal: 32, prot: 0.7, carb: 8, fat: 0.3, defaultQty: 100 },
  FRAGOLA: { desc: 'fragola', kcal: 32, prot: 0.7, carb: 8, fat: 0.3, defaultQty: 100 },
  GELATO_ALLA_FRAGOLA: {
    desc: 'gelato alla fragola',
    kcal: 200,
    prot: 3,
    carb: 26,
    fat: 9,
    defaultQty: 100,
  },
  GELATO: { desc: 'gelato', kcal: 200, prot: 3.5, carb: 24, fat: 10, defaultQty: 100 },
  YOG_ALLA_FRAGOLA: {
    desc: 'yogurt alla fragola',
    kcal: 110,
    prot: 4,
    carb: 16,
    fat: 3,
    defaultQty: 125,
  },
  MELA: { desc: 'mela', kcal: 52, prot: 0.3, carb: 14, fat: 0.2, defaultQty: 150 },
  UOVA: { desc: 'uova', kcal: 140, prot: 12, carb: 1, fat: 10, defaultQty: 100 },
};

const pad = { padding: 24, maxWidth: 920, margin: '0 auto' };
const mono = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.5,
};
const panel = {
  border: '1px solid #3f3f46',
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
  background: '#18181b',
  color: '#e4e4e7',
};

export default function FoodCommandRankingDebug() {
  const [text, setText] = useState('fragola');
  const flatLog = useMemo(() => [], []);

  /** Snapshot dopo «Analizza»; primo render = esempio «fragola». */
  const [lastRun, setLastRun] = useState(() =>
    parseFoodCommandIntent({
      text: 'fragola',
      foodDb: foodDbRankingMock,
      flatLog: [],
      mealContext: null,
    }),
  );

  const analyze = () => {
    setLastRun(
      parseFoodCommandIntent({
        text,
        foodDb: foodDbRankingMock,
        flatLog,
        mealContext: null,
      }),
    );
  };

  return (
    <div style={pad}>
      <h1 style={{ fontSize: 22, marginBottom: 8, color: '#fafafa' }}>
        Food Command — Ranking debug
      </h1>
      <p style={{ color: '#a1a1aa', marginBottom: 20, fontSize: 13 }}>
        Mock DB: fragole, fragola, gelato alla fragola, gelato, yogurt alla fragola, mela,
        uova. Usa «Analizza» per bloccare il JSON sotto (input non aggiorna in tempo reale).
      </p>

      <div style={{ ...panel, marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#d4d4d8' }}>
          Testo comando
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 6,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #52525b',
              background: '#09090b',
              color: '#fafafa',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
            placeholder="es. fragola, gelato, gelato alla fragola…"
          />
        </label>
        <button
          type="button"
          onClick={analyze}
          style={{
            marginTop: 12,
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Analizza
        </button>
      </div>

      {(lastRun.items || []).map((it, idx) => (
        <section key={`item-${idx}`} style={{ ...panel, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, color: '#fff' }}>
            Item {idx + 1}{' '}
            <span style={{ color: '#71717a', fontWeight: 400 }}>
              (<code>{it.rawName}</code>)
            </span>
          </h2>
          <dl
            style={{
              margin: 0,
              display: 'grid',
              gap: '6px 12px',
              gridTemplateColumns: '140px 1fr',
              fontSize: 13,
            }}
          >
            <dt style={{ color: '#a1a1aa' }}>rawName</dt>
            <dd style={{ margin: 0 }}>{String(it.rawName ?? '')}</dd>

            <dt style={{ color: '#a1a1aa' }}>status</dt>
            <dd style={{ margin: 0 }}>
              <strong style={{ color: '#22d3ee' }}>{String(it.status ?? '')}</strong>
            </dd>

            <dt style={{ color: '#a1a1aa' }}>matchedFood.desc</dt>
            <dd style={{ margin: 0, color: it.matchedFood ? '#bbf7d0' : '#f87171' }}>
              {it.matchedFood?.desc != null
                ? String(it.matchedFood.desc)
                : '— (null / assente se ambiguous o no_match)'}
            </dd>

            <dt style={{ color: '#a1a1aa', alignSelf: 'start' }}>candidates</dt>
            <dd style={{ margin: 0 }}>
              {(it.candidates || []).length === 0 ? (
                <span style={{ color: '#f87171' }}>nessuno</span>
              ) : (
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12,
                    ...mono,
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #3f3f46' }}>
                      <th style={{ padding: '6px 8px' }}>#</th>
                      <th style={{ padding: '6px 8px' }}>score</th>
                      <th style={{ padding: '6px 8px' }}>key</th>
                      <th style={{ padding: '6px 8px' }}>desc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(it.candidates || []).map((c, ci) => (
                      <tr
                        key={`${c.key}-${ci}`}
                        style={{ borderBottom: '1px solid #27272a' }}
                      >
                        <td style={{ padding: '6px 8px', color: '#71717a' }}>{ci}</td>
                        <td style={{ padding: '6px 8px' }}>{c.score}</td>
                        <td style={{ padding: '6px 8px', color: '#93c5fd' }}>{c.key}</td>
                        <td style={{ padding: '6px 8px' }}>{c.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </dd>

            <dt style={{ color: '#a1a1aa' }}>reason</dt>
            <dd style={{ margin: 0, color: '#e4e4e7' }}>{String(it.reason ?? '')}</dd>
          </dl>
        </section>
      ))}

      <section style={{ ...panel }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#fff' }}>
          JSON completo (ultimo «Analizza»)
        </h2>
        <pre
          style={{
            ...mono,
            margin: 0,
            padding: 12,
            background: '#09090b',
            borderRadius: 8,
            overflow: 'auto',
            maxHeight: 'min(70vh, 560px)',
            border: '1px solid #27272a',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {JSON.stringify(lastRun, null, 2)}
        </pre>
        {lastRun.debug != null && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#a1a1aa' }}>
            Campo radice <code style={{ color: '#93c5fd' }}>debug</code>: segmenti comando e
            mealContextKeys (vedi JSON sopra).
          </p>
        )}
      </section>
    </div>
  );
}
