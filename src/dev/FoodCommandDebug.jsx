import { useMemo } from 'react';
import { parseFoodCommandIntent } from '@/features/salaComandi/engines/foodCommandEngine';

const foodDbMock = {
  CREA_YOG_GRC: {
    desc: 'yogurt greco',
    kcal: 130,
    prot: 10,
    carb: 4,
    fat: 6,
    defaultQty: 150,
  },
  CREA_YOG_GRC_0: {
    desc: 'yogurt greco 0%',
    kcal: 60,
    prot: 10,
    carb: 6,
    fat: 0,
    defaultQty: 170,
  },
  CREA_CAFFE: {
    desc: 'caffè',
    kcal: 2,
    prot: 0,
    carb: 0,
    fat: 0,
    defaultQty: 30,
  },
  CREA_PANE: {
    desc: 'pane',
    kcal: 250,
    prot: 9,
    carb: 50,
    fat: 2,
    defaultQty: 50,
  },
  CREA_MARM: {
    desc: 'marmellata',
    kcal: 250,
    prot: 0,
    carb: 62,
    fat: 0,
    defaultQty: 20,
  },
  CREA_UOVA: {
    desc: 'uova',
    kcal: 140,
    prot: 12,
    carb: 1,
    fat: 10,
    defaultQty: 100,
  },
};

const flatLogMock = [
  { type: 'food', desc: 'yogurt greco', qta: 200 },
  { type: 'food', desc: 'caffè', qta: 25 },
];

const TEST_INPUTS = [
  'yogurt greco 170g',
  'un caffè',
  'pane e marmellata',
  '2 uova',
  'kefir proteico xyz',
];

function runAll() {
  return TEST_INPUTS.map((text) => ({
    text,
    result: parseFoodCommandIntent({
      text,
      foodDb: foodDbMock,
      flatLog: flatLogMock,
      mealContext: null,
    }),
  }));
}

const box = {
  border: '1px solid #333',
  borderRadius: 8,
  padding: 12,
  marginBottom: 16,
  background: '#111',
  color: '#e5e5e5',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
};

const h2 = { margin: '0 0 12px', fontSize: 16, color: '#fff' };
const muted = { color: '#888', fontSize: 12 };

/**
 * Pagina temporanea per validare parseFoodCommandIntent in dev (Vite).
 * Montaggio: in App.jsx usa `return <FoodCommandDebug />` oppure React Router solo in dev.
 */
export default function FoodCommandDebug() {
  const rows = useMemo(() => runAll(), []);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Food Command Debug</h1>

      {rows.map(({ text, result }) => (
        <div key={text} style={box}>
          <h2 style={h2}>{text}</h2>
          <p style={{ margin: '4px 0' }}>
            <strong>input:</strong>{' '}
            <code style={{ color: '#7dd3fc' }}>{JSON.stringify(text)}</code>
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>status globale:</strong> {result.status}
          </p>
          <ul style={{ margin: '12px 0 0', paddingLeft: 20 }}>
            {(result.items || []).map((it, idx) => (
              <li key={`${text}-${idx}`} style={{ marginBottom: 10 }}>
                <div>
                  rawName: <strong>{it.rawName}</strong>
                </div>
                <div style={muted}>status: {it.status}</div>
                <div style={muted}>quantity: {it.quantity === null ? 'null' : String(it.quantity)}</div>
                <div style={muted}>
                  suggestedQuantity:{' '}
                  {it.suggestedQuantity === null || it.suggestedQuantity === undefined
                    ? '—'
                    : String(it.suggestedQuantity)}
                </div>
                <div style={muted}>quantitySource: {it.quantitySource ?? '—'}</div>
                <div style={muted}>matchedFood.desc: {it.matchedFood?.desc ?? '—'}</div>
                <div style={muted}>candidates.length: {Array.isArray(it.candidates) ? it.candidates.length : 0}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
