import { useState } from 'react';
import FoodCommandSection from '@/features/salaComandi/components/FoodCommandSection';

const foodDb = {
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

/** Più recenti per primi (findRecentFoodHabit) */
const flatLog = [
  { type: 'food', desc: 'marmellata', qta: 22 },
  { type: 'food', desc: 'pane', qta: 55 },
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

export default function FoodCommandSectionDebug() {
  /** Nessun seed: dopo Analizza + Conferma riflette solo l’array ready passato dall’ultima conferma */
  const [confirmedItems, setConfirmedItems] = useState([]);

  return (
    <div
      style={{
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 560,
      }}
    >
      <h1 style={{ fontSize: 18, marginTop: 0 }}>FoodCommandSection — debug</h1>

      <p style={{ fontSize: 13, color: '#444', marginBottom: 8 }}>
        Suggerimenti da incollare:
      </p>
      <ul style={{ fontSize: 13, marginTop: 0, marginBottom: 20, color: '#333' }}>
        {TEST_INPUTS.map((t) => (
          <li key={t} style={{ marginBottom: 4 }}>
            <code>{t}</code>
          </li>
        ))}
      </ul>

      <FoodCommandSection
        foodDb={foodDb}
        flatLog={flatLog}
        onAddFoods={(items) => setConfirmedItems(items)}
      />

      <h2 style={{ fontSize: 14, marginTop: 28, marginBottom: 8 }}>confirmedItems (JSON)</h2>
      <pre
        style={{
          fontSize: 12,
          padding: 12,
          background: '#f6f8fa',
          border: '1px solid #ddd',
          borderRadius: 6,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(confirmedItems, null, 2)}
      </pre>
    </div>
  );
}
