import { useCallback, useEffect, useMemo, useRef } from 'react';
import { TARGETS } from '../useBiochimico';

/** Stesso identico shell dei macro originali — 3 card visibili + peek 4ª/5ª. */
const CHIP_CLASS =
  'home-oggi-macros__chip flex-none w-[30%] min-w-[100px] max-w-[130px] snap-start rounded-xl border backdrop-blur-sm bg-gradient-to-r from-cyan-950/70 via-slate-800/60 to-orange-950/50 shadow-lg px-3 py-2.5 text-center overflow-hidden cursor-pointer transition-transform active:scale-[0.99]';

const VITAMIN_KEYS = Object.keys(TARGETS.vit);

/**
 * @param {Record<string, number>} totali
 * @param {Record<string, number>} targets
 * @returns {number}
 */
function vitaminCompletionPct(totali, targets) {
  let sum = 0;
  VITAMIN_KEYS.forEach((key) => {
    const target = Number(targets[key] ?? TARGETS.vit[key]) || 0;
    const current = Number(totali[key]) || 0;
    if (target <= 0) return;
    sum += Math.min(100, (current / target) * 100);
  });
  return VITAMIN_KEYS.length > 0 ? Math.round(sum / VITAMIN_KEYS.length) : 0;
}

/**
 * Ferma il bubbling verso il gestore swipe globale delle tab (non blocca scroll nativo).
 *
 * @param {TouchEvent | React.TouchEvent} e
 */
function blockTabSwipeBubble(e) {
  e.stopPropagation();
}

/**
 * @param {{
 *   label: string,
 *   color: string,
 *   borderClass: string,
 *   value: number | string,
 *   target: number | string,
 *   unit: string,
 *   onClick: () => void,
 * }} props
 */
function NutrientChip({ label, color, borderClass, value, target, unit, onClick }) {
  const blockTouchStartEnd = useCallback((e) => {
    blockTabSwipeBubble(e);
  }, []);

  const blockTouchMove = useCallback((e) => {
    blockTabSwipeBubble(e);
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${CHIP_CLASS} ${borderClass}`}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onClick();
        }
      }}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      onTouchStart={blockTouchStartEnd}
      onTouchMove={blockTouchMove}
      onTouchEnd={blockTouchStartEnd}
      onTouchCancel={blockTouchStartEnd}
    >
      <div
        style={{
          color,
          fontSize: '0.65rem',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          marginBottom: '4px',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
        {value}{' '}
        <span style={{ color: '#555', fontSize: '0.75rem' }}>
          / {target} {unit}
        </span>
      </div>
    </div>
  );
}

/**
 * Nastro orizzontale macro + micro + vitamine — layout compatto originale.
 *
 * @param {{
 *   totali?: Record<string, number>,
 *   targets?: Record<string, number>,
 *   targetProt: number,
 *   targetCarb: number,
 *   targetFat: number,
 *   onProteinClick: () => void,
 *   onCarbsClick: () => void,
 *   onFatClick: () => void,
 *   onMineralsClick: () => void,
 *   onVitaminsClick: () => void,
 * }} props
 */
export default function HomeNutrientStrip({
  totali = {},
  targets = {},
  targetProt,
  targetCarb,
  targetFat,
  onProteinClick,
  onCarbsClick,
  onFatClick,
  onMineralsClick,
  onVitaminsClick,
}) {
  const stripRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  const na = Number(totali.na) || 0;
  const k = Number(totali.k) || 0;
  const naKRatio = useMemo(() => {
    if (na <= 0) return k > 0 ? 2 : 0;
    return Math.round((k / na) * 100) / 100;
  }, [na, k]);

  const vitaminPct = useMemo(() => vitaminCompletionPct(totali, targets), [totali, targets]);

  const blockTouchStartEnd = useCallback((e) => {
    blockTabSwipeBubble(e);
  }, []);

  const blockTouchMove = useCallback((e) => {
    blockTabSwipeBubble(e);
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;

    const events = ['touchstart', 'touchend', 'touchcancel'];
    events.forEach((eventName) => {
      el.addEventListener(eventName, blockTabSwipeBubble, { passive: true });
    });

    return () => {
      events.forEach((eventName) => {
        el.removeEventListener(eventName, blockTabSwipeBubble);
      });
    };
  }, []);

  return (
    <div
      ref={stripRef}
      className="home-oggi-macros flex flex-nowrap overflow-x-auto gap-3 snap-x snap-mandatory"
      onTouchStart={blockTouchStartEnd}
      onTouchMove={blockTouchMove}
      onTouchEnd={blockTouchStartEnd}
      onTouchCancel={blockTouchStartEnd}
    >
      <NutrientChip
        label="Proteine"
        color="#b666d2"
        borderClass="border-[#b666d2]/35"
        value={Math.round(totali.prot || 0)}
        target={Math.round(targetProt)}
        unit="g"
        onClick={onProteinClick}
      />
      <NutrientChip
        label="Carboidrati"
        color="#00ff88"
        borderClass="border-[#00ff88]/35"
        value={Math.round(totali.carb || 0)}
        target={Math.round(targetCarb)}
        unit="g"
        onClick={onCarbsClick}
      />
      <NutrientChip
        label="Grassi"
        color="#ffd700"
        borderClass="border-[#ffd700]/35"
        value={Math.round(totali.fatTotal ?? totali.fat ?? 0)}
        target={Math.round(targetFat)}
        unit="g"
        onClick={onFatClick}
      />
      <NutrientChip
        label="Minerali"
        color="#2dd4bf"
        borderClass="border-[#2dd4bf]/35"
        value={naKRatio}
        target={2}
        unit="Na/K"
        onClick={onMineralsClick}
      />
      <NutrientChip
        label="Vitamine"
        color="#c4b5fd"
        borderClass="border-[#c4b5fd]/35"
        value={vitaminPct}
        target={100}
        unit="%"
        onClick={onVitaminsClick}
      />
    </div>
  );
}
