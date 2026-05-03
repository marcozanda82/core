import { useState } from 'react';
import { parseFoodCommandIntent } from '@/features/salaComandi/engines/foodCommandEngine';
import FoodCommandReview from '@/features/salaComandi/components/FoodCommandReview';

/**
 * @param {object} props
 * @param {Record<string, object>} [props.foodDb]
 * @param {unknown[]} [props.flatLog]
 * @param {(items: object[]) => void} [props.onAddFoods]
 */
export default function FoodCommandSection({ foodDb, flatLog, onAddFoods }) {
  const [input, setInput] = useState('');
  const [commandResult, setCommandResult] = useState(null);

  const analyze = () => {
    const result = parseFoodCommandIntent({
      text: input,
      foodDb:
        foodDb != null && typeof foodDb === 'object' && !Array.isArray(foodDb)
          ? foodDb
          : {},
      flatLog: Array.isArray(flatLog) ? flatLog : [],
    });
    setCommandResult(result);
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
          onConfirm={() => {
            const readyItems = commandResult.items.filter((i) => i.status === 'ready');
            onAddFoods?.(readyItems);
            setCommandResult(null);
            setInput('');
          }}
          onCancel={() => {
            setCommandResult(null);
          }}
        />
      ) : null}
    </div>
  );
}
