import { useState, useRef } from 'react';
import { parseFoodCommandIntent } from '@/features/salaComandi/engines/foodCommandEngine';
import FoodCommandReview from '@/features/salaComandi/components/FoodCommandReview';

function cloneSerializable(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fallback */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {object} props
 * @param {Record<string, object>} [props.foodDb]
 * @param {unknown[]} [props.flatLog]
 * @param {(items: object[]) => void} [props.onAddFoods]
 */
export default function FoodCommandSection({ foodDb, flatLog, onAddFoods }) {
  const [input, setInput] = useState('');
  const [commandResult, setCommandResult] = useState(null);
  /** Snapshot dell’ultimo parse (stesso contenuto mostrato in review); la Conferma legge questo, non stato potenzialmente desincronizzato. */
  const reviewSnapshotRef = useRef(null);

  const analyze = () => {
    const text = input == null ? '' : String(input);
    const parsed = parseFoodCommandIntent({
      text,
      foodDb:
        foodDb != null && typeof foodDb === 'object' && !Array.isArray(foodDb)
          ? foodDb
          : {},
      flatLog: Array.isArray(flatLog) ? flatLog : [],
    });
    const frozen = cloneSerializable(parsed);
    reviewSnapshotRef.current = frozen;
    setCommandResult(frozen);
  };

  const wrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxWidth: 480,
    width: '100%',
  };

  const rowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  };

  const inputStyle = {
    flex: '1 1 200px',
    minWidth: 160,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontFamily: 'inherit',
    fontSize: 14,
  };

  const buttonStyle = {
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid #999',
    background: '#f5f5f5',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
  };

  return (
    <div style={wrapStyle}>
      <div style={rowStyle}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Es. yogurt greco 170g"
          aria-label="Comando pasto"
          style={inputStyle}
        />
        <button type="button" style={buttonStyle} onClick={analyze}>
          Analizza
        </button>
      </div>

      {commandResult != null ? (
        <FoodCommandReview
          data={commandResult}
          foodDb={
            foodDb != null && typeof foodDb === 'object' && !Array.isArray(foodDb)
              ? foodDb
              : undefined
          }
          onConfirm={(confirmedItems) => {
            onAddFoods?.(cloneSerializable(confirmedItems));
            reviewSnapshotRef.current = null;
            setCommandResult(null);
            setInput('');
          }}
          onCancel={() => {
            reviewSnapshotRef.current = null;
            setCommandResult(null);
          }}
        />
      ) : null}
    </div>
  );
}
