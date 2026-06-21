import React, { useMemo, useState } from 'react';
import {
  MealComposerProvider,
  useMealComposer,
} from '../context/MealComposerContext';
import { usePredictiveFoodBlocks } from '../hooks/usePredictiveFoodBlocks';
import { usePredictiveMealCombos } from '../hooks/usePredictiveMealCombos';
import { buildRecipeGroupFromCombo } from '../utils/recipeGroupUtils';

const MEAL_SLOTS = [
  { id: 'colazione', label: 'Colazione' },
  { id: 'pranzo', label: 'Pranzo' },
  { id: 'cena', label: 'Cena' },
];

const trackerStoricoKey = (date) => `trackerStorico_${date}`;

function mockDayOffset(offset) {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

function mockFood({
  desc,
  foodDbKey,
  qta,
  weight,
  kcal,
  prot,
  carb,
  fat,
  qtyLabel,
}) {
  return {
    type: 'food',
    desc,
    foodDbKey,
    qta,
    weight: weight ?? qta,
    kcal,
    cal: kcal,
    prot,
    carb,
    fat,
    fatTotal: fat,
    qtyLabel,
  };
}

/** Simula l'albero tracker_data Firebase con log nested (meal/items) e voci flat. */
function buildMockFullHistory() {
  const day = mockDayOffset;

  return {
    [trackerStoricoKey(day(-6))]: {
      data: day(-6),
      mealTimes: { colazione: 8, pranzo: 13 },
      log: [
        {
          type: 'meal',
          mealId: 'colazione',
          desc: 'Colazione',
          items: [
            mockFood({
              desc: 'Uova',
              foodDbKey: 'uova',
              qta: 120,
              kcal: 186,
              prot: 15,
              carb: 1,
              fat: 12,
              qtyLabel: '2 uova',
            }),
            mockFood({
              desc: 'Avena',
              foodDbKey: 'avena',
              qta: 50,
              kcal: 190,
              prot: 7,
              carb: 34,
              fat: 3,
            }),
          ],
        },
        { type: 'workout', id: 'w1', desc: 'Corsa', kcal: 320 },
      ],
    },
    [trackerStoricoKey(day(-5))]: {
      data: day(-5),
      log: [
        {
          type: 'meal',
          mealId: 'pranzo',
          desc: 'Pranzo',
          items: [
            mockFood({
              desc: 'Petto di Pollo',
              foodDbKey: 'pollo_petto',
              qta: 200,
              kcal: 330,
              prot: 62,
              carb: 0,
              fat: 7,
            }),
            mockFood({
              desc: 'Riso Basmati',
              foodDbKey: 'riso_basmati',
              qta: 80,
              kcal: 280,
              prot: 6,
              carb: 62,
              fat: 1,
            }),
            mockFood({
              desc: 'Olio EVO',
              foodDbKey: 'olio_evo',
              qta: 15,
              kcal: 132,
              prot: 0,
              carb: 0,
              fat: 15,
            }),
          ],
        },
      ],
    },
    [trackerStoricoKey(day(-4))]: {
      data: day(-4),
      log: [
        {
          ...mockFood({
            desc: 'Uova',
            foodDbKey: 'uova',
            qta: 120,
            kcal: 186,
            prot: 15,
            carb: 1,
            fat: 12,
            qtyLabel: '2 uova',
          }),
          mealType: 'colazione',
        },
        {
          ...mockFood({
            desc: 'Yogurt greco',
            foodDbKey: 'yogurt',
            qta: 150,
            kcal: 135,
            prot: 18,
            carb: 6,
            fat: 4,
          }),
          mealType: 'colazione',
        },
        {
          type: 'meal',
          mealId: 'pranzo',
          desc: 'Pranzo',
          items: [
            mockFood({
              desc: 'Petto di Pollo',
              foodDbKey: 'pollo_petto',
              qta: 200,
              kcal: 330,
              prot: 62,
              carb: 0,
              fat: 7,
            }),
            mockFood({
              desc: 'Riso Basmati',
              foodDbKey: 'riso_basmati',
              qta: 80,
              kcal: 280,
              prot: 6,
              carb: 62,
              fat: 1,
            }),
          ],
        },
      ],
    },
    [trackerStoricoKey(day(-3))]: {
      data: day(-3),
      log: [
        {
          type: 'meal',
          mealId: 'colazione',
          desc: 'Colazione',
          items: [
            mockFood({
              desc: 'Uova',
              foodDbKey: 'uova',
              qta: 120,
              kcal: 186,
              prot: 15,
              carb: 1,
              fat: 12,
              qtyLabel: '2 uova',
            }),
            mockFood({
              desc: 'Caffè',
              foodDbKey: 'caffe',
              qta: 200,
              kcal: 4,
              prot: 0,
              carb: 0,
              fat: 0,
            }),
          ],
        },
        {
          type: 'meal',
          mealId: 'cena',
          desc: 'Cena',
          items: [
            mockFood({
              desc: 'Salmone',
              foodDbKey: 'salmone',
              qta: 150,
              kcal: 312,
              prot: 34,
              carb: 0,
              fat: 18,
            }),
          ],
        },
      ],
    },
    [trackerStoricoKey(day(-2))]: {
      data: day(-2),
      log: [
        {
          type: 'meal',
          mealId: 'colazione',
          desc: 'Colazione',
          items: [
            mockFood({
              desc: 'Uova',
              foodDbKey: 'uova',
              qta: 120,
              kcal: 186,
              prot: 15,
              carb: 1,
              fat: 12,
              qtyLabel: '2 uova',
            }),
            mockFood({
              desc: 'Avena',
              foodDbKey: 'avena',
              qta: 50,
              kcal: 190,
              prot: 7,
              carb: 34,
              fat: 3,
            }),
          ],
        },
        {
          ...mockFood({
            desc: 'Petto di Pollo',
            foodDbKey: 'pollo_petto',
            qta: 200,
            kcal: 330,
            prot: 62,
            carb: 0,
            fat: 7,
          }),
          mealType: 'pranzo',
        },
        {
          type: 'meal',
          mealId: 'cena',
          desc: 'Cena',
          items: [
            mockFood({
              desc: 'Salmone',
              foodDbKey: 'salmone',
              qta: 150,
              kcal: 312,
              prot: 34,
              carb: 0,
              fat: 18,
            }),
            mockFood({
              desc: 'Patate',
              foodDbKey: 'patate',
              qta: 200,
              kcal: 154,
              prot: 4,
              carb: 34,
              fat: 0,
            }),
          ],
        },
      ],
    },
    [trackerStoricoKey(day(-1))]: {
      data: day(-1),
      log: [
        {
          type: 'single',
          mealType: 'colazione',
          desc: 'Uova',
          foodDbKey: 'uova',
          qta: 120,
          weight: 120,
          kcal: 186,
          cal: 186,
          prot: 15,
          carb: 1,
          fat: 12,
          qtyLabel: '2 uova',
        },
        {
          type: 'single',
          mealType: 'colazione',
          desc: 'Avena',
          foodDbKey: 'avena',
          qta: 50,
          weight: 50,
          kcal: 190,
          cal: 190,
          prot: 7,
          carb: 34,
          fat: 3,
        },
        {
          type: 'single',
          mealType: 'colazione',
          desc: 'Caffè',
          foodDbKey: 'caffe',
          qta: 200,
          weight: 200,
          kcal: 4,
          cal: 4,
          prot: 0,
          carb: 0,
          fat: 0,
        },
        {
          type: 'meal',
          mealId: 'pranzo',
          desc: 'Pranzo',
          items: [
            mockFood({
              desc: 'Petto di Pollo',
              foodDbKey: 'pollo_petto',
              qta: 200,
              kcal: 330,
              prot: 62,
              carb: 0,
              fat: 7,
            }),
            mockFood({
              desc: 'Petto di Pollo',
              foodDbKey: 'pollo_petto',
              qta: 180,
              kcal: 297,
              prot: 56,
              carb: 0,
              fat: 6,
            }),
            mockFood({
              desc: 'Riso Basmati',
              foodDbKey: 'riso_basmati',
              qta: 80,
              kcal: 280,
              prot: 6,
              carb: 62,
              fat: 1,
            }),
            mockFood({
              desc: 'Olio EVO',
              foodDbKey: 'olio_evo',
              qta: 15,
              kcal: 132,
              prot: 0,
              carb: 0,
              fat: 15,
            }),
          ],
        },
        {
          type: 'meal',
          mealId: 'cena',
          desc: 'Cena',
          items: [
            mockFood({
              desc: 'Patate',
              foodDbKey: 'patate',
              qta: 200,
              kcal: 154,
              prot: 4,
              carb: 34,
              fat: 0,
            }),
          ],
        },
      ],
    },
    [trackerStoricoKey(day(0))]: {
      data: day(0),
      log: [
        {
          type: 'meal',
          mealId: 'colazione',
          desc: 'Colazione',
          items: [
            mockFood({
              desc: 'Uova',
              foodDbKey: 'uova',
              qta: 120,
              kcal: 186,
              prot: 15,
              carb: 1,
              fat: 12,
              qtyLabel: '2 uova',
            }),
          ],
        },
        {
          type: 'meal',
          mealId: 'pranzo',
          desc: 'Pranzo',
          items: [
            mockFood({
              desc: 'Petto di Pollo',
              foodDbKey: 'pollo_petto',
              qta: 180,
              kcal: 297,
              prot: 56,
              carb: 0,
              fat: 6,
            }),
          ],
        },
        {
          type: 'meal',
          mealId: 'cena',
          desc: 'Cena',
          items: [
            mockFood({
              desc: 'Salmone',
              foodDbKey: 'salmone',
              qta: 150,
              kcal: 312,
              prot: 34,
              carb: 0,
              fat: 18,
            }),
          ],
        },
      ],
    },
  };
}

function formatDraftQuantity(food) {
  if (food.qtyLabel) return food.qtyLabel;
  const qta = Number(food.qta ?? food.weight);
  if (!Number.isFinite(qta) || qta <= 0) return '—';
  return `${qta}g`;
}

function formatComboItemPreview(item) {
  if (item.qtyLabel) return `${item.desc} · ${item.qtyLabel}`;
  if (item.unit === 'g' && item.qta) return `${item.desc} · ${item.qta}g`;
  if (item.qta) return `${item.desc} · ${item.qta}`;
  return item.desc;
}

function MealBlocksSandboxContent() {
  const [selectedSlot, setSelectedSlot] = useState('colazione');
  const mockFullHistory = useMemo(() => buildMockFullHistory(), []);
  const { draftFoods, status, addRecipeGroupToDraft, clearDraft } = useMealComposer();
  const predictiveCombos = usePredictiveMealCombos(mockFullHistory, selectedSlot);
  const predictiveBlocks = usePredictiveFoodBlocks(mockFullHistory, selectedSlot, 6);

  const handleConfirm = () => {
    console.log('Salvataggio in corso...', draftFoods);
    clearDraft();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-[#050a12] text-slate-100">
      <header className="border-b border-slate-800 px-4 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400/80">
          Sandbox
        </p>
        <h1 className="mt-1 text-xl font-semibold">Meal Builder a Blocchi</h1>
        <p className="mt-1 text-sm text-slate-400">
          One-Tap Logging · stato: <span className="text-slate-200">{status}</span>
        </p>

        <div className="mt-4 flex rounded-xl border border-slate-700/80 bg-slate-900/60 p-1">
          {MEAL_SLOTS.map((slot) => {
            const isActive = selectedSlot === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => setSelectedSlot(slot.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {slot.label}
              </button>
            );
          })}
        </div>
      </header>

      <section className="flex-1 space-y-6 px-4 py-5">
        <div>
          <h2 className="mb-1 text-sm font-medium text-slate-300">Pasti Frequenti</h2>
          <p className="mb-3 text-xs text-slate-500">
            One-tap assoluto · {predictiveCombos.length}{' '}
            {predictiveCombos.length === 1 ? 'combo' : 'combo'}
          </p>

          {predictiveCombos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
              Nessun pasto completo frequente per questo slot
            </p>
          ) : (
            <div className="space-y-3">
              {predictiveCombos.map((combo) => (
                <button
                  key={combo.id}
                  type="button"
                  onClick={() => {
                    const payload = buildRecipeGroupFromCombo(combo);
                    if (payload) addRecipeGroupToDraft(payload);
                  }}
                  className="w-full rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 to-slate-900/90 px-4 py-4 text-left shadow-md transition-all hover:border-cyan-400/50 hover:shadow-lg active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400/90">
                        Pasto completo
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-100">
                        {combo.name}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-cyan-500/15 px-2.5 py-1 text-sm font-semibold text-cyan-300">
                      {combo.totalKcal} kcal
                    </span>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {combo.items.map((item) => (
                      <li
                        key={`${combo.id}-${item.desc}`}
                        className="rounded-full border border-slate-700/80 bg-slate-950/50 px-2.5 py-1 text-xs text-slate-300"
                      >
                        {formatComboItemPreview(item)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-slate-400">
                    Tap per aggiungere la combo come un unico alimento
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-1 text-sm font-medium text-slate-300">Alimenti Rapidi</h2>
          <p className="mb-3 text-xs text-slate-500">
            Singoli ingredienti · {predictiveBlocks.length}{' '}
            {predictiveBlocks.length === 1 ? 'blocco' : 'blocchi'}
          </p>

          {predictiveBlocks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-8 text-center text-sm text-slate-500">
              Nessun alimento frequente per questo slot
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {predictiveBlocks.map((tile) => (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => addFoodToDraft(tile)}
                  className="flex min-h-[5.5rem] flex-col items-start justify-center rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-left shadow-sm transition-all hover:border-cyan-500/40 hover:bg-slate-800/90 hover:shadow-md active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                >
                  <span className="text-sm font-semibold leading-snug text-slate-100">
                    {tile.label}
                  </span>
                  <span className="mt-1 text-xs text-slate-400">
                    {tile.kcal} kcal · ×{tile.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-950/60 px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">Bozza pasto</h2>
          <span className="text-xs text-slate-500">
            {draftFoods.length} {draftFoods.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {draftFoods.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-6 text-center text-sm text-slate-500">
            Tappa una piastrella per iniziare
          </p>
        ) : (
          <ul className="mb-4 space-y-2">
            {draftFoods.map((food) => (
              <li
                key={food.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5"
              >
                <span className="text-sm font-medium text-slate-100">
                  {food.desc || food.name || 'Alimento'}
                </span>
                <span className="text-sm text-slate-400">
                  {formatDraftQuantity(food)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={draftFoods.length === 0}
          className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          CONFERMA (TEST)
        </button>
      </section>
    </div>
  );
}

export default function MealBlocksSandbox() {
  return (
    <MealComposerProvider initialMealType="pranzo" initialMealTime={13.5}>
      <MealBlocksSandboxContent />
    </MealComposerProvider>
  );
}
