import React, { useMemo } from 'react';
import { computeTotali, DEFAULT_TARGETS, getTargetForNutrient } from './useBiochimico';

const SUGAR_KEYS = ['zuccheri', 'sugars', 'sugar'];

function sumSugarFromLog(log) {
  let s = 0;
  (log || []).forEach((item) => {
    if (item.type !== 'food' && item.type !== 'recipe') return;
    SUGAR_KEYS.forEach((k) => {
      const n = Number(item[k]);
      if (Number.isFinite(n)) s += n;
    });
  });
  return s;
}

function mergeUserTargets(userTargets) {
  return { ...DEFAULT_TARGETS, ...(userTargets || {}) };
}

function ProgressRow({ label, current, target, unit, color }) {
  const t = Number(target);
  const c = Number(current) || 0;
  const pct = t > 0 ? Math.min(100, (c / t) * 100) : 0;
  const over = t > 0 && c > t;
  const barColor = over ? '#f87171' : color;
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px', gap: '8px' }}>
        <span style={{ fontSize: '0.78rem', color: '#d1d5db', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: '#fff' }}>
            {Math.round(c * 10) / 10}
            {unit ? ` ${unit}` : ''}
          </span>
          {t > 0 ? (
            <>
              {' / '}
              {Math.round(t * 10) / 10}
              {unit ? ` ${unit}` : ''}
            </>
          ) : null}
        </span>
      </div>
      <div
        style={{
          height: '8px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${t > 0 ? pct : Math.min(100, c > 0 ? 100 : 0)}%`,
            borderRadius: '999px',
            background: barColor,
            boxShadow: over ? '0 0 12px rgba(248,113,113,0.35)' : `0 0 10px ${color}44`,
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Drawer / modale: telemetria giornaliera macro + micro selezionati vs target utente.
 */
export default function DailyMacroSheet({ open, onClose, dailyLog, userTargets, dailyKcalTarget }) {
  const { totali, sugarSum, tgt, kcalTarget, sugarTarget } = useMemo(() => {
    const log = dailyLog || [];
    const t = computeTotali(log);
    const sugar = sumSugarFromLog(log);
    const merged = mergeUserTargets(userTargets);
    const kT =
      dailyKcalTarget != null && Number.isFinite(Number(dailyKcalTarget))
        ? Number(dailyKcalTarget)
        : Number(merged.kcal ?? 2000);
    const sugarT =
      merged.zuccheri != null && Number.isFinite(Number(merged.zuccheri))
        ? Number(merged.zuccheri)
        : merged.sugars != null && Number.isFinite(Number(merged.sugars))
          ? Number(merged.sugars)
          : 50;
    return { totali: t, sugarSum: sugar, tgt: merged, kcalTarget: kT, sugarTarget: sugarT };
  }, [dailyLog, userTargets, dailyKcalTarget]);

  if (!open) return null;

  const fatCurrent = Number(totali.fatTotal ?? totali.fat ?? 0) || 0;
  const fatTarget =
    tgt.fatTotal != null
      ? Number(tgt.fatTotal)
      : tgt.fat != null
        ? Number(tgt.fat)
        : Number(DEFAULT_TARGETS.fatTotal);

  const naTarget = tgt.na != null ? Number(tgt.na) : getTargetForNutrient('na') ?? 2000;
  const kTarget = tgt.k != null ? Number(tgt.k) : getTargetForNutrient('k') ?? 3400;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.82)',
        zIndex: 100045,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: 0,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        style={{
          maxHeight: 'min(88vh, 560px)',
          background: 'linear-gradient(180deg, #16161a 0%, #0e0e10 100%)',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          border: '1px solid #2a2a30',
          borderBottom: 'none',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="daily-macro-title"
      >
        <div
          style={{
            width: '36px',
            height: '4px',
            borderRadius: '2px',
            background: '#3f3f46',
            margin: '10px auto 6px',
            flexShrink: 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 20px 16px',
            borderBottom: '1px solid #25252b',
            flexShrink: 0,
          }}
        >
          <h2 id="daily-macro-title" style={{ margin: 0, fontSize: '0.95rem', color: '#00e5ff', letterSpacing: '0.08em', fontWeight: 800 }}>
            Raggi X giornalieri
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '1.2rem', cursor: 'pointer', padding: '6px' }}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '18px 20px 28px', WebkitOverflowScrolling: 'touch' }}>
          <p style={{ margin: '0 0 18px', fontSize: '0.72rem', color: '#71717a', lineHeight: 1.45 }}>
            Totali da diario (alimenti e ricette) rispetto ai tuoi obiettivi. I valori dipendono dai dati presenti nel database alimenti.
          </p>
          <ProgressRow label="Calorie" current={totali.kcal} target={kcalTarget} unit="kcal" color="#ff6b00" />
          <ProgressRow label="Proteine" current={totali.prot} target={tgt.prot ?? DEFAULT_TARGETS.prot} unit="g" color="#b666d2" />
          <ProgressRow label="Carboidrati" current={totali.carb} target={tgt.carb ?? DEFAULT_TARGETS.carb} unit="g" color="#00ff88" />
          <ProgressRow label="Grassi" current={fatCurrent} target={fatTarget} unit="g" color="#ffd700" />
          <ProgressRow label="Fibre" current={totali.fibre} target={tgt.fibre ?? DEFAULT_TARGETS.fibre} unit="g" color="#38bdf8" />
          <ProgressRow label="Zuccheri (stimati)" current={sugarSum} target={sugarTarget} unit="g" color="#fb923c" />
          <ProgressRow label="Sodio" current={totali.na} target={naTarget} unit="mg" color="#94a3b8" />
          <ProgressRow label="Potassio" current={totali.k} target={kTarget} unit="mg" color="#a78bfa" />
        </div>
      </div>
    </div>
  );
}
