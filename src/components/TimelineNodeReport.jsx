import React from 'react';
import { ghostMealModalFoodRows } from '../features/salaComandi/utils/foodUtils';
import { getMealTimeFromLogItem } from '../features/salaComandi/utils/timelineUtils';

/**
 * Fullscreen overlay: timeline node meal/workout detail (formerly inline in SalaComandi).
 */
export default function TimelineNodeReport({
  report,
  activeLog,
  displayTime,
  currentTime,
  onClose,
  getFoodItemsForMealSlot,
  expandedRecipes,
  toggleRecipe,
  setSelectedFoodForInfo,
  setInspectedFood,
  setEditFoodData,
  onEditFromReport,
}) {
  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.8)',
        zIndex: 100020,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1e1e1e',
          color: '#fff',
          padding: '25px',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}
      >
        <h2
          style={{
            margin: '0 0 20px 0',
            borderBottom: '1px solid #333',
            paddingBottom: '10px',
            color: '#00e5ff',
          }}
        >
          {report.type === 'meal' || report.type === 'ghost_meal'
            ? '🍽️ Dettaglio Pasto'
            : '💪 Dettaglio Attività'}
        </h2>
        {(() => {
          const mealSlotKey = String(report.mealId || report.id);
          const nodeTime =
            report.type === 'meal' || report.type === 'ghost_meal'
              ? typeof report.time === 'number' && !Number.isNaN(report.time)
                ? report.time
                : (() => {
                    const list = getFoodItemsForMealSlot(activeLog || [], mealSlotKey);
                    const t = list[0] != null ? getMealTimeFromLogItem(list[0]) : null;
                    return t != null ? t : 12;
                  })()
              : report.time ?? 12;
          const currentHour = displayTime ?? currentTime;
          const isFuture = nodeTime > currentHour;
          return (
            <div style={{ marginBottom: '16px' }}>
              {isFuture ? (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    letterSpacing: '1px',
                    background: 'rgba(0, 229, 255, 0.15)',
                    color: '#00e5ff',
                    border: '1px solid #00e5ff',
                  }}
                >
                  🔮 PIANIFICAZIONE (Futuro)
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    letterSpacing: '1px',
                    background: '#2c2c2c',
                    color: '#9e9e9e',
                    border: '1px solid #555',
                  }}
                >
                  ⏳ STORICO (Avvenuto)
                </span>
              )}
            </div>
          );
        })()}
        {report.isGhost === true ||
        report.type === 'ghost_meal' ||
        report.type === 'ghost_workout' ? (
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(0, 229, 255, 0.35)',
                background: 'rgba(0, 229, 255, 0.08)',
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: '1.35rem' }} aria-hidden>
                🎯
              </span>
              <span
                style={{
                  color: '#00e5ff',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  letterSpacing: '0.02em',
                }}
              >
                Pianificato da Kentu
              </span>
            </div>
            {report.name || report.title ? (
              <p style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontWeight: 700, color: '#e8faff' }}>
                {report.name || report.title}
              </p>
            ) : null}
            <div
              style={{
                fontSize: '0.95rem',
                lineHeight: 1.65,
                color: 'rgba(230, 245, 255, 0.92)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {String(report.microDesc || '').trim() || (
                <span style={{ color: '#888', fontStyle: 'italic' }}>Nessuna nota biochimica per questo slot.</span>
              )}
            </div>
            {report.isGhost === true || report.type === 'ghost_meal' ? (
              (() => {
                if (report.type === 'ghost_workout') return null;
                const rows = ghostMealModalFoodRows(report);
                const toN = (v) => {
                  const n = Number(v);
                  return Number.isFinite(n) ? n : 0;
                };
                const totals = rows.reduce(
                  (acc, f) => ({
                    kcal: acc.kcal + toN(f.kcal),
                    prot: acc.prot + toN(f.prot),
                    carb: acc.carb + toN(f.carb),
                    fat: acc.fat + toN(f.fat),
                  }),
                  { kcal: 0, prot: 0, carb: 0, fat: 0 },
                );
                return (
                  <div style={{ marginTop: 16, marginBottom: 4 }}>
                    <div
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: '#7dd3fc',
                        marginBottom: 8,
                        letterSpacing: '0.06em',
                      }}
                    >
                      Alimenti
                    </div>
                    {rows.length === 0 ? (
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.38)',
                          fontStyle: 'italic',
                          fontSize: '0.9rem',
                        }}
                      >
                        Empty meal
                      </span>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '10px 16px',
                            padding: '10px 12px',
                            marginBottom: 12,
                            background: 'rgba(0, 229, 255, 0.08)',
                            borderRadius: 10,
                            border: '1px solid rgba(0, 229, 255, 0.22)',
                            fontSize: '0.78rem',
                            color: '#bae6fd',
                          }}
                        >
                          <span>
                            <strong style={{ color: '#e0f2fe' }}>Tot.</strong> {Math.round(totals.kcal)} kcal
                          </span>
                          <span>P {Math.round(totals.prot * 10) / 10} g</span>
                          <span>C {Math.round(totals.carb * 10) / 10} g</span>
                          <span>F {Math.round(totals.fat * 10) / 10} g</span>
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                          {rows.map((f, i) => {
                            const name = String(f.name || '').trim() || 'Alimento';
                            const qty = Math.round(toN(f.qty));
                            const hasQty = qty > 0;
                            return (
                              <div
                                key={`ghost_meal_row_${i}_${name.slice(0, 24)}`}
                                style={{
                                  padding: '10px 0',
                                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                                  fontSize: '0.85rem',
                                }}
                              >
                                <div style={{ fontWeight: 600, color: '#e8f4ff' }}>{name}</div>
                                <div
                                  style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '10px 14px',
                                    marginTop: 4,
                                    color: '#94a3b8',
                                    fontSize: '0.78rem',
                                  }}
                                >
                                  <span>{hasQty ? `${qty} g` : '—'}</span>
                                  <span>{Math.round(toN(f.kcal)) || '—'} kcal</span>
                                  <span>P {toN(f.prot) ? Math.round(toN(f.prot) * 10) / 10 : '—'} g</span>
                                  <span>C {toN(f.carb) ? Math.round(toN(f.carb) * 10) / 10 : '—'} g</span>
                                  <span>F {toN(f.fat) ? Math.round(toN(f.fat) * 10) / 10 : '—'} g</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()
            ) : null}
          </div>
        ) : report.type === 'meal' ? (
          <div>
            {(() => {
              const slotKey = String(report.mealId || report.id);
              const items =
                Array.isArray(report.items) && report.items.length > 0
                  ? report.items
                  : Array.isArray(report.foods) && report.foods.length > 0
                    ? report.foods
                    : getFoodItemsForMealSlot(activeLog || [], slotKey);
              if (items.length === 0) return <p>Nessun alimento trovato.</p>;

              const totals = items.reduce(
                (acc, item) => {
                  acc.kcal += parseFloat(item.kcal || item.cal || 0);
                  acc.prot += parseFloat(item.prot || 0);
                  acc.carb += parseFloat(item.carb || 0);
                  acc.fat += parseFloat(item.fatTotal || item.fat || 0);
                  return acc;
                },
                { kcal: 0, prot: 0, carb: 0, fat: 0 },
              );

              return (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '20px',
                      background: '#2c2c2c',
                      padding: '15px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                    }}
                  >
                    <span style={{ color: '#ff9800' }}>🔥 {Math.round(totals.kcal)} kcal</span>
                    <span style={{ color: '#f44336' }}>🥩 {Math.round(totals.prot)}g</span>
                    <span style={{ color: '#4caf50' }}>🍞 {Math.round(totals.carb)}g</span>
                    <span style={{ color: '#ffeb3b' }}>🥑 {Math.round(totals.fat)}g</span>
                  </div>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: '0 0 25px 0',
                      maxHeight: '280px',
                      overflowY: 'auto',
                    }}
                  >
                    {items.map((item) => {
                      const recipeExpandableModal =
                        (item.type === 'recipe' || item.isRecipe === true) &&
                        Array.isArray(item.ingredients) &&
                        item.ingredients.length > 0;
                      const rk = item.id != null ? String(item.id) : '';
                      const recipeOpenModal = rk && !!expandedRecipes[rk];
                      return (
                        <li key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #333' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '6px',
                                minWidth: 0,
                              }}
                            >
                              {item.name || item.desc}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedFoodForInfo(item);
                                }}
                                title="Etichetta nutrizionale"
                                aria-label="Etichetta nutrizionale"
                                style={{
                                  opacity: 0.4,
                                  background: 'none',
                                  border: 'none',
                                  color: '#94a3b8',
                                  cursor: 'pointer',
                                  fontSize: '0.65rem',
                                  padding: '0 4px',
                                  lineHeight: 1,
                                  fontWeight: 600,
                                }}
                              >
                                ℹ
                              </button>
                              {recipeExpandableModal && (
                                <button
                                  type="button"
                                  onClick={() => toggleRecipe(item.id)}
                                  aria-expanded={recipeOpenModal}
                                  aria-label={
                                    recipeOpenModal ? 'Nascondi ingredienti' : 'Mostra ingredienti'
                                  }
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#888',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    padding: '2px 6px',
                                  }}
                                >
                                  {recipeOpenModal ? '▲' : '▼'}
                                </button>
                              )}
                            </span>
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexShrink: 0,
                              }}
                            >
                              <span style={{ color: '#aaa' }}>{item.qta || item.weight}g</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInspectedFood(item);
                                  setEditFoodData({ ...item });
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#00e5ff',
                                  cursor: 'pointer',
                                  fontSize: '1.2rem',
                                  padding: '0 5px',
                                }}
                                title="Ispeziona/Modifica Nutrienti"
                              >
                                🔍
                              </button>
                            </span>
                          </div>
                          {recipeExpandableModal && recipeOpenModal && (
                            <div
                              style={{
                                marginTop: '8px',
                                marginLeft: '4px',
                                paddingLeft: '12px',
                                paddingTop: '6px',
                                paddingBottom: '6px',
                                borderLeft: '2px solid #444',
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: '0 8px 8px 0',
                              }}
                            >
                              {item.ingredients.map((ing, ingIdx) => {
                                const w = Number(ing.weight);
                                const wg = Number.isFinite(w) ? `${Math.round(w)}g` : '—';
                                const kc = Math.round(Number(ing.kcal) || 0);
                                const p = Number(ing.prot);
                                const c = Number(ing.carb);
                                const g = Number(ing.fat);
                                const nm = ing.name != null ? String(ing.name) : 'Ingrediente';
                                return (
                                  <div
                                    key={ing.id != null ? String(ing.id) : `ding_${ingIdx}`}
                                    style={{
                                      fontSize: '0.85rem',
                                      color: '#aaa',
                                      lineHeight: 1.45,
                                      marginBottom: ingIdx < item.ingredients.length - 1 ? '6px' : 0,
                                    }}
                                  >
                                    {nm} · {wg} · {kc} kcal · P {(Number.isFinite(p) ? p : 0).toFixed(1)}g · C{' '}
                                    {(Number.isFinite(c) ? c : 0).toFixed(1)}g · G {(Number.isFinite(g) ? g : 0).toFixed(1)}g
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              );
            })()}
          </div>
        ) : (
          <div style={{ marginBottom: '25px', fontSize: '1.1rem', lineHeight: '1.8' }}>
            <p style={{ margin: '5px 0' }}>
              <strong>Attività:</strong> {report.name || report.desc || 'Allenamento'}
            </p>
            <p style={{ margin: '5px 0' }}>
              <strong>Impatto:</strong> 🔥 {Math.round(report.kcal || report.cal || 0)} kcal bruciate
            </p>
            {report.duration != null && (
              <p style={{ margin: '5px 0' }}>
                <strong>Durata:</strong> ⏱️ {Math.round(report.duration * 60)} minuti
              </p>
            )}
            {(report.muscles || report.workoutMuscles) &&
              (report.muscles || report.workoutMuscles).length > 0 && (
                <p style={{ margin: '5px 0', textTransform: 'capitalize' }}>
                  <strong>Muscoli target:</strong> 🦾 {(report.muscles || report.workoutMuscles).join(', ')}
                </p>
              )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '15px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              background: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
            }}
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={() => onEditFromReport(report)}
            style={{
              flex: 1,
              padding: '12px',
              background: '#00e5ff',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
            }}
          >
            ✏️ Modifica
          </button>
        </div>
      </div>
    </div>
  );
}
